from flask import Blueprint, request, jsonify, g
from tools.jwt_auth import jwt_required
from tools.db import db, fs
from bson import ObjectId
from datetime import datetime
from flask import send_file
import gridfs
from flask import request


driver_expense_bp = Blueprint("driver_expense_bp", __name__)
expenses_collection = db["driver_expenses"]

@driver_expense_bp.route("/api/driver/expenses/upload", methods=["POST"])
@jwt_required
def upload_driver_expense():
    try:
        # ✅ Берём driver_id из g, который кладётся в JWT при логине
        driver_id = getattr(g, "driver_id", None)
        if not driver_id:
            return jsonify({"error": "Driver ID not found in token"}), 400

        file = request.files.get("photo")
        if not file:
            return jsonify({"error": "No file uploaded"}), 400

        # Save to GridFS
        photo_id = fs.put(file, filename=file.filename, content_type=file.content_type)

        # Parse other fields
        amount = float(request.form.get("amount", 0))
        category = request.form.get("category", "other")
        note = request.form.get("note", "")
        date_str = request.form.get("date")
        date = datetime.strptime(date_str, "%Y-%m-%d") if date_str else datetime.utcnow()

        doc = {
            "driver_id": ObjectId(driver_id),
            "amount": amount,
            "category": category,
            "note": note,
            "date": date,
            "photo_id": photo_id,
            "created_at": datetime.utcnow()
        }
        expenses_collection.insert_one(doc)

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@driver_expense_bp.route("/api/driver/expenses", methods=["GET"])
@jwt_required
def get_driver_expenses():
    try:
        # ✅ driver_id берём из токена
        driver_id = getattr(g, "driver_id", None)
        if not driver_id:
            return jsonify({"error": "Driver ID not found in token"}), 400

        try:
            driver_oid = ObjectId(driver_id)
        except Exception:
            return jsonify({"error": "Invalid driver_id in token"}), 400

        limit = 10
        query = {"driver_id": driver_oid}

        # Пагинация по created_at (строго меньше переданного after)
        after = request.args.get("after")  # ISO-строка; может быть с тайзоной
        if after:
            from datetime import datetime, timezone
            try:
                after_dt = datetime.fromisoformat(after)
                # Приведём к UTC-наивному, чтобы совпадало с created_at=datetime.utcnow()
                if after_dt.tzinfo is not None:
                    after_dt = after_dt.astimezone(timezone.utc).replace(tzinfo=None)
                query["created_at"] = {"$lt": after_dt}
            except Exception:
                return jsonify({"error": "Invalid date format for 'after' (use ISO 8601)"}), 400

        cursor = (
            expenses_collection
            .find(query)
            .sort("created_at", -1)
            .limit(limit)
        )

        results = []
        for doc in cursor:
            results.append({
                "_id": str(doc["_id"]),
                "amount": doc.get("amount", 0),
                "category": doc.get("category", "other"),
                "note": doc.get("note", ""),
                "date": (doc.get("date") or doc.get("created_at")).strftime("%Y-%m-%d"),
                "created_at": doc["created_at"].isoformat(),
                "photo_url": f"/api/driver/expenses/photo/{str(doc['photo_id'])}"
            })

        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@driver_expense_bp.route("/api/driver/expenses/photo/<photo_id>", methods=["GET"])
def get_driver_expense_photo(photo_id):
    try:
        file = fs.get(ObjectId(photo_id))
        return send_file(file, mimetype=file.content_type)
    except Exception as e:
        return jsonify({"error": str(e)}), 404