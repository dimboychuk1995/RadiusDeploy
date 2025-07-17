#  tools/mapbox_api.py

from flask import Blueprint, jsonify
from tools.db import db

mapbox_api_bp = Blueprint("mapbox_api", __name__)

def get_mapbox_token():
    """
    Получает Mapbox access token из базы данных (integrations_settings).
    """
    try:
        doc = db["integrations_settings"].find_one({"name": "MapBox"})
        return doc.get("api_key") if doc else None
    except Exception as e:
        print(f"❌ Ошибка при получении Mapbox токена: {e}")
        return None

@mapbox_api_bp.route("/api/mapbox_token")
def api_mapbox_token():
    """
    API-роут для получения Mapbox токена через JavaScript.
    """
    token = get_mapbox_token()
    if token:
        return jsonify({"success": True, "token": token})
    return jsonify({"success": False, "message": "API token not found"}), 404