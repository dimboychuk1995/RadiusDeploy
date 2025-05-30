from datetime import datetime

from bson import ObjectId
from flask import Blueprint, render_template, jsonify, request
from flask_login import login_required, current_user
from Test.tools.db import db
import os
from werkzeug.utils import secure_filename
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

        # Преобразуем даты и времена
        data["date"] = datetime.strptime(data.get("date", ""), "%Y-%m-%d") if data.get("date") else None
        data["start_time"] = data.get("start_time") or None
        data["end_time"] = data.get("end_time") or None

        # Обработка checkboxes
        data["clean_inspection"] = 'clean_inspection' in request.form

        # Преобразуем violations
        violations = []
        for key in request.form:
            if key.startswith("violations["):
                parts = key.replace("violations[", "").replace("]", "").split("][")
                index = int(parts[0])
                field = parts[1]
                while len(violations) <= index:
                    violations.append({})
                violations[index][field] = request.form[key]
        data["violations"] = violations

        # Обработка файла
        file = request.files.get("file")
        if file and file.filename:
            filename = secure_filename(file.filename)
            saved_path = os.path.join("uploads", "inspections", filename)
            os.makedirs(os.path.dirname(saved_path), exist_ok=True)
            file.save(saved_path)
            data["file_path"] = saved_path

        db["inspections"].insert_one(data)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
