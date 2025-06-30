from flask import Blueprint, render_template
from flask_login import login_required
from flask import jsonify

settings_bp = Blueprint('settings_bp', __name__)

@settings_bp.route('/settings')
@login_required
def settings():
    return render_template('settings.html')

@settings_bp.route('/api/settings/timezones')
@login_required
def timezone_api():
    us_timezones = [
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Phoenix",
        "America/Los_Angeles",
        "America/Anchorage",
        "America/Adak",
        "Pacific/Honolulu"
    ]
    return jsonify(us_timezones)
