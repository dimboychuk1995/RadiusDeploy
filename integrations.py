from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import current_user
from functools import wraps

from tools.db import db, integrations_db

integrations_bp = Blueprint('integrations', __name__)
integrations_collection = db['integrations_settings']
catalog_collection = integrations_db['integrations_catalog']

# Декоратор для админа
def requires_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'admin':
            abort(403)
        return f(*args, **kwargs)
    return decorated_function

# Рендер страницы
@integrations_bp.route("/integrations")
@requires_admin
def integrations():
    all_integrations = list(integrations_collection.find())
    catalog_integrations = list(catalog_collection.find())

    # Удалим ObjectId из каждого объекта
    for doc in all_integrations:
        doc.pop('_id', None)
    for doc in catalog_integrations:
        doc.pop('_id', None)

    return render_template(
        "integrations.html",
        integrations=all_integrations,
        catalog=catalog_integrations
    )

# API для обновления статуса Samsara
@integrations_bp.route("/api/integrations/samsara", methods=["POST"])
@requires_admin
def update_samsara_status():
    data = request.get_json()
    status = data.get("enabled", True)

    integrations_collection.update_one(
        {"name": "samsara"},
        {"$set": {"enabled": status}},
        upsert=True
    )
    return jsonify({"success": True, "enabled": status})

# API для сохранения API-ключа Samsara
@integrations_bp.route("/api/integrations/samsara/key", methods=["POST"])
@requires_admin
def update_samsara_key():
    data = request.get_json()
    api_key = data.get("api_key")

    if not api_key:
        return jsonify({"success": False, "error": "API key is required"}), 400

    integrations_collection.update_one(
        {"name": "samsara"},
        {"$set": {"api_key": api_key}},
        upsert=True
    )
    return jsonify({"success": True})

# API для сохранения любой интеграции
@integrations_bp.route("/api/integrations/<name>/save", methods=["POST"])
@requires_admin
def save_generic_integration(name):
    data = request.get_json()
    enabled = data.get("enabled", False)
    api_key = data.get("api_key", "")

    if not api_key:
        return jsonify({"success": False, "error": "API ключ не указан"}), 400

    integrations_collection.update_one(
        {"name": name},
        {"$set": {"enabled": enabled, "api_key": api_key}},
        upsert=True
    )
    return jsonify({"success": True})
