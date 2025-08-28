# tools/authz.py
from __future__ import annotations

import os
import time
import functools
from typing import Dict, Any, Callable, Optional, Set, Tuple

from flask import request, g, jsonify
from flask_login import current_user
from werkzeug.exceptions import Forbidden
from bson.objectid import ObjectId

# дружелюбный импорт db
try:
    from tools.db import db
except Exception:
    from db import db  # type: ignore

# ────────────────────────────────────────────────────────────────────────────────
# Конфиг
# ────────────────────────────────────────────────────────────────────────────────
SHADOW_MODE = os.getenv("AUTHZ_SHADOW", "false").lower() == "true"
AUTHZ_CACHE_TTL = int(os.getenv("AUTHZ_CACHE_TTL", "60"))  # сек кэша

# ────────────────────────────────────────────────────────────────────────────────
# Кэш (эффективные allow/deny)
# ────────────────────────────────────────────────────────────────────────────────
_caps_cache: Dict[str, Dict[str, Any]] = {}  # key -> {"caps": set[str], "deny": set[str], "ts": float}

def _cache_key(user_id: Any, company: Any) -> str:
    return f"{str(user_id)}:{str(company)}"

def invalidate_caps_cache(user_id: Any = None, company: Any = None):
    """Сбросить кэш (вызови после изменения ролей/оверрайдов)."""
    if user_id is None and company is None:
        _caps_cache.clear()
    else:
        _caps_cache.pop(_cache_key(user_id, company), None)

# ────────────────────────────────────────────────────────────────────────────────
# Subject (кто)
# ────────────────────────────────────────────────────────────────────────────────
def _subject() -> Dict[str, Any]:
    u = getattr(g, "user", None) or current_user
    if not u or not getattr(u, "is_authenticated", False):
        return {"auth": False}

    driver_id = getattr(u, "driver_id", None)
    if isinstance(driver_id, str):
        try:
            driver_id = ObjectId(driver_id)
        except Exception:
            driver_id = None

    # Мягко пытаемся найти связанную запись драйвера
    if driver_id is None:
        try:
            doc = db["drivers"].find_one({"user_id": getattr(u, "id", None)}, {"_id": 1})
            if doc:
                driver_id = doc.get("_id")
        except Exception:
            pass

    return {
        "auth": True,
        "user_id": getattr(u, "id", None) or getattr(u, "_id", None),
        "username": getattr(u, "username", None),
        "role": (getattr(u, "role", None) or "").lower(),  # legacy поле, может участвовать
        "company": getattr(u, "company", None),
        "driver_id": driver_id,
    }

# ────────────────────────────────────────────────────────────────────────────────
# Утилиты
# ────────────────────────────────────────────────────────────────────────────────
def _collections_available() -> Set[str]:
    try:
        return set(db.list_collection_names())
    except Exception:
        return set()

def _matches(cap_slug: str, pattern: str) -> bool:
    if pattern == cap_slug:
        return True
    if isinstance(pattern, str) and pattern.endswith("*"):
        return cap_slug.startswith(pattern[:-1])
    return False

def _is_denied(cap_slug: str, deny: Set[str]) -> bool:
    for d in deny:
        if _matches(cap_slug, d):
            return True
    return False

def _to_oid_or_str(v: Any) -> Tuple[Any, Any]:
    """Возвращает пару (as_oid, as_str) для удобных поисков."""
    if isinstance(v, ObjectId):
        return v, str(v)
    if isinstance(v, str):
        try:
            return ObjectId(v), v
        except Exception:
            return None, v
    return None, None

# ────────────────────────────────────────────────────────────────────────────────
# Загрузка политики ТОЛЬКО из БД (role_defs, user_roles, users)
# ────────────────────────────────────────────────────────────────────────────────
def _load_policy_from_db(user_id: Any, company: Any, legacy_role: str) -> Tuple[Set[str], Set[str]]:
    """
    Возвращает (caps_allow, caps_deny) для пользователя.
    Источники (в таком порядке, все в БД):
      1) user_roles.roles → role_defs.caps
         иначе legacy_role (users.role) → role_defs.caps (если такая роль есть в БД)
      2) user_roles.allow / user_roles.deny
      3) users.allow / users.deny
    Никаких словарей в коде: если нет role_defs — базовых прав с ролей не будет
    (но персональные allow/deny всё равно сработают).
    """
    caps: Set[str] = set()
    deny: Set[str] = set()

    cols = _collections_available()
    have_ur = "user_roles" in cols
    have_rd = "role_defs" in cols
    have_users = "users" in cols

    ur_coll = db["user_roles"] if have_ur else None
    rd_coll = db["role_defs"] if have_rd else None
    users_coll = db["users"] if have_users else None

    # 1) База прав из ролей: приоритет user_roles.roles, далее users.role (если есть в role_defs)
    user_roles_doc = None
    if ur_coll is not None:
        oid, s = _to_oid_or_str(user_id)
        if oid is not None:
            user_roles_doc = ur_coll.find_one({"user_id": oid, "company": company})
        if not user_roles_doc and s is not None:
            user_roles_doc = ur_coll.find_one({"user_id": s, "company": company})

    if user_roles_doc and user_roles_doc.get("roles") and rd_coll is not None:
        role_slugs = [str(x).lower() for x in user_roles_doc["roles"]]
        for r in rd_coll.find({"slug": {"$in": role_slugs}}):
            caps.update([str(c) for c in (r.get("caps") or [])])
    else:
        # legacy_role только если такая запись существует в role_defs
        if legacy_role and rd_coll is not None:
            rd_doc = rd_coll.find_one({"slug": legacy_role.lower()})
            if rd_doc and rd_doc.get("caps"):
                caps.update([str(c) for c in (rd_doc.get("caps") or [])])

    # 2) Персональные оверрайды из user_roles
    if user_roles_doc:
        allow_add = set([str(x) for x in (user_roles_doc.get("allow") or [])])
        deny_add  = set([str(x) for x in (user_roles_doc.get("deny")  or [])])
        caps |= allow_add
        deny |= deny_add

    # 3) Персональные оверрайды из users
    if users_coll is not None:
        oid, s = _to_oid_or_str(user_id)
        user_doc = None
        if oid is not None:
            user_doc = users_coll.find_one({"_id": oid}, {"allow": 1, "deny": 1})
        if not user_doc and s is not None:
            user_doc = users_coll.find_one({"_id": s}, {"allow": 1, "deny": 1})
        if user_doc:
            caps |= set([str(x) for x in (user_doc.get("allow") or [])])
            deny |= set([str(x) for x in (user_doc.get("deny")  or [])])

    return caps, deny

def _policy_for_user(subj: Dict[str, Any]) -> Tuple[Set[str], Set[str]]:
    key = _cache_key(subj.get("user_id"), subj.get("company"))
    now = time.time()
    cached = _caps_cache.get(key)
    if cached and (now - cached["ts"] < AUTHZ_CACHE_TTL):
        return cached["caps"], cached["deny"]

    caps, deny = _load_policy_from_db(subj.get("user_id"), subj.get("company"), subj.get("role"))
    _caps_cache[key] = {"caps": caps, "deny": deny, "ts": now}
    return caps, deny

# ────────────────────────────────────────────────────────────────────────────────
# PDP: решение по capability
# ────────────────────────────────────────────────────────────────────────────────
def decide(cap_slug: str, ctx: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    subj = _subject()
    if not subj.get("auth"):
        return {"allow": False, "reason": "unauthenticated", "subj": subj}

    caps, deny = _policy_for_user(subj)

    # 1) Персональный DENY имеет приоритет
    if _is_denied(cap_slug, deny):
        return {"allow": False, "reason": "user-deny", "subj": subj}

    # 2) ALLOW: прямой или по wildcard
    allow = False
    if "*" in caps:
        allow = True
    elif cap_slug in caps:
        allow = True
    else:
        for c in caps:
            if c.endswith("*") and cap_slug.startswith(c[:-1]):
                allow = True
                break

    return {"allow": allow, "reason": "db-only", "subj": subj}

# ────────────────────────────────────────────────────────────────────────────────
# Аудит
# ────────────────────────────────────────────────────────────────────────────────
def _audit(decision: Dict[str, Any], cap_slug: str, extra: Dict[str, Any] | None = None):
    try:
        db["audit_logs"].insert_one({
            "ts_unix": time.time(),
            "cap": cap_slug,
            "path": request.path,
            "method": request.method,
            "decision": decision.get("allow"),
            "reason": decision.get("reason"),
            "subj": {k: decision.get("subj", {}).get(k) for k in ("user_id", "username", "role", "company", "driver_id")},
            "extra": extra or {},
        })
    except Exception:
        pass

# ────────────────────────────────────────────────────────────────────────────────
# PEP-декоратор
# ────────────────────────────────────────────────────────────────────────────────
def require_cap(cap_slug: str):
    """
    Применяет решение PDP и, если SHADOW_MODE=false, возвращает 403 для API или
    возбуждает Forbidden() для HTML-ручек.
    """
    def deco(fn: Callable):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            decision = decide(cap_slug, ctx=None)
            if SHADOW_MODE:
                _audit(decision, cap_slug, {"shadow": True})
                return fn(*args, **kwargs)
            if not decision.get("allow"):
                _audit(decision, cap_slug)
                if request.path.startswith("/api/"):
                    return jsonify({"success": False, "error": "forbidden", "cap": cap_slug}), 403
                raise Forbidden()
            _audit(decision, cap_slug)
            return fn(*args, **kwargs)
        return wrapper
    return deco

# ────────────────────────────────────────────────────────────────────────────────
# Row-Level Security (пример для водителей / trucks:view)
# ────────────────────────────────────────────────────────────────────────────────
from datetime import datetime, timezone
def apply_authz_filter(resource: str, action: str, base_filter: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """
    Возвращает Mongo-фильтр (RLS).
      - всегда ограничиваем company субъектом;
      - для role=driver на trucks:view — только свой юнит (drivers.truck) или
        прямое назначение assigned_driver_id.
    """
    f = dict(base_filter or {})
    subj = _subject()

    # tenant guard
    if subj.get("company") is not None:
        f.setdefault("company", subj["company"])

    role = (subj.get("role") or "").lower()
    if resource == "trucks" and action == "view" and role == "driver" and subj.get("driver_id"):
        conds = []
        try:
            drv = db["drivers"].find_one({"_id": subj["driver_id"]}, {"truck": 1})
            if drv and drv.get("truck"):
                conds.append({"_id": drv["truck"]})
        except Exception:
            pass
        conds.append({"assigned_driver_id": subj["driver_id"]})
        f["$or"] = conds

    return f
