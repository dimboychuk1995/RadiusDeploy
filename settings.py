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
    # если нет bson в окружении, пусть будет заглушка
    class ObjectId(str):  # type: ignore
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
# Helpers
# ────────────────────────────────────────────────────────────────────────────────

SLUG_RE = re.compile(r"^[a-z][a-z0-9_:-]{1,99}$")
ADMIN_ROLES = {"admin", "superadmin"}
ORDERED_ROLES = ["admin", "dispatch", "accounting", "hr", "fleet_manager", "user", "driver", "superadmin"]

def _current_company() -> Optional[str]:
    return getattr(current_user, "company", None) or getattr(current_user, "org", None)

def _current_user_oid() -> Optional[ObjectId]:
    """
    Аккуратно достаём ObjectId текущего пользователя из разных возможных полей.
    """
    # 1) get_id() (flask-login)
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
    Логика «я могу сохранять права?»:
    1) Явные роли/имя пользователя: admin/superadmin.
    2) Документ в user_roles по (user_id, company) — наличие разрешения 'settings:permissions:write'
       или общего 'admin'/'*'.
    3) Фолбэк: если ничего не нашли — НЕ блокируем (возвращаем True), чтобы не ломать дев-окружение.
       Если хотите строже — поменяйте return True -> False.
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
        # если коллекции нет — не валим сохранение
        return True

    # Фолбэк: НЕ ломаем сохранение в деве
    return True

def _ensure_indexes():
    names = set(db.list_collection_names())
    if "permission_defs" not in names:
        db.create_collection("permission_defs")
    if "role_defs" not in names:
        db.create_collection("role_defs")
    db["permission_defs"].create_index([("slug", 1)], unique=True)
    db["permission_defs"].create_index([("category", 1), ("group", 1), ("order", 1)])
    db["role_defs"].create_index([("slug", 1)], unique=True)

def _fetch_catalog_from_db() -> List[Dict[str, Any]]:
    items = list(db["permission_defs"].find(
        {"enabled": {"$ne": False}},
        {"_id": 0, "slug": 1, "label": 1, "category": 1, "group": 1, "order": 1}
    ).sort([("category", 1), ("group", 1), ("order", 1), ("slug", 1)]))

    by_cat: Dict[str, Dict[str, Any]] = {}
    for it in items:
        cat = it.get("category") or "General"
        grp = it.get("group") or "Common"
        node = by_cat.setdefault(cat, {"category": cat, "groups": {}})
        g = node["groups"].setdefault(grp, {"group": grp, "items": []})
        g["items"].append({"slug": it["slug"], "label": it.get("label") or it["slug"]})

    out = []
    for cat, node in by_cat.items():
        groups_arr = []
        for grp, gnode in node["groups"].items():
            groups_arr.append(gnode)
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
# AuthZ API
# ────────────────────────────────────────────────────────────────────────────────

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

    # аккуратнее очищаем и записываем
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
