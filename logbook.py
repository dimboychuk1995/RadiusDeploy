from flask import Blueprint, render_template
from flask_login import login_required

logbook = Blueprint("logbook", __name__)

@logbook.route("/fragment/logbook")
@login_required
def fragment_logbook():
    return render_template("fragments/logbook_fragment.html")