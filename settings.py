from __future__ import annotations
import re
from datetime import datetime
from typing import Dict, Any, List, Optional

from flask import Blueprint, render_template, request, jsonify, redirect, url_for
from flask_login import login_required, current_user
import pytz

# Mongo / utils
try:
    from bson import ObjectId
except Exception:
    class ObjectId(str):  # fallback
        pass

try:
    from tools.db import db
    from tools.authz import invalidate_caps_cache
except Exception:
    from db import db  # type: ignore
    def invalidate_caps_cache(*args, **kwargs):  # type: ignore
        pass

settings_bp = Blueprint("settings_bp", __name__, template_folder="templates")

# ────────────────────────────────────────────────────────────────────────────────
# Config
# ────────────────────────────────────────────────────────────────────────────────
SLUG_RE = re.compile(r"^[a-z][a-z0-9_:-]{1,99}$")
ADMIN_ROLES = {"admin", "superadmin"}
ORDERED_ROLES = ["admin", "dispatch", "accounting", "hr", "fleet_manager", "user", "driver", "superadmin"]

# чёрный список категорий для UI/каталога
HIDE_CATEGORIES_LOWER = {"fleet"}

# ────────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────────
def _current_company() -> Optional[str]:
    return getattr(current_user, "company", None) or getattr(current_user, "org", None)

def _current_user_oid() -> Optional[ObjectId]:
    # 1) get_id()
    try:
        val = current_user.get_id()  # type: ignore[attr-defined]
        if isinstance(val, str) and len(val) == 24:
            return ObjectId(val)
    except Exception:
        pass
    # 2) .id
    try:
        val = getattr(current_user, "id", None)
        if isinstance(val, ObjectId):
            return val
        if isinstance(val, str) and len(val) == 24:
            return ObjectId(val)
    except Exception:
        pass
    # 3) ._id
    try:
        val = getattr(current_user, "_id", None)
        if isinstance(val, ObjectId):
            return val
        if isinstance(val, str) and len(val) == 24:
            return ObjectId(val)
    except Exception:
        pass
    # 4) .user_id
    try:
        val = getattr(current_user, "user_id", None)
        if isinstance(val, ObjectId):
            return val
        if isinstance(val, str) and len(val) == 24:
            return ObjectId(val)
    except Exception:
        pass
    return None

def _is_admin() -> bool:
    """
    Можно сохранять права?
    1) роль/username: admin/superadmin;
    2) allow в user_roles: ['settings:permissions:write' | 'admin' | '*'];
    3) фолбэк (dev): True.
    """
    role = (getattr(current_user, "role", "") or "").lower()
    username = (getattr(current_user, "username", "") or "").lower()
    if role in ADMIN_ROLES or username in ADMIN_ROLES:
        return True

    user_id = _current_user_oid()
    company = _current_company()
    try:
        if user_id and company:
            doc = db["user_roles"].find_one({"user_id": user_id, "company": company}, {"allow": 1})
            allow = set((doc or {}).get("allow", []) or [])
            if any(x in allow for x in ("settings:permissions:write", "admin", "*")):
                return True
    except Exception:
        return True
    return True  # сделайте False, если нужно строго

def _ensure_indexes():
    names = set(db.list_collection_names())
    if "permission_defs" not in names:
        db.create_collection("permission_defs")
    if "role_defs" not in names:
        db.create_collection("role_defs")
    db["permission_defs"].create_index([("slug", 1)], unique=True)
    db["permission_defs"].create_index([("category", 1), ("group", 1), ("order", 1)])
    db["role_defs"].create_index([("slug", 1)], unique=True)

def _cat_visible(raw_cat: str | None) -> bool:
    name = (raw_cat or "General").strip().lower()
    return name not in HIDE_CATEGORIES_LOWER

def _fetch_catalog_from_db() -> List[Dict[str, Any]]:
    """
    Собираем каталог прав для UI.
    Специально ПЕРЕИМЕНОВЫВАЕМ категорию 'Fleet' (в любом регистре) в 'General',
    чтобы вкладка 'Fleet' не появлялась, но её права были видны в общем списке.
    """
    items = list(db["permission_defs"].find(
        {"enabled": {"$ne": False}},
        {"_id": 0, "slug": 1, "label": 1, "category": 1, "group": 1, "order": 1}
    ).sort([("category", 1), ("group", 1), ("order", 1), ("slug", 1)]))

    # Переносим все права из Fleet → General на уровне рендера
    RENAME_LOWER = {"fleet": "General"}

    by_cat: Dict[str, Dict[str, Any]] = {}
    for it in items:
        raw_cat = (it.get("category") or "General").strip()
        cat = RENAME_LOWER.get(raw_cat.lower(), raw_cat)  # 'fleet' → 'General'
        grp = (it.get("group") or "Common").strip()

        node = by_cat.setdefault(cat, {"category": cat, "groups": {}})
        g = node["groups"].setdefault(grp, {"group": grp, "items": []})
        g["items"].append({
            "slug": it["slug"],
            "label": (it.get("label") or it["slug"]).strip()
        })

    out = []
    for cat, node in by_cat.items():
        groups_arr = list(node["groups"].values())
        groups_arr.sort(key=lambda x: x["group"])
        out.append({"category": cat, "groups": groups_arr})
    out.sort(key=lambda x: x["category"])
    return out

def _sorted_roles() -> List[str]:
    roles = []
    for r in db["role_defs"].find({}, {"_id": 0, "slug": 1}):
        slug = (r.get("slug") or "").lower()
        if slug == "superadmin":
            continue
        roles.append(slug)
    roles = sorted(roles, key=lambda x: (ORDERED_ROLES.index(x) if x in ORDERED_ROLES else 999, x))
    return roles

def _role_caps_map() -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for r in db["role_defs"].find({}, {"_id": 0}):
        s = (r.get("slug") or "").lower()
        if s == "superadmin":
            continue
        out[s] = sorted(list(set(r.get("caps") or [])))
    return out

def _known_caps() -> set[str]:
    return set(p["slug"] for p in db["permission_defs"].find({}, {"slug": 1, "_id": 0}))

# ────────────────────────────────────────────────────────────────────────────────
# Pages
# ────────────────────────────────────────────────────────────────────────────────
@settings_bp.route("/settings")
@login_required
def settings_root():
    return redirect(url_for("settings_bp.settings_timezone"))

@settings_bp.route("/settings/timezone")
@login_required
def settings_timezone():
    partial = request.args.get("partial") == "1"
    company = _current_company()
    tz_doc = db["company_timezone"].find_one({"company": company}) if company else None
    current_tz = (tz_doc or {}).get("timezone", "America/Chicago")
    if partial:
        return render_template("settings/timezone.html", current_tz=current_tz)
    return render_template("settings.html", active_tab="timezone", current_tz=current_tz)

@settings_bp.route("/settings/permissions")
@login_required
def settings_permissions():
    partial = request.args.get("partial") == "1"
    _ensure_indexes()
    roles = _sorted_roles()
    categories = _fetch_catalog_from_db()
    role_caps = _role_caps_map()

    if partial:
        return render_template("settings/permissions.html",
                               roles=roles, categories=categories, role_caps=role_caps)
    return render_template("settings.html",
                           active_tab="permissions", roles=roles, categories=categories, role_caps=role_caps)

# ────────────────────────────────────────────────────────────────────────────────
# Timezone API
# ────────────────────────────────────────────────────────────────────────────────
@settings_bp.route("/api/settings/timezones", methods=["GET"])
@login_required
def api_list_timezones():
    zones = sorted([z for z in pytz.all_timezones if z.startswith("America/")])
    return jsonify({"success": True, "timezones": zones})

@settings_bp.route("/api/settings/timezone", methods=["POST"])
@login_required
def api_set_timezone():
    data = request.get_json(force=True, silent=True) or {}
    tz = data.get("timezone")
    if not tz or tz not in pytz.all_timezones:
        return jsonify({"success": False, "error": "Invalid timezone"}), 400
    company = _current_company()
    if not company:
        return jsonify({"success": False, "error": "No company in context"}), 400
    db["company_timezone"].update_one(
        {"company": company},
        {"$set": {"company": company, "timezone": tz, "updated_at": datetime.utcnow()}},
        upsert=True
    )
    return jsonify({"success": True, "timezone": tz})

# ────────────────────────────────────────────────────────────────────────────────
# AuthZ: Catalog & Roles
# ────────────────────────────────────────────────────────────────────────────────
@settings_bp.route("/api/authz/permissions", methods=["GET"])
@login_required
def api_perm_list():
    """
    Возвращаем полный список прав (без скрытия категорий).
    UI всё равно отображает 'Fleet' как 'General'.
    """
    _ensure_indexes()
    docs = list(db["permission_defs"].find(
        {}, {"_id": 0}
    ).sort([("category", 1), ("group", 1), ("order", 1), ("slug", 1)]))
    return jsonify({"success": True, "permissions": docs})

@settings_bp.route("/api/authz/catalog", methods=["GET"])
@login_required
def api_authz_catalog():
    _ensure_indexes()
    roles = _sorted_roles()
    cats = _fetch_catalog_from_db()
    return jsonify({"success": True, "roles": roles, "categories": cats})

@settings_bp.route("/api/authz/roles", methods=["GET"])
@login_required
def api_authz_roles_get():
    _ensure_indexes()
    out = {}
    for r in db["role_defs"].find({}, {"_id": 0}):
        out[(r.get("slug") or "").lower()] = sorted(list(set(r.get("caps") or [])))
    return jsonify({"success": True, "roles": out})

@settings_bp.route("/api/authz/roles", methods=["POST"])
@login_required
def api_authz_roles_set():
    if not _is_admin():
        return jsonify({"success": False, "error": "forbidden"}), 403

    data = request.get_json(force=True, silent=True) or {}
    roles = data.get("roles")
    if not isinstance(roles, dict):
        return jsonify({"success": False, "error": "roles must be an object"}), 400

    _ensure_indexes()
    known = _known_caps()

    for slug, caps in roles.items():
        s = (slug or "").lower().strip()
        if s == "superadmin":
            continue
        if not isinstance(caps, list):
            return jsonify({"success": False, "error": f"role {s}: caps must be a list"}), 400
        cleaned = []
        for c in caps:
            if not isinstance(c, str):
                continue
            c = c.strip()
            if c == "*" or c in known:
                cleaned.append(c)
        db["role_defs"].update_one(
            {"slug": s},
            {"$set": {"caps": sorted(list(set(cleaned)))}},
            upsert=True
        )

    invalidate_caps_cache()
    return jsonify({"success": True})

# ────────────────────────────────────────────────────────────────────────────────
# AuthZ: Users (персональные allow/deny)
# ────────────────────────────────────────────────────────────────────────────────
@settings_bp.route("/api/authz/users", methods=["GET"])
@login_required
def api_authz_users():
    """
    Список пользователей компании для выбора в UI.
    Параметр q — опциональный поиск по username/real_name/email (регистронезависимо).
    """
    company = _current_company()
    if not company:
        return jsonify({"success": False, "error": "No company in context"}), 400

    q = (request.args.get("q") or "").strip()
    filt: Dict[str, Any] = {"company": company}
    if q:
        filt["$or"] = [
            {"username": {"$regex": q, "$options": "i"}},
            {"real_name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    cur = db["users"].find(filt, {"_id": 1, "username": 1, "real_name": 1, "role": 1}).sort([("username", 1)]).limit(200)
    users = [{"_id": str(d["_id"]), "username": d.get("username"), "real_name": d.get("real_name"), "role": d.get("role")} for d in cur]
    return jsonify({"success": True, "users": users})

@settings_bp.route("/api/authz/user_caps", methods=["GET"])
@login_required
def api_authz_user_caps_get():
    """
    Получаем allow/deny и роль пользователя (для расчёта inherit).
    """
    company = _current_company()
    if not company:
        return jsonify({"success": False, "error": "No company in context"}), 400

    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "user_id is required"}), 400

    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({"success": False, "error": "invalid user_id"}), 400

    user = db["users"].find_one({"_id": oid, "company": company}, {"role": 1, "allow": 1, "deny": 1})
    if not user:
        return jsonify({"success": False, "error": "user not found"}), 404

    return jsonify({
        "success": True,
        "role": (user.get("role") or "").lower(),
        "allow": list(user.get("allow") or []),
        "deny": list(user.get("deny") or []),
    })

@settings_bp.route("/api/authz/user_caps", methods=["POST"])
@login_required
def api_authz_user_caps_set():
    """
    Сохраняем allow/deny для конкретного пользователя.
    """
    if not _is_admin():
        return jsonify({"success": False, "error": "forbidden"}), 403

    company = _current_company()
    if not company:
        return jsonify({"success": False, "error": "No company in context"}), 400

    payload = request.get_json(force=True, silent=True) or {}
    user_id = payload.get("user_id")
    allow = payload.get("allow", [])
    deny  = payload.get("deny", [])

    if not user_id:
        return jsonify({"success": False, "error": "user_id is required"}), 400
    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({"success": False, "error": "invalid user_id"}), 400
    if not isinstance(allow, list) or not isinstance(deny, list):
        return jsonify({"success": False, "error": "allow/deny must be arrays"}), 400

    _ensure_indexes()
    known = _known_caps()
    def _clean(arr):
        out = []
        for c in arr:
            if not isinstance(c, str):
                continue
            c = c.strip()
            if c == "*" or c in known:
                out.append(c)
        return sorted(list(set(out)))

    allow_clean = _clean(allow)
    deny_clean  = _clean(deny)

    # Нельзя одновременно указывать один и тот же slug в allow и deny → отдадим приоритет deny
    allow_clean = [c for c in allow_clean if c not in set(deny_clean)]

    res = db["users"].update_one(
        {"_id": oid, "company": company},
        {"$set": {"allow": allow_clean, "deny": deny_clean, "updated_at": datetime.utcnow()}},
    )
    if res.matched_count == 0:
        return jsonify({"success": False, "error": "user not found"}), 404

    invalidate_caps_cache()
    return jsonify({"success": True})
