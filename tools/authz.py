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

# =========================
# Конфиг
# =========================
SHADOW_MODE = os.getenv("AUTHZ_SHADOW", "false").lower() == "true"
AUTHZ_CACHE_TTL = int(os.getenv("AUTHZ_CACHE_TTL", "60"))  # сек кэша

# =========================
# Кэш (эффективные allow + deny)
# =========================
_caps_cache: Dict[str, Dict[str, Any]] = {}  # key -> {"caps": set[str], "deny": set[str], "ts": float}

def _cache_key(user_id: Any, company: Any) -> str:
    return f"{str(user_id)}:{str(company)}"

def invalidate_caps_cache(user_id: Any = None, company: Any = None):
    """Сбросить кэш (вызывай после изменений ролей/оверрайдов)."""
    if user_id is None and company is None:
        _caps_cache.clear()
    else:
        _caps_cache.pop(_cache_key(user_id, company), None)

# =========================
# Subject (кто)
# =========================
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
        "role": (getattr(u, "role", None) or "").lower(),   # legacy single-role
        "company": getattr(u, "company", None),
        "driver_id": driver_id,
    }

# =========================
# Фоллбек ролей → капабилити
# =========================
FALLBACK_ROLE_CAPS = {
    "superadmin": {"*"},
    "admin":     {"trucks:view", "trucks:create", "trucks:delete", "trucks:file:view", "trucks:assign"},
    "dispatch":  {"trucks:view", "trucks:file:view", "trucks:assign"},
    "user":      {"trucks:view"},
    "driver":    {"trucks:view", "trucks:file:view"},
}

def _caps_from_fallback(role: str) -> Set[str]:
    return set(FALLBACK_ROLE_CAPS.get((role or "").lower(), set()))

# =========================
# Wildcard-утилиты
# =========================
def _matches(cap_slug: str, pattern: str) -> bool:
    if pattern == cap_slug:
        return True
    if pattern.endswith("*"):
        prefix = pattern[:-1]
        return cap_slug.startswith(prefix)
    return False

def _is_denied(cap_slug: str, deny: Set[str]) -> bool:
    for d in deny:
        if _matches(cap_slug, d):
            return True
    return False

def _collections_available() -> Set[str]:
    try:
        return set(db.list_collection_names())
    except Exception:
        return set()

# =========================
# Загрузка политик из БД с оверрайдами
# (user_roles + role_defs) + ПОДДЕРЖКА users.allow/users.deny
# =========================
def _to_oid_or_str(v: Any) -> Tuple[Any, Any]:
    """
    Возвращает пару (as_oid, as_str) для удобного поиска.
    """
    as_oid = None
    as_str = None
    if isinstance(v, ObjectId):
        as_oid = v
        as_str = str(v)
    elif isinstance(v, str):
        as_str = v
        try:
            as_oid = ObjectId(v)
        except Exception:
            as_oid = None
    return as_oid, as_str

def _load_policy_from_db(user_id: Any, company: Any, legacy_role: str) -> Tuple[Set[str], Set[str]]:
    """
    Возвращает (caps_allow, caps_deny) для пользователя внутри компании.
    Источники (в таком порядке):
      1) user_roles.roles → role_defs.caps   (если есть user_roles)
         иначе legacy_role (users.role) → role_defs или фоллбек-словарь.
      2) user_roles.allow / user_roles.deny  (персональные оверрайды)
      3) users.allow / users.deny            (ПОДДЕРЖАНО ТЕПЕРЬ как фоллбек-персона)
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

    # --- База caps: роли из user_roles или legacy_role ---
    if have_ur and have_rd:
        # ищем user_roles с гибкой проверкой типов user_id
        oid, s = _to_oid_or_str(user_id)
        user_roles_doc = None
        if oid is not None:
            user_roles_doc = ur_coll.find_one({"user_id": oid, "company": company})
        if not user_roles_doc and s is not None:
            user_roles_doc = ur_coll.find_one({"user_id": s, "company": company})

        if user_roles_doc and user_roles_doc.get("roles"):
            role_slugs = [str(x).lower() for x in user_roles_doc["roles"]]
            for r in rd_coll.find({"slug": {"$in": role_slugs}}):
                caps.update([str(c) for c in (r.get("caps") or [])])
        else:
            # legacy_role через role_defs → иначе фоллбек-словарь
            if legacy_role and have_rd:
                rd_doc = rd_coll.find_one({"slug": legacy_role.lower()})
                if rd_doc and rd_doc.get("caps"):
                    caps.update([str(c) for c in (rd_doc.get("caps") or [])])
                else:
                    caps.update(_caps_from_fallback(legacy_role))
            else:
                caps.update(_caps_from_fallback(legacy_role))
    else:
        # нет коллекций политик — чистый фоллбек
        caps.update(_caps_from_fallback(legacy_role))

    # --- Персональные оверрайды из user_roles (если есть doc) ---
    if have_ur:
        oid, s = _to_oid_or_str(user_id)
        user_roles_doc = None
        if oid is not None:
            user_roles_doc = db["user_roles"].find_one({"user_id": oid, "company": company})
        if not user_roles_doc and s is not None:
            user_roles_doc = db["user_roles"].find_one({"user_id": s, "company": company})

        if user_roles_doc:
            allow_add = set([str(x) for x in (user_roles_doc.get("allow") or [])])
            deny_add  = set([str(x) for x in (user_roles_doc.get("deny")  or [])])
            caps |= allow_add
            deny |= deny_add

    # --- Персональные оверрайды ИЗ users (как у тебя у Olena) ---
    if have_users:
        oid, s = _to_oid_or_str(user_id)
        user_doc = None
        if oid is not None:
            user_doc = users_coll.find_one({"_id": oid}, {"allow": 1, "deny": 1})
        if not user_doc and s is not None:
            user_doc = users_coll.find_one({"_id": s}, {"allow": 1, "deny": 1})

        if user_doc:
            allow_add_u = set([str(x) for x in (user_doc.get("allow") or [])])
            deny_add_u  = set([str(x) for x in (user_doc.get("deny")  or [])])
            caps |= allow_add_u
            deny |= deny_add_u

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

# =========================
# PDP: решение по capability
# =========================
def decide(cap_slug: str, ctx: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    subj = _subject()
    if not subj.get("auth"):
        return {"allow": False, "reason": "unauthenticated", "subj": subj}

    caps, deny = _policy_for_user(subj)

    # 1) Персональный DENY перекрывает всё
    if _is_denied(cap_slug, deny):
        return {"allow": False, "reason": "user-deny", "subj": subj}

    # 2) ALLOW (прямой или по wildcard)
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

    return {"allow": allow, "reason": "db-rbac-overrides" if caps else "role-fallback", "subj": subj}

# =========================
# Аудит
# =========================
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

# =========================
# PEP-декоратор
# =========================
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

# =========================
# Row-Level Security (фильтр)
# =========================
from datetime import datetime, timezone
def apply_authz_filter(resource: str, action: str, base_filter: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """
    Возвращает Mongo-фильтр (RLS).
    Минимум:
      - ограничение по company
      - для role=driver на trucks:view — только свой юнит (drivers.truck) или прямое назначение assigned_driver_id
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
