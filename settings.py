from __future__ import annotations

from flask import Blueprint, render_template, request, jsonify, redirect, url_for
from flask_login import login_required, current_user
from datetime import datetime
import pytz

try:
    from tools.db import db
except Exception:
    from db import db  # type: ignore

settings_bp = Blueprint("settings_bp", __name__, template_folder="templates")

# ---------- Страницы Settings ----------

@settings_bp.route("/settings")
@login_required
def settings_root():
    # по умолчанию ведём на таймзону
    return redirect(url_for("settings_bp.settings_timezone"))

@settings_bp.route("/settings/timezone")
@login_required
def settings_timezone():
    """
    Режимы:
      - full HTML (без ?partial=1): рендерим settings.html с активной вкладкой timezone
      - partial (?partial=1): отдаём только тело вкладки для AJAX-подмены
    """
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
    """
    Аналогично timezone: full или partial.
    """
    partial = request.args.get("partial") == "1"
    # На будущее можно отдать набор разрешений/ролей из БД.
    # Пока отдаем пустые структуры-заглушки.
    role_defs = list(db["role_defs"].find({}, {"_id": 0})) if "role_defs" in db.list_collection_names() else []
    if partial:
        return render_template("settings/permissions.html", role_defs=role_defs)
    return render_template("settings.html", active_tab="permissions", role_defs=role_defs)

# ---------- API: Timezone ----------

@settings_bp.route("/api/settings/timezones", methods=["GET"])
@login_required
def api_list_timezones():
    # можно ограничить США, как у тебя было; оставлю пример с America/*
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
