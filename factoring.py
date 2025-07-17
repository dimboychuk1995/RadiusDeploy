from flask import Blueprint, render_template
from flask_login import login_required

factoring_bp = Blueprint("factoring", __name__)

@factoring_bp.route("/fragment/factoring_fragment")
@login_required
def factoring_fragment():
    return render_template("fragments/factoring_fragment.html")