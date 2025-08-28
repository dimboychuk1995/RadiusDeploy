from __future__ import annotations
import re
from datetime import datetime
from typing import Dict, Any, List

from flask import Blueprint, render_template, request, jsonify, redirect, url_for
from flask_login import login_required, current_user
import pytz

try:
    from tools.db import db
    from tools.authz import invalidate_caps_cache
except Exception:
    from db import db  # type: ignore
    def invalidate_caps_cache(*args, **kwargs):  # type: ignore
        pass

settings_bp = Blueprint("settings_bp", __name__, template_folder="templates")

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
    company = getattr(current_user, "company", None)
    tz_doc = db["company_timezone"].find_one({"company": company}) if company else None
    current_tz = (tz_doc or {}).get("timezone", "America/Chicago")
    if partial:
        return render_template("settings/timezone.html", current_tz=current_tz)
    return render_template("settings.html", active_tab="timezone", current_tz=current_tz)

@settings_bp.route("/settings/permissions")
@login_required
def settings_permissions():
    partial = request.args.get("partial") == "1"
    if partial:
        return render_template("settings/permissions.html")
    return render_template("settings.html", active_tab="permissions")

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
    company = getattr(current_user, "company", None)
    if not company:
        return jsonify({"success": False, "error": "No company in context"}), 400
    db["company_timezone"].update_one(
        {"company": company},
        {"$set": {"company": company, "timezone": tz, "updated_at": datetime.utcnow()}},
        upsert=True
    )
    return jsonify({"success": True, "timezone": tz})

# ────────────────────────────────────────────────────────────────────────────────
# AuthZ — DB-backed catalog & roles
# ────────────────────────────────────────────────────────────────────────────────
SLUG_RE = re.compile(r"^[a-z][a-z0-9_:-]{1,99}$")
ADMIN_ROLES = {"admin", "superadmin"}
ORDERED_ROLES = ["admin", "dispatch", "accounting", "hr", "fleet_manager", "user", "driver", "superadmin"]

def _is_admin() -> bool:
    role = (getattr(current_user, "role", "") or "").lower()
    username = (getattr(current_user, "username", "") or "").lower()
    return role in ADMIN_ROLES or username in ADMIN_ROLES

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

def _known_caps() -> set[str]:
    return set(p["slug"] for p in db["permission_defs"].find({}, {"slug": 1, "_id": 0}))

@settings_bp.route("/api/authz/catalog", methods=["GET"])
@login_required
def api_authz_catalog():
    _ensure_indexes()
    roles = []
    for r in db["role_defs"].find({}, {"_id": 0, "slug": 1}):
        slug = (r.get("slug") or "").lower()
        if slug == "superadmin":
            continue
        roles.append(slug)
    roles = sorted(roles, key=lambda x: (ORDERED_ROLES.index(x) if x in ORDERED_ROLES else 999, x))
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
        db["role_defs"].update_one({"slug": s}, {"$set": {"caps": sorted(list(set(cleaned)))}}, upsert=True)

    invalidate_caps_cache()
    return jsonify({"success": True})

# (опционально) CRUD по каталогу — оставляю, если нужно будет редактировать список cap'ов
@settings_bp.route("/api/authz/permissions", methods=["GET"])
@login_required
def api_perm_list():
    _ensure_indexes()
    docs = list(db["permission_defs"].find({}, {"_id": 0}).sort([("category",1),("group",1),("order",1),("slug",1)]))
    return jsonify({"success": True, "permissions": docs})

@settings_bp.route("/api/authz/permissions", methods=["POST"])
@login_required
def api_perm_bulk_upsert():
    if not _is_admin():
        return jsonify({"success": False, "error": "forbidden"}), 403

    payload = request.get_json(force=True, silent=True) or {}
    items = payload.get("permissions")
    mode = (payload.get("mode") or "merge").lower()
    if not isinstance(items, list):
        return jsonify({"success": False, "error": "permissions must be a list"}), 400

    _ensure_indexes()
    seen = set()
    for it in items:
        if not isinstance(it, dict):
            continue
        slug = (it.get("slug") or "").strip()
        if not SLUG_RE.match(slug):
            return jsonify({"success": False, "error": f"invalid slug: {slug}"}), 400
        seen.add(slug)
        doc = {
            "slug": slug,
            "label": (it.get("label") or slug).strip(),
            "category": (it.get("category") or "General").strip(),
            "group": (it.get("group") or "Common").strip(),
            "order": int(it.get("order") or 0),
            "enabled": bool(it.get("enabled") if "enabled" in it else True),
            "updated_at": datetime.utcnow()
        }
        db["permission_defs"].update_one({"slug": slug}, {"$set": doc, "$setOnInsert": {"created_at": datetime.utcnow()}}, upsert=True)

    if mode == "replace":
        db["permission_defs"].delete_many({"slug": {"$nin": list(seen)}})

    return jsonify({"success": True})
