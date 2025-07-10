from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required
from tools.db import db

settings_bp = Blueprint('settings_bp', __name__)

@settings_bp.route('/settings')
@login_required
def settings():
    tz_doc = db.company_timezone.find_one({})
    current_tz = tz_doc["timezone"] if tz_doc else None
    return render_template("settings.html", current_timezone=current_tz)

@settings_bp.route('/api/settings/timezones')
@login_required
def timezone_list():
    us_timezones = [
        "America/New_York", "America/Chicago", "America/Denver",
        "America/Phoenix", "America/Los_Angeles", "America/Anchorage",
        "America/Adak", "Pacific/Honolulu"
    ]
    return jsonify(us_timezones)

@settings_bp.route('/api/settings/timezone', methods=['POST'])
@login_required
def save_company_timezone():
    data = request.get_json()
    timezone = data.get("timezone")

    if not timezone:
        return jsonify({"error": "No timezone provided"}), 400

    db.company_timezone.update_one(
        {},  # <== без фильтра, будет одна запись
        {"$set": {"timezone": timezone}},
        upsert=True
    )

    return jsonify({"message": "Timezone saved successfully"})
