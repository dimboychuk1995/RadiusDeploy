from flask import request, jsonify, render_template, Blueprint
from flask_login import login_required, current_user
from datetime import datetime
from bson import ObjectId
from tools.db import db
from flask import current_app
import os
from werkzeug.utils import secure_filename

equipment_bp = Blueprint('equipment', __name__)

vendors_collection = db["vendors"]
equipment_items_collection = db["equipment_items"]

@equipment_bp.route('/fragment/equipment')
@login_required
def equipment_fragment():
    # Загружаем вендоров
    raw_vendors = list(db.vendors.find({}, {
        "_id": 1,
        "name": 1,
        "phone": 1,
        "email": 1,
        "address": 1,
        "contact_person": 1
    }))
    vendor_map = {str(v["_id"]): v["name"] for v in raw_vendors}

    # Загружаем категории
    categories = db.equipment_category.distinct("name")

    # Загружаем продукты
    items = list(db.equipment_items.find({}, {
        "name": 1,
        "category": 1,
        "vendor_id": 1,
        "price": 1
    }))
    for item in items:
        item["id"] = str(item["_id"])
        vendor_id = item.get("vendor_id")
        item["vendor_name"] = vendor_map.get(str(vendor_id)) if vendor_id else "—"
        item["price"] = item.get("price", "—")

    # Приводим вендоров к фронтовому формату
    vendors = []
    for v in raw_vendors:
        vendors.append({
            "id": str(v["_id"]),
            "name": v.get("name", "—"),
            "phone": v.get("phone", "—"),
            "email": v.get("email", "—"),
            "address": v.get("address", "—"),
            "contact_person": v.get("contact_person", "—")
        })

    return render_template(
        "fragments/equipment_fragment.html",
        vendors=vendors,
        categories=categories,
        equipment_items=items
    )



@equipment_bp.route("/api/vendors/create", methods=["POST"])
@login_required
def create_vendor():
    data = request.json
    required_fields = ["name"]

    # Проверка обязательных полей
    if not all(field in data and data[field].strip() for field in required_fields):
        return jsonify({"success": False, "error": "Поле 'name' обязательно"}), 400

    vendor = {
        "name": data.get("name", "").strip(),
        "phone": data.get("phone", "").strip(),
        "email": data.get("email", "").strip(),
        "contact_person": data.get("contact_person", "").strip(),
        "address": data.get("address", "").strip(),
        "created_at": datetime.utcnow()
    }

    result = vendors_collection.insert_one(vendor)
    return jsonify({"success": True, "vendor_id": str(result.inserted_id)})


@equipment_bp.route("/api/vendors/<vendor_id>", methods=["DELETE"])
@login_required
def delete_vendor(vendor_id):
    from bson import ObjectId
    try:
        result = vendors_collection.delete_one({"_id": ObjectId(vendor_id)})
        if result.deleted_count == 1:
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Вендор не найден"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@equipment_bp.route("/fragment/vendor/<vendor_id>")
@login_required
def vendor_details_fragment(vendor_id):
    from bson import ObjectId

    vendor = vendors_collection.find_one({"_id": ObjectId(vendor_id)})
    if not vendor:
        return "Vendor not found", 404

    return render_template("fragments/vendor_details_fragment.html", vendor=vendor)

@equipment_bp.route("/api/equipment/create", methods=["POST"])
@login_required
def create_equipment_item():
    name = request.form.get("name", "").strip()
    category = request.form.get("category", "").strip()
    vendor_id = request.form.get("vendor", "").strip()
    description = request.form.get("description", "").strip()

    if not name:
        return jsonify({"success": False, "error": "Поле 'name' обязательно"}), 400

    item = {
        "name": name,
        "category": category,
        "vendor_id": ObjectId(vendor_id) if vendor_id else None,
        "description": description,
        "created_at": datetime.utcnow(),
        "created_by": ObjectId(current_user.get_id())
    }

    # Обработка фото
    if 'photo' in request.files:
        photo = request.files['photo']
        if photo and photo.filename:
            filename = secure_filename(photo.filename)
            save_path = os.path.join(current_app.root_path, "static", "uploads", filename)
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            photo.save(save_path)
            item["photo"] = f"/static/uploads/{filename}"

    result = equipment_items_collection.insert_one(item)
    return jsonify({"success": True, "item_id": str(result.inserted_id)})

@equipment_bp.route("/api/equipment/<item_id>", methods=["DELETE"])
@login_required
def delete_equipment_item(item_id):
    try:
        obj_id = ObjectId(item_id)
        item = equipment_items_collection.find_one({"_id": obj_id})
        if not item:
            return jsonify({"success": False, "error": "Продукт не найден"}), 404

        # Удаляем фото, если есть
        if "photo" in item and item["photo"]:
            photo_path = item["photo"].lstrip("/")  # Убираем ведущий слэш
            full_path = os.path.join(current_app.root_path, photo_path)
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                except Exception as file_err:
                    # Фото не удалось удалить — логируем, но не блокируем удаление
                    current_app.logger.warning(f"Не удалось удалить фото: {full_path} — {file_err}")

        # Удаляем сам документ
        result = equipment_items_collection.delete_one({"_id": obj_id})
        if result.deleted_count == 1:
            return jsonify({"success": True})

        return jsonify({"success": False, "error": "Не удалось удалить продукт"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400
