from datetime import datetime

from bson import ObjectId
from flask import Blueprint, render_template, jsonify, request
from flask_login import login_required, current_user
from tools.db import db
import json
from gridfs import GridFS
from flask import send_file
from io import BytesIO
from tools.jwt_auth import jwt_required
import gridfs


fs = GridFS(db)
safety_bp = Blueprint('safety', __name__)

@safety_bp.route('/fragment/safety')
@login_required
def safety_fragment():
    return render_template('fragments/safety_fragment.html')

@safety_bp.route('/api/drivers_dropdown')
@login_required
def drivers_dropdown():
    try:
        drivers = db["drivers"].find({"company": current_user.company})
        return jsonify([{"_id": str(d["_id"]), "name": d["name"]} for d in drivers])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@safety_bp.route('/api/trucks_dropdown')
@login_required
def trucks_dropdown():
    company = getattr(current_user, 'company', None)
    if not company:
        return jsonify({'error': 'No company assigned'}), 400

    try:
        trucks = db["trucks"].find({"company": company})
        return jsonify([{"_id": str(t["_id"]), "number": t.get("unit_number", "—")} for t in trucks])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@safety_bp.route('/api/driver_truck/<driver_id>')
@login_required
def get_driver_truck(driver_id):
    try:
        driver = db["drivers"].find_one({
            "_id": ObjectId(driver_id),
            "company": current_user.company
        })
        if not driver:
            return jsonify({"error": "Водитель не найден"}), 404

        truck_oid = driver.get("truck")
        return jsonify({"truck_id": str(truck_oid) if truck_oid else None})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@safety_bp.route('/api/add_inspection', methods=['POST'])
@login_required
def add_inspection():
    try:
        from bson import ObjectId

        data = request.form.to_dict()
        data["company"] = current_user.company
        data["created_at"] = datetime.utcnow()

        # Преобразуем дату в MM/DD/YYYY
        raw_date = data.get("date")
        if raw_date:
            try:
                parsed_date = datetime.strptime(raw_date, "%Y-%m-%d")
                data["date"] = parsed_date.strftime("%m/%d/%Y")
            except ValueError:
                data["date"] = raw_date  # fallback

        data["start_time"] = data.get("start_time") or None
        data["end_time"] = data.get("end_time") or None
        data["clean_inspection"] = 'clean_inspection' in request.form

        # Преобразуем driver и truck в ObjectId
        driver_id = data.get("driver")
        truck_id = data.get("truck")

        if driver_id and ObjectId.is_valid(driver_id):
            data["driver"] = ObjectId(driver_id)
        else:
            data["driver"] = None

        if truck_id and ObjectId.is_valid(truck_id):
            data["truck"] = ObjectId(truck_id)
        else:
            data["truck"] = None

        # Нарушения
        violations_json = request.form.get("violations_json", "[]")
        data["violations"] = json.loads(violations_json)

        # Загрузка файла в GridFS
        file = request.files.get("file")
        if file and file.filename:
            file_id = fs.put(file.stream, filename=file.filename, content_type=file.content_type)
            data["file_id"] = file_id  # сохраняем как ObjectId напрямую

        db["inspections"].insert_one(data)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    


@safety_bp.route('/api/inspections_list')
@login_required
def inspections_list():
    try:
        inspections = list(db["inspections"].find().sort("created_at", -1))

        # Получаем уникальные ObjectId водителей и траков
        driver_ids = list({i["driver"] for i in inspections if isinstance(i.get("driver"), ObjectId)})
        truck_ids = list({i["truck"] for i in inspections if isinstance(i.get("truck"), ObjectId)})

        drivers_map = {
            d["_id"]: {"_id": str(d["_id"]), "name": d.get("name", "—")}
            for d in db["drivers"].find({"_id": {"$in": driver_ids}})
        }

        trucks_map = {
            t["_id"]: {"_id": str(t["_id"]), "number": t.get("unit_number", "—")}
            for t in db["trucks"].find({"_id": {"$in": truck_ids}})
        }

        result = []
        for i in inspections:
            driver_info = drivers_map.get(i.get("driver"), None)
            truck_info = trucks_map.get(i.get("truck"), None)

            result.append({
                "_id": str(i["_id"]),
                "driver": driver_info or {"_id": str(i.get("driver")), "name": "—"},
                "truck": truck_info or {"_id": str(i.get("truck")), "number": "—"},
                "date": i.get("date", ""),
                "state": i.get("state", ""),
                "address": i.get("address", ""),
                "clean": i.get("clean_inspection", False),
                "file_id": {"_id": str(i["file_id"])} if i.get("file_id") else None
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@safety_bp.route('/api/get_inspection_file/<file_id>')
@login_required
def get_inspection_file(file_id):
    try:
        file = fs.get(ObjectId(file_id))
        return send_file(
            BytesIO(file.read()),
            download_name=file.filename,
            mimetype=file.content_type,
            as_attachment=False  # 👈 вот это ключевое
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 404


@safety_bp.route('/api/delete_inspection/<inspection_id>', methods=['DELETE'])
@login_required
def delete_inspection(inspection_id):
    try:
        result = db["inspections"].delete_one({
            "_id": ObjectId(inspection_id),
            "company": current_user.company
        })
        if result.deleted_count == 1:
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Инспекция не найдена"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    



@safety_bp.route('/fragment/inspection_details_fragment')
@login_required
def inspection_details_fragment():
    inspection_id = request.args.get("id")

    if not inspection_id or not ObjectId.is_valid(inspection_id):
        return "Некорректный ID", 400

    inspection = db["inspections"].find_one({"_id": ObjectId(inspection_id), "company": current_user.company})

    if not inspection:
        return "Инспекция не найдена", 404

    # Получаем имена водителя и трака
    driver = db["drivers"].find_one({"_id": ObjectId(inspection.get("driver"))}) if inspection.get("driver") else None
    truck = db["trucks"].find_one({"_id": ObjectId(inspection.get("truck"))}) if inspection.get("truck") else None

    inspection["driver_name"] = driver.get("name") if driver else "—"
    inspection["truck_number"] = truck.get("unit_number") if truck else "—"

    return render_template("fragments/inspection_details_fragment.html", inspection=inspection)







# MOBILE API

@safety_bp.route('/api/mobile/inspections', methods=['GET'])
@jwt_required
def mobile_get_inspections():
    from flask import g
    try:
        driver_id = ObjectId(g.user_id)
        company = g.company
        after = request.args.get("after")  # ISO datetime
        limit = 10

        query = {
            "driver": driver_id,
            "company": company
        }

        if after:
            try:
                after_dt = datetime.fromisoformat(after)
                query["created_at"] = {"$lt": after_dt}
            except ValueError:
                return jsonify({"error": "Invalid date format"}), 400

        inspections = db["inspections"].find(query).sort("created_at", -1).limit(limit)

        result = []
        for i in inspections:
            result.append({
                "_id": str(i["_id"]),
                "date": i.get("date"),
                "start_time": i.get("start_time"),
                "end_time": i.get("end_time"),
                "state": i.get("state"),
                "address": i.get("address"),
                "clean_inspection": i.get("clean_inspection", False),
                "violations": i.get("violations", []),
                "file_id": str(i["file_id"]) if i.get("file_id") else None,
                "created_at": i.get("created_at").isoformat() if i.get("created_at") else None
            })

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@safety_bp.route('/api/mobile/inspections', methods=['POST'])
@jwt_required
def mobile_add_inspection():
    from flask import g
    try:
        driver_id = ObjectId(g.user_id)

        # Найти документ водителя
        driver_doc = db["drivers"].find_one({"_id": driver_id})
        if not driver_doc:
            return jsonify({"success": False, "error": "Driver not found"}), 404

        truck_id = driver_doc.get("truck")
        company = driver_doc.get("company")

        # Получить файл
        file = request.files.get("file")
        file_id = None
        if file:
            file_id = fs.put(file, filename=file.filename, content_type=file.content_type)

        # Обработка даты
        date_str = request.form.get("date")
        date_formatted = None
        if date_str:
            try:
                from datetime import datetime
                date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                date_formatted = date_obj.strftime("%m/%d/%Y")
            except Exception:
                date_formatted = date_str

        start_time = request.form.get("start_time")
        end_time = request.form.get("end_time")
        state = request.form.get("state")
        address = request.form.get("address")
        clean_inspection = request.form.get("clean_inspection") == "null"

        # Violations
        violations_str = request.form.get("violations")
        try:
            violations_list = json.loads(violations_str) if violations_str else []
            violations_json = json.dumps(violations_list)
        except:
            violations_list = []
            violations_json = "[]"

        inspection = {
            "driver": driver_id,
            "truck": truck_id,
            "file_id": file_id,
            "date": date_formatted,
            "start_time": start_time,
            "end_time": end_time,
            "state": state,
            "address": address,
            "violations_json": violations_json,
            "violations": violations_list,
            "clean_inspection": clean_inspection,
            "company": company,
            "created_at": datetime.utcnow()
        }

        result = db["inspections"].insert_one(inspection)
        return jsonify({"success": True, "id": str(result.inserted_id)})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
