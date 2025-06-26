import uuid

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
purchase_orders_collection = db["purchase_orders"]

@equipment_bp.route('/fragment/equipment')
@login_required
def equipment_fragment():
    # Загружаем вендоров
    raw_vendors = list(db.vendors.find({}, {
        "_id": 1,
        "name": 1,
        "phone": 1,
        "email": 1,
        "website": 1,
        "address": 1,
        "contact_person": 1
    }))
    vendor_map = {str(v["_id"]): v["name"] for v in raw_vendors}

    # Категории
    categories = db.equipment_category.distinct("name")

    # Продукты
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

    # Вендоры → фронт
    vendors = []
    for v in raw_vendors:
        vendors.append({
            "id": str(v["_id"]),
            "name": v.get("name", "—"),
            "phone": v.get("phone", "—"),
            "email": v.get("email", "—"),
            "website": v.get("website", "—"),
            "address": v.get("address", "—"),
            "contact_person": v.get("contact_person", "—")
        })

    # Purchase Orders
    raw_orders = list(db.purchase_orders.find({}, {
        "vendor_id": 1,
        "created_at": 1,
        "paid": 1,
        "total": 1
    }))
    purchase_orders = []
    for o in raw_orders:
        purchase_orders.append({
            "vendor_name": vendor_map.get(str(o.get("vendor_id")), "—"),
            "date": o.get("created_at").strftime("%m/%d/%Y") if o.get("created_at") else "—",
            "paid": o.get("paid", False),
            "total": round(o.get("total", 0), 2),
            "id": str(o["_id"])
        })

    # Водители (id + name)
    raw_drivers = db.drivers.find({}, {"_id": 1, "name": 1})
    drivers = [{"id": str(d["_id"]), "name": d.get("name", "—")} for d in raw_drivers]

    return render_template(
        "fragments/equipment_fragment.html",
        vendors=vendors,
        categories=categories,
        equipment_items=items,
        purchase_orders=purchase_orders,
        drivers=drivers  # ← добавлено
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
        "website": data.get("website", "").strip(),
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
    price = request.form.get("price", "").strip()

    if not name:
        return jsonify({"success": False, "error": "Поле 'name' обязательно"}), 400

    item = {
        "name": name,
        "category": category,
        "vendor_id": ObjectId(vendor_id) if vendor_id else None,
        "description": description,
        "price": price,
        "created_at": datetime.utcnow(),
        "created_by": ObjectId(current_user.get_id())
    }

    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

    def allowed_file(filename):
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

    # Обработка фото
    if 'photo' in request.files:
        photo = request.files['photo']
        if photo and photo.filename:
            if not allowed_file(photo.filename):
                return jsonify({"success": False, "error": "Разрешены только изображения JPG, PNG, WEBP"}), 400

            filename = secure_filename(photo.filename)
            unique_prefix = uuid.uuid4().hex[:12]
            filename = f"{unique_prefix}_{filename}"
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


@equipment_bp.route("/fragment/equipment/<item_id>")
@login_required
def product_details_fragment(item_id):
    try:
        obj_id = ObjectId(item_id)
        product = equipment_items_collection.find_one({"_id": obj_id})
        if not product:
            return "Product not found", 404

        # Подтягиваем имя вендора
        vendor = vendors_collection.find_one({"_id": product.get("vendor_id")})
        product["vendor_name"] = vendor["name"] if vendor else "—"

        # Преобразуем поля
        product["id"] = str(product["_id"])
        product["created_at"] = product.get("created_at")
        product["photo"] = product.get("photo", None)

        return render_template("fragments/eq_products_details_fragment.html", product=product)

    except Exception as e:
        return f"Ошибка: {str(e)}", 400

@equipment_bp.route("/api/purchase_orders/create", methods=["POST"])
@login_required
def create_purchase_order():
    vendor_id = request.form.get("vendor_id")
    product_ids = request.form.getlist("products[]")
    prices = request.form.getlist("prices[]")
    quantities = request.form.getlist("quantities[]")
    paid = request.form.get("paid") == "on"
    tax = float(request.form.get("tax", 0) or 0)

    if not vendor_id or not product_ids:
        return jsonify({"success": False, "error": "Vendor и хотя бы один продукт обязательны"}), 400

    products = []
    subtotal = 0

    for pid, price_str, qty_str in zip(product_ids, prices, quantities):
        price = float(price_str or 0)
        qty = int(qty_str or 1)
        line_total = price * qty
        subtotal += line_total

        # Обновляем цену и stock
        db.equipment_items.update_one(
            {"_id": ObjectId(pid)},
            {
                "$set": {"price": price},
                "$inc": {"stock": qty}
            }
        )

        products.append({
            "product_id": ObjectId(pid),
            "price": price,
            "quantity": qty,
            "line_total": line_total
        })

    order = {
        "vendor_id": ObjectId(vendor_id),
        "products": products,
        "subtotal": subtotal,
        "tax": tax,
        "total": subtotal + tax,
        "paid": paid,
        "created_by": ObjectId(current_user.get_id()),
        "created_at": datetime.utcnow()
    }

    # Фото
    if 'photo' in request.files:
        photo = request.files['photo']
        if photo and photo.filename:
            filename = secure_filename(photo.filename)
            unique_prefix = uuid.uuid4().hex[:12]
            filename = f"{unique_prefix}_{filename}"
            path = os.path.join(current_app.root_path, "static", "uploads", filename)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            photo.save(path)
            order["photo"] = f"/static/uploads/{filename}"

    result = purchase_orders_collection.insert_one(order)
    return jsonify({"success": True, "order_id": str(result.inserted_id)})

@equipment_bp.route("/api/purchase_orders/<order_id>", methods=["DELETE"])
@login_required
def delete_purchase_order(order_id):
    try:
        result = db.purchase_orders.delete_one({"_id": ObjectId(order_id)})
        if result.deleted_count == 0:
            return jsonify({"success": False, "error": "Заказ не найден"}), 404
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@equipment_bp.route('/fragment/purchase_order/<order_id>')
@login_required
def purchase_order_details_fragment(order_id):
    try:
        order = db.purchase_orders.find_one({"_id": ObjectId(order_id)})
        if not order:
            return "Order not found", 404

        vendor = db.vendors.find_one({"_id": order.get("vendor_id")})
        created_at = order.get("created_at")
        products_data = order.get("products", [])

        products = []
        for p in products_data:
            prod = db.equipment_items.find_one({"_id": p["product_id"]}, {"name": 1})
            products.append({
                "name": prod["name"] if prod else "—",
                "price": float(p.get("price", 0)),
                "qty": int(p.get("quantity", 1)),
                "total": round(p.get("line_total", 0), 2)
            })

        return render_template(
            "fragments/purchase_order_details_fragment.html",
            order={
                "id": str(order["_id"]),
                "created_at": created_at,
                "photo": order.get("photo"),
                "paid": order.get("paid", False),
                "subtotal": float(order.get("subtotal", 0)),
                "tax": float(order.get("tax", 0)),
                "total": float(order.get("total", 0))
            },
            vendor=vendor,
            products=products
        )
    except Exception as e:
        return f"Error: {str(e)}", 500


@equipment_bp.route('/api/driver_orders/create', methods=['POST'])
@login_required
def create_driver_order():
    data = request.form
    driver_id = data.get("driver_id")
    date_str = data.get("date")
    reason = data.get("reason", "").strip()

    if not driver_id or not date_str or not reason:
        return jsonify({"success": False, "error": "Все поля обязательны"}), 400

    try:
        date = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return jsonify({"success": False, "error": "Неверный формат даты"}), 400

    product_ids = data.getlist("product_ids[]")
    quantities = data.getlist("quantities[]")

    if not product_ids or not quantities or len(product_ids) != len(quantities):
        return jsonify({"success": False, "error": "Товары и количество обязательны"}), 400

    items = []
    for pid, qty_str in zip(product_ids, quantities):
        try:
            qty = int(qty_str)
        except ValueError:
            return jsonify({"success": False, "error": "Некорректное количество"}), 400

        item = {
            "product_id": ObjectId(pid),
            "quantity": qty
        }
        items.append(item)

        # Обновляем stock
        db.equipment_items.update_one(
            {"_id": ObjectId(pid)},
            {"$inc": {"stock": -qty}}
        )

    order = {
        "driver_id": ObjectId(driver_id),
        "products": items,
        "date": date,
        "reason": reason,
        "created_by": ObjectId(current_user.get_id()),
        "created_at": datetime.utcnow()
    }

    db.driver_orders.insert_one(order)
    return jsonify({"success": True})
