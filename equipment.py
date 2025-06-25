from flask import Blueprint, render_template
from flask_login import login_required

equipment_bp = Blueprint('equipment', __name__)

@equipment_bp.route("/fragment/equipment")
@login_required
def equipment_fragment():
    return render_template("fragments/equipment_fragment.html")