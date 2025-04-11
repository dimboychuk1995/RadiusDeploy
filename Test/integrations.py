from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import current_user
from functools import wraps
from pymongo import MongoClient
import logging

# Подключение к базе
try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['trucks_db']
    integrations_collection = db['integrations_settings']
    client.admin.command('ping')
    logging.info("Connected to MongoDB [integrations]")
except Exception as e:
    logging.error(f"MongoDB connection error in integrations: {e}")
    exit(1)

# Blueprint
integrations_bp = Blueprint('integrations', __name__)

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
    doc = integrations_collection.find_one({"name": "samsara"})
    status = doc.get("enabled", True) if doc else True
    return render_template("integrations.html", status=status)

# API для обновления статуса
@integrations_bp.route("/api/integrations/samsara", methods=["POST"])
@requires_admin
def update_samsara_status():
    data = request.get_json()
    status = data.get("enabled", True)

    # upsert = insert if not exist
    integrations_collection.update_one(
        {"name": "samsara"},
        {"$set": {"enabled": status}},
        upsert=True
    )
    return jsonify({"success": True, "enabled": status})
