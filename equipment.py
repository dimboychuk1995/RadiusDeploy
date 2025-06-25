from flask import request, jsonify, render_template, Blueprint
from flask_login import login_required
from datetime import datetime
from bson import ObjectId
from tools.db import db

equipment_bp = Blueprint('equipment', __name__)

vendors_collection = db["vendors"]

@equipment_bp.route("/fragment/equipment")
@login_required
def equipment_fragment():
    return render_template("fragments/equipment_fragment.html")


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


@equipment_bp.route("/api/vendors/list", methods=["GET"])
@login_required
def list_vendors():
    vendors = vendors_collection.find({}, {"name": 1, "phone": 1, "email": 1}).sort("name", 1)
    result = []
    for v in vendors:
        result.append({
            "id": str(v["_id"]),
            "name": v.get("name", ""),
            "phone": v.get("phone", ""),
            "email": v.get("email", "")
        })
    return jsonify({"success": True, "vendors": result})


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