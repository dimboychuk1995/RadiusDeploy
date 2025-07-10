import logging
import traceback
import json
from io import BytesIO
from flask import Blueprint, render_template, request, redirect, url_for, jsonify, send_file
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from bson.objectid import ObjectId
import fitz  # PyMuPDF
from PIL import Image
import pytesseract
from tools.db import fs
from auth import requires_role
from tools.db import db
from tools.gpt_connection import get_openai_client
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

logging.basicConfig(level=logging.ERROR)

trucks_bp = Blueprint('trucks', __name__)
trucks_collection = db['trucks']

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif'}
TRUCK_TYPES = ["Truck", "Trailer"]
TRUCK_SUBTYPES = ["Pick Up", "SEMI"]
TRAILER_SUBTYPE = ["Dry Van","Flat Bed","Flat Bed Conestoga","Step Deck","Reefer","Hot Shot","3 Car Hauler","4 Car Hauler","5 Car Hauler","7 Car Hauler","8 Car Hauler"]

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def parse_utc_date(date_str):
    try:
        if not date_str:
            return None

        # Попробуем оба формата
        try:
            local = datetime.strptime(date_str, "%m/%d/%Y")
        except ValueError:
            local = datetime.strptime(date_str, "%Y-%m-%d")

        company_tz_doc = db["company_timezone"].find_one({"company": current_user.company})
        tz_str = company_tz_doc["timezone"] if company_tz_doc and "timezone" in company_tz_doc else "America/Chicago"
        local_dt = local.replace(tzinfo=ZoneInfo(tz_str))
        return local_dt.astimezone(timezone.utc)

    except Exception as e:
        print(f"❌ parse_utc_date error: {e} for input: {date_str}")
        return None

def format_local_date(dt):
    try:
        if not isinstance(dt, datetime):
            return None
        company_tz_doc = db["company_timezone"].find_one({"company": current_user.company})
        tz_str = company_tz_doc["timezone"] if company_tz_doc and "timezone" in company_tz_doc else "America/Chicago"
        local_dt = dt.astimezone(ZoneInfo(tz_str))
        return local_dt.strftime("%m/%d/%Y")
    except Exception as e:
        logging.warning(f"⏰ Ошибка преобразования даты: {e}")
        return None

@trucks_bp.route('/fragment/trucks')
@login_required
def trucks_fragment():
    import time
    from zoneinfo import ZoneInfo
    from datetime import datetime, timedelta

    t0 = time.time()

    def format_local_date(dt):
        try:
            if not isinstance(dt, datetime):
                return None
            company_tz_doc = db["company_timezone"].find_one({"company": current_user.company})
            tz_str = company_tz_doc["timezone"] if company_tz_doc and "timezone" in company_tz_doc else "America/Chicago"
            return dt.astimezone(ZoneInfo(tz_str)).strftime("%m/%d/%Y")
        except Exception:
            return None

    def check_expiry_color(*dates):
        try:
            now = datetime.now(ZoneInfo("UTC"))
            print(f"\n📅 Проверка сроков (now = {now.isoformat()}):")
            max_level = ""

            for dt in dates:
                if isinstance(dt, datetime):
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
                    delta = dt - now
                    days = delta.days
                    print(f"  ▶️ {dt.isoformat()} — осталось {days} дней")

                    if days < 0:
                        print("    🔴 ПРОСРОЧЕНО")
                        return "table-danger"
                    elif days <= 30:
                        print("    🟠 ИСТЕКАЕТ ≤ 30 ДНЕЙ")
                        max_level = "table-warning"
                    elif days <= 60 and max_level != "table-warning":
                        print("    🟡 ИСТЕКАЕТ ≤ 60 ДНЕЙ")
                        max_level = "table-info"

            print(f"    ✅ Цвет строки: {max_level}")
            return max_level
        except Exception as e:
            logging.warning(f"Ошибка в check_expiry_color: {e}")
            return ""

    def make_tooltip(label, dt):
        if not isinstance(dt, datetime):
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo("UTC"))
        now = datetime.now(ZoneInfo("UTC"))
        delta = (dt - now).days
        if delta < 0:
            return f"{label}: просрочен на {abs(delta)} дней"
        else:
            return f"{label}: осталось {delta} дней"

    try:
        companies = list(db['companies'].find({}, {"_id": 1, "name": 1}))
        drivers = list(db['drivers'].find({'company': current_user.company}, {'_id': 1, 'name': 1, 'truck': 1}))

        company_map = {str(c['_id']): c.get('name', '—') for c in companies}
        driver_id_map = {}
        driver_name_map = {}
        for driver in drivers:
            truck_id = str(driver.get('truck'))
            if truck_id:
                driver_id_map[truck_id] = str(driver['_id'])
                driver_name_map[truck_id] = driver.get('name', '—')

        raw_trucks = trucks_collection.find({'company': current_user.company})
        trucks = []

        for truck in raw_trucks:
            truck_id_str = str(truck['_id'])
            owning_company_id = str(truck.get('owning_company')) if truck.get('owning_company') else None

            # оригинальные UTC-даты
            reg_dt = truck.get('registration', {}).get('expiration_date')
            insp_dt = truck.get('annual_inspection', {}).get('expiration_date')
            poa_dt = truck.get('power_of_attorney', {}).get('expiration_date')
            ins_dt = truck.get('liability_insurance', {}).get('expiration_date')

            status_color = check_expiry_color(reg_dt, insp_dt, ins_dt)

            tooltip_parts = []
            for label, dt in [
                ("Registration", reg_dt),
                ("Inspection", insp_dt),
                ("Power of Attorney", poa_dt),
                ("Liability Insurance", ins_dt),
            ]:
                msg = make_tooltip(label, dt)
                if msg:
                    tooltip_parts.append(msg)

            tooltip_text = " | ".join(tooltip_parts)
            print(f"\n🚛 Truck {truck.get('unit_number', '—')}:")
            print(f"   📌 Статус цвета: {status_color}")
            print(f"   🧷 Tooltip: {tooltip_text}")

            trucks.append({
                'id': truck_id_str,
                'unit_number': truck.get('unit_number', '—'),
                'description': f"{truck.get('year', '')} {truck.get('make', '')} {truck.get('model', '')}".strip(),
                'type': truck.get('unit_type', '—'),
                'assigned_driver': driver_name_map.get(truck_id_str, '—'),
                'assigned_driver_id': driver_id_map.get(truck_id_str, ''),
                'company_owner': company_map.get(owning_company_id, '—'),
                'owning_company_id': owning_company_id or '',

                'registration_exp': format_local_date(reg_dt),
                'inspection_exp': format_local_date(insp_dt),
                'poa_exp': format_local_date(poa_dt),
                'insurance_exp': format_local_date(ins_dt),

                'status_color': status_color,
                'tooltip': tooltip_text
            })

        rendered = render_template(
            'fragments/trucks_fragment.html',
            trucks=trucks,
            companies=companies,
            drivers=drivers,
            truck_types=TRUCK_TYPES,
            truck_subtypes=TRUCK_SUBTYPES,
            trailer_subtypes=TRAILER_SUBTYPE
        )

        print(f"\n✅ Общая генерация: {time.time() - t0:.3f} сек\n")
        return rendered

    except Exception as e:
        logging.error(f"Error loading trucks fragment: {e}")
        logging.error(traceback.format_exc())
        return render_template('error.html', message="Failed to load trucks fragment")


@trucks_bp.route('/add_truck', methods=['POST'])
@requires_role('admin')
def add_truck():
    try:
        def save_file_to_gridfs(field_name):
            file = request.files.get(field_name)
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                file_id = fs.put(file, filename=filename, content_type=file.mimetype)
                return {
                    "file_id": file_id,
                    "filename": filename,
                    "content_type": file.mimetype
                }
            return None

        truck_data = {
            "unit_number": request.form.get("unit_number"),
            "make": request.form.get("make"),
            "model": request.form.get("model"),
            "year": request.form.get("year"),
            "mileage": request.form.get("mileage"),
            "vin": request.form.get("vin"),
            "unit_type": request.form.get("unit_type"),
            "subtype": request.form.get("subtype"),
            "company": current_user.company,
            "assigned_driver_id": ObjectId(request.form.get("assigned_driver_id")) if request.form.get("assigned_driver_id") else None,
            "owning_company": ObjectId(request.form.get("owning_company")) if request.form.get("owning_company") else None,

            "registration": {
                "license_plate": request.form.get("registration_plate"),
                "expiration_date": parse_utc_date(request.form.get("registration_exp")),
                "file": save_file_to_gridfs("registration_file")
            },

            "annual_inspection": {
                "expiration_date": parse_utc_date(request.form.get("inspection_exp")),
                "file": save_file_to_gridfs("inspection_file")
            },

            "power_of_attorney": {
                "file": save_file_to_gridfs("power_of_attorney_file")
            },

            "liability_insurance": {
                "provider": request.form.get("insurance_provider"),
                "policy_number": request.form.get("insurance_policy"),
                "expiration_date": parse_utc_date(request.form.get("insurance_exp")),
                "file": save_file_to_gridfs("insurance_file")
            },

            "created_at": datetime.utcnow().replace(tzinfo=timezone.utc)
        }

        trucks_collection.insert_one(truck_data)
        return redirect(url_for('index') + '#section-trucks')

    except Exception as e:
        logging.error(f"Error adding truck: {e}")
        logging.error(traceback.format_exc())
        return render_template('error.html', message="Failed to add truck")

@trucks_bp.route('/delete_truck/<truck_id>', methods=['POST'])
@requires_role('admin')
def delete_truck(truck_id):
    try:
        trucks_collection.delete_one({'_id': ObjectId(truck_id)})
        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Error deleting truck: {e}")
        return jsonify({'success': False, 'error': 'Failed to delete truck'})

@trucks_bp.route('/get_file/<truck_id>')
@login_required
def get_file(truck_id):
    try:
        doc_type = request.args.get("type")
        if not doc_type:
            return "Тип документа не указан", 400

        truck = trucks_collection.find_one({'_id': ObjectId(truck_id)})
        if not truck:
            return "Юнит не найден", 404

        section = truck.get(doc_type)
        if not section or "file" not in section or not section["file"]:
            return "Файл не найден", 404

        file_info = section["file"]
        file_id = file_info.get("file_id")
        if not file_id:
            return "Файл не найден", 404

        file_data = fs.get(file_id)

        return send_file(
            BytesIO(file_data.read()),
            download_name=file_info.get("filename", "file.pdf"),
            mimetype=file_info.get("content_type", "application/pdf"),
            as_attachment=False
        )

    except Exception as e:
        logging.error(f"❌ Ошибка при получении файла: {e}")
        logging.error(traceback.format_exc())
        return "Ошибка при получении файла", 500

@trucks_bp.route('/fragment/unit_details/<truck_id>')
@login_required
def unit_details_fragment(truck_id):
    try:
        truck = trucks_collection.find_one({'_id': ObjectId(truck_id)})
        if not truck:
            return render_template('error.html', message="Юнит не найден")

        # Назначенный водитель
        assigned_driver_name = "—"
        driver = db['drivers'].find_one({"truck": truck['_id']})
        if driver:
            assigned_driver_name = driver.get("name", "—")

        # Компания-владелец
        owning_company_name = "—"
        if truck.get("owning_company"):
            company = db['companies'].find_one({"_id": truck["owning_company"]})
            if company:
                owning_company_name = company.get("name", "—")

        # Конвертируем все даты в формат mm/dd/yyyy
        if truck.get("registration", {}).get("expiration_date"):
            truck["registration"]["expiration_date"] = format_local_date(truck["registration"]["expiration_date"])

        if truck.get("annual_inspection", {}).get("expiration_date"):
            truck["annual_inspection"]["expiration_date"] = format_local_date(truck["annual_inspection"]["expiration_date"])

        if truck.get("liability_insurance", {}).get("expiration_date"):
            truck["liability_insurance"]["expiration_date"] = format_local_date(truck["liability_insurance"]["expiration_date"])

        if truck.get("created_at"):
            truck["created_at"] = format_local_date(truck["created_at"])

        return render_template(
            'fragments/unit_details_fragment.html',
            truck=truck,
            assigned_driver_name=assigned_driver_name,
            owning_company_name=owning_company_name
        )

    except Exception as e:
        logging.error(f"Error loading unit details: {e}")
        logging.error(traceback.format_exc())
        return render_template('error.html', message="Ошибка при загрузке данных юнита")

@trucks_bp.route('/api/parse_unit_pdf', methods=['POST'])
def parse_unit_pdf():
    file = request.files.get('file')
    if not file or not file.filename.lower().endswith(".pdf"):
        return jsonify({'error': 'Допустим только PDF'}), 400

    try:
        pdf_bytes = file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        full_text = ""
        for i, page in enumerate(doc):
            try:
                text = page.get_text().strip()
                if not text:
                    pix = page.get_pixmap(dpi=300)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    text = pytesseract.image_to_string(img)
                full_text += "\n" + text
            except Exception as e:
                logging.warning(f"❌ Ошибка на странице {i+1}: {e}")

        # GPT-запрос
        prompt = f"""
Analyze the following Unit document and extract structured data as JSON with the following fields:

{{
  "Unit Number": "",
  "Make": "",
  "Model": "",
  "Year": "",
  "Mileage": "",
  "VIN": "",
  "License Plate": "",
  "Registration Expiration": "",
  "Inspection Expiration": "",
  "Insurance Provider": "",
  "Insurance Policy Number": "",
  "Insurance Expiration": ""
}}

Return only valid JSON.

Document:
-----
{full_text}
"""

        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )

        result = response.choices[0].message.content.strip()

        if result.startswith("```json"):
            result = result[len("```json"):].strip()
        if result.startswith("```"):
            result = result[len("```"):].strip()
        if result.endswith("```"):
            result = result[:-3].strip()

        return jsonify(json.loads(result))

    except Exception as e:
        logging.exception("❌ Ошибка при анализе PDF для трака")
        return jsonify({'error': f'Ошибка при анализе: {str(e)}'}), 500


@trucks_bp.route("/api/driver/assign", methods=["POST"])
@login_required
def assign_truck():
    try:
        driver_id = request.form.get("driver_id")
        truck_id = request.form.get("truck_id")
        owning_company = request.form.get("owning_company")
        note = request.form.get("note")

        if not truck_id:
            return jsonify({"success": False, "message": "Не передан ID трака"})

        # Очистить у всех водителей поле truck, где стоит этот трак
        drivers_collection = db['drivers']
        drivers_collection.update_many(
            {"truck": ObjectId(truck_id)},
            {"$unset": {"truck": ""}}
        )

        # Назначить новому водителю, если указан
        if driver_id:
            drivers_collection.update_one(
                {"_id": ObjectId(driver_id)},
                {"$set": {"truck": ObjectId(truck_id)}}
            )

        # Обновить owning_company в траке, если указано
        update_fields = {}
        if owning_company:
            update_fields["owning_company"] = ObjectId(owning_company)
        else:
            update_fields["owning_company"] = None

        if note:
            update_fields["assignment_note"] = note

        if update_fields:
            trucks_collection.update_one(
                {"_id": ObjectId(truck_id), "company": current_user.company},
                {"$set": update_fields}
            )

        return jsonify({"success": True})

    except Exception as e:
        logging.error(f"Ошибка при назначении трака: {e}")
        return jsonify({"success": False, "message": "Ошибка сервера"})
