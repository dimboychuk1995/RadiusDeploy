# ifta.py

from flask import Blueprint, jsonify, render_template
from flask_login import login_required
from bson import ObjectId
from tools.db import db, integrations_db
import requests

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



@ifta_bp.route("/api/ifta/trucks/<parent_name>/<name>")
@login_required
def get_ifta_trucks(parent_name, name):
    parent_name = parent_name.strip()
    name = name.strip()

    # Шаг 1: Найти источник из catalog по имени и категории
    catalog = integrations_db['integrations_catalog'].find_one({
        "name": {"$regex": f"^{parent_name}$", "$options": "i"},
        "category": "ELD"
    })

    if not catalog:
        return jsonify({"error": f"Источник '{parent_name}' не найден в catalog"}), 404

    parent_id = catalog["_id"]
    source_name = catalog["name"].lower()

    # Шаг 2: Найти интеграцию по name и parentId
    integration = db['integrations_settings'].find_one({
        "name": {"$regex": f"^{name}$", "$options": "i"},
        "parentId": parent_id
    })

    if not integration:
        return jsonify({"error": f"Интеграция '{name}' не найдена под источником '{catalog['name']}'"}), 404

    # Шаг 3: Выбор обработчика по источнику
    if source_name in ["alfa eld", "alpha eld"]:
        return get_trucks_from_alpha_eld(integration)

    return jsonify({"error": f"Источник '{source_name}' пока не поддерживается"}), 400


def get_trucks_from_alpha_eld(integration):
    token = integration.get("api_key")
    if not token:
        return jsonify({"error": "API ключ отсутствует в интеграции"}), 400

    try:
        response = requests.get(
            f"https://alfaeld.com/extapi/asset/trucks?token={token}",
            timeout=10
        )
        response.raise_for_status()
        return jsonify(response.json())
    except requests.RequestException as e:
        return jsonify({"error": f"Ошибка при запросе к Alpha ELD: {str(e)}"}), 500