from datetime import datetime

from bson import ObjectId
from flask import Blueprint, render_template, jsonify, request
from flask_login import login_required, current_user
from tools.db import db
import json
from gridfs import GridFS
from flask import send_file
from io import BytesIO

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


@safety_bp.route('/api/add_inspection', methods=['POST'])
@login_required
def add_inspection():
    try:
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

        # Нарушения
        violations_json = request.form.get("violations_json", "[]")
        data["violations"] = json.loads(violations_json)

        # Загрузка файла в GridFS
        file = request.files.get("file")
        if file and file.filename:
            file_id = fs.put(file.stream, filename=file.filename, content_type=file.content_type)
            data["file_id"] = str(file_id)

        db["inspections"].insert_one(data)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@safety_bp.route('/api/inspections_list')
@login_required
def inspections_list():
    try:
        company = current_user.company
        inspections = list(db["inspections"].find({"company": company}).sort("created_at", -1))

        # Собираем только валидные ObjectId
        driver_ids = []
        truck_ids = []

        for i in inspections:
            if i.get("driver") and ObjectId.is_valid(i["driver"]):
                driver_ids.append(ObjectId(i["driver"]))
            if i.get("truck") and ObjectId.is_valid(i["truck"]):
                truck_ids.append(ObjectId(i["truck"]))

        drivers_map = {
            str(d["_id"]): d.get("name", "—")
            for d in db["drivers"].find({"_id": {"$in": driver_ids}})
        }

        trucks_map = {
            str(t["_id"]): t.get("unit_number", "—")
            for t in db["trucks"].find({"_id": {"$in": truck_ids}})
        }

        result = []
        for i in inspections:
            result.append({
                "_id": str(i["_id"]),
                "driver": drivers_map.get(i.get("driver"), i.get("driver")),
                "truck": trucks_map.get(i.get("truck"), i.get("truck")),
                "date": i.get("date", ""),
                "state": i.get("state", ""),
                "address": i.get("address", ""),
                "clean": i.get("clean_inspection", False),
                "file_id": str(i.get("file_id")) if i.get("file_id") else None
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

