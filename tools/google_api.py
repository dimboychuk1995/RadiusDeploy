#  tools/google_api.py

from flask import Blueprint, jsonify
from tools.db import db

google_api_bp = Blueprint("google_api", __name__)

def get_google_maps_api_key():
    """
    Получает ключ Google Maps API из базы данных (integrations_settings).
    """
    try:
        doc = db["integrations_settings"].find_one({"name": "Google Maps API"})
        return doc.get("api_key") if doc else None
    except Exception as e:
        print(f"❌ Ошибка при получении Google Maps ключа: {e}")
        return None

@google_api_bp.route("/api/google_maps_key")
def api_google_maps_key():
    """
    API-роут для получения Google Maps ключа через JavaScript.
    """
    key = get_google_maps_api_key()
    if key:
        return jsonify({"success": True, "key": key})
    return jsonify({"success": False, "message": "API key not found"}), 404