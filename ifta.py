# ifta.py

from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required
from tools.db import db  # или конкретная коллекция, если ты её заранее определил

ifta_bp = Blueprint('ifta', __name__)

@ifta_bp.route("/fragment/safety_ifta")
@login_required
def safety_ifta_fragment():
    return render_template("fragments/safety_ifta.html")