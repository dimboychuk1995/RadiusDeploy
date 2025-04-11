from flask import Blueprint, render_template
from flask_login import login_required

samsara_bp = Blueprint('samsara', __name__)

@samsara_bp.route("/fragment/samsara_fragment")
@login_required
def samsara_fragment():
    return render_template("fragments/samsara_fragment.html")
