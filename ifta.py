# ifta.py

from flask import Blueprint, jsonify, render_template
from flask_login import login_required
from bson import ObjectId
from tools.db import db, integrations_db

ifta_bp = Blueprint('ifta', __name__)

@ifta_bp.route("/fragment/safety_ifta")
@login_required
def safety_ifta_fragment():
    return render_template("fragments/safety_ifta.html")

@ifta_bp.route("/api/ifta/integrations")
@login_required
def get_ifta_integrations():
    # Шаг 1: найти все ELD в catalog
    eld_catalogs = list(integrations_db['integrations_catalog'].find({"category": "ELD"}))
    eld_ids = [item['_id'] for item in eld_catalogs]
    id_to_name = {item['_id']: item['name'] for item in eld_catalogs}

    # Шаг 2: найти в settings, где parentId в этих id
    settings = list(db['integrations_settings'].find({"parentId": {"$in": eld_ids}}))

    # Шаг 3: собрать результат
    result = []
    for item in settings:
        parent_id = item.get('parentId')
        result.append({
            "name": item.get("name"),
            "api_key": item.get("api_key"),
            "parent_name": id_to_name.get(parent_id, "Unknown")
        })

    return jsonify(result)