from flask import Blueprint, render_template
from flask_login import login_required

dispatch_schedule_bp = Blueprint("dispatch_schedule", __name__)

@dispatch_schedule_bp.route("/fragment/dispatch_schedule")
@login_required
def dispatch_schedule_fragment():
    return render_template("fragments/dispatch_schedule_fragment.html")