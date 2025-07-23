import os
from flask import Blueprint, render_template, request, send_file, jsonify
from flask_login import login_required, current_user
from datetime import datetime
from jinja2 import Template
from werkzeug.utils import secure_filename
import subprocess
import tempfile
from tools.db import db

# Создаем Blueprint
document_bp = Blueprint('document_bp', __name__)

path_wkhtmltopdf = r'C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe'

companies_collection = db['companies']

@document_bp.route('/api/companies')
@login_required
def get_companies():
    try:
        companies = list(companies_collection.find({}, {
            "name": 1,
            "address": 1,
            "mc": 1,
            "dot": 1
        }))
        for c in companies:
            c["_id"] = str(c["_id"])
        return jsonify({"success": True, "companies": companies})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Роут для загрузки HTML-фрагмента "База документов"
@document_bp.route('/fragment/documents')
@login_required
def documents_fragment():
    return render_template("fragments/documents_fragment.html")


@document_bp.route('/api/documents/generate', methods=['POST'])
@login_required
def generate_document():
    data = request.json
    print("📥 Получены данные:", data)

    doc_type = data.get("template")
    variables = data.get("fields", {})

    if not doc_type:
        print("❌ Нет шаблона")
        return jsonify({"success": False, "error": "No template specified"}), 400

    template_path = f"templates/document_templates/{doc_type}.html"
    if not os.path.exists(template_path):
        print("❌ Шаблон не найден:", template_path)
        return jsonify({"success": False, "error": "Template not found"}), 404

    with open(template_path, 'r', encoding='utf-8') as f:
        template = Template(f.read())
        html_content = template.render(**variables)

    print("📄 HTML подготовлен")

    filename = f"{doc_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    output_path = f"static/generated_documents/{secure_filename(filename)}"
    print("📂 Путь сохранения:", output_path)

    # Путь к wkhtmltopdf
    wkhtmltopdf_path = r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe"

    try:
        # Временный HTML-файл
        with tempfile.NamedTemporaryFile(delete=False, suffix=".html", mode='w', encoding='utf-8') as tmp:
            tmp.write(html_content)
            html_file_path = tmp.name

        # Команда
        cmd = [
            wkhtmltopdf_path,
            "--enable-local-file-access",
            "--quiet",
            html_file_path,
            output_path
        ]
        print("⚙️ Запускаем команду:", ' '.join(cmd))

        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        if result.returncode == 0:
            print("✅ PDF создан успешно")
            return jsonify({"success": True, "file_url": f"/{output_path}"})
        else:
            print("❌ Ошибка subprocess:", result.stderr.decode())
            return jsonify({""
                            ""
                            "success": False, "error": result.stderr.decode()}), 500

    except Exception as e:
        print("❌ Общая ошибка:", e)
        return jsonify({"success": False, "error": str(e)}), 500


@document_bp.route('/templates/document_templates/<template_name>')
@login_required
def serve_template(template_name):
    try:
        return render_template(f'document_templates/{template_name}.html')  # <-- вот так
    except:
        return "Not found", 404


@document_bp.route("/api/units")
@login_required
def get_units():
    try:
        trucks = db.trucks.find(
            {"company": current_user.company},
            {"unit_number": 1, "make": 1, "model": 1, "year": 1, "vin": 1}
        ).sort("unit_number")

        result = []
        for truck in trucks:
            result.append({
                "_id": str(truck["_id"]),
                "unit": truck.get("unit_number", ""),
                "make": truck.get("make", ""),
                "model": truck.get("model", ""),
                "year": truck.get("year", ""),
                "vin": truck.get("vin", "")
            })

        return jsonify({"success": True, "units": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    

@document_bp.route("/api/units/upload_lease_agreement", methods=["POST"])
@login_required
def upload_lease_agreement():
    from bson import ObjectId
    from tools.db import db, fs  # fs — GridFS instance

    file = request.files.get("file")
    unit_id = request.form.get("unit_id")

    if not file or not unit_id:
        return jsonify({"success": False, "error": "Не указан файл или unit_id"}), 400

    try:
        unit = db.trucks.find_one({"_id": ObjectId(unit_id), "company": current_user.company})
        if not unit:
            return jsonify({"success": False, "error": "Юнит не найден"}), 404

        # Защита от None
        power_info = unit.get("power_of_attorney") or {}
        file_info = power_info.get("file") or {}
        old_file_id = file_info.get("file_id")

        if old_file_id:
            fs.delete(ObjectId(old_file_id))

        # Сохраняем новый файл
        gridout_id = fs.put(file, filename=file.filename, content_type=file.content_type)

        db.trucks.update_one(
            {"_id": ObjectId(unit_id)},
            {"$set": {
                "power_of_attorney.file": {
                    "file_id": gridout_id,
                    "filename": file.filename,
                    "content_type": file.content_type
                }
            }}
        )

        return jsonify({"success": True, "file_id": str(gridout_id)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
