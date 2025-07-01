from flask import Blueprint, render_template
from tools.db import db  # централизованное подключение
from flask import request, jsonify
from bson import ObjectId

dispatchers_bp = Blueprint('dispatchers', __name__)
users_collection = db['users']

@dispatchers_bp.route('/fragment/dispatchers')
def dispatchers_fragment():
    dispatchers = list(users_collection.find({"role": "dispatch"}))
    for user in dispatchers:
        user["_id"] = str(user["_id"])  # ← Преобразуем ObjectId в строку
    return render_template('fragments/dispatchers_fragment.html', dispatchers=dispatchers)


@dispatchers_bp.route('/api/dispatchers/<dispatcher_id>/update', methods=['POST'])
def update_dispatcher(dispatcher_id):
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Нет данных"}), 400

        update_fields = {
            "real_name": data.get("real_name", "").strip(),
            "dispatch_name": data.get("dispatch_name", "").strip(),
            "company_dispatch": data.get("company_dispatch", "").strip(),
            "email": data.get("email", "").strip(),
            "email_password": data.get("email_password", "").strip(),
            "phone": data.get("phone", "").strip()
        }

        result = users_collection.update_one(
            {"_id": ObjectId(dispatcher_id)},
            {"$set": update_fields}
        )

        if result.matched_count == 0:
            return jsonify({"error": "Диспетчер не найден"}), 404

        return jsonify({"success": True}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500