from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import current_user
from functools import wraps
from bson import ObjectId

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

    for doc in all_integrations:
        doc.pop('_id', None)
        if "parentId" in doc and isinstance(doc["parentId"], ObjectId):
            doc["parentId"] = str(doc["parentId"])  # ✅ сериализация

    for doc in catalog_integrations:
        doc['_id'] = str(doc['_id'])  # ✅ оставляем _id, но в строку

    return render_template(
        "integrations.html",
        integrations=all_integrations,
        catalog=catalog_integrations
    )


@integrations_bp.route("/api/integrations/<name>/update", methods=["POST"])
@requires_admin
def update_integration(name):
    data = request.get_json()
    parent_id_raw = data.get("parentId")

    parent_id = None
    if parent_id_raw and isinstance(parent_id_raw, str):
        try:
            parent_id = ObjectId(parent_id_raw)
        except Exception:
            print("⚠️ Invalid ObjectId format:", parent_id_raw)

    update_data = {
        "enabled": data.get("enabled", False),
        "api_key": data.get("api_key", ""),
        "login": data.get("login", ""),
        "password": data.get("password", ""),
        "parentId": parent_id
    }

    integrations_collection.update_one(
        {"name": name},
        {"$set": update_data},
        upsert=True
    )
    return jsonify({"success": True})