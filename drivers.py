import json
from datetime import datetime
from werkzeug.security import generate_password_hash
from bson import ObjectId
import gridfs
import fitz
from flask import Blueprint, render_template, request, redirect, url_for, jsonify, Response
from bson.objectid import ObjectId
from bson.binary import Binary
import logging
from flask import send_file
from flask_cors import cross_origin
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from zoneinfo import ZoneInfo
from auth import requires_role, users_collection
from tools.db import db
from tools.gpt_connection import get_openai_client

from PIL import Image
import pytesseract

from tools.jwt_auth import jwt_required

drivers_bp = Blueprint('drivers', __name__)
logging.basicConfig(level=logging.ERROR)

drivers_collection = db['drivers']
trucks_collection = db['trucks']
loads_collection = db['loads']


ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'webp', 'tiff'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def convert_to_str_id(data):
    if isinstance(data, dict) and '_id' in data:
        data['_id'] = str(data['_id'])
    return data

@drivers_bp.route('/fragment/drivers', methods=['GET'])
@login_required
def drivers_fragment():
    try:
        # Вытягиваем только нужные поля из drivers
        drivers = list(drivers_collection.find(
            {'company': current_user.company},
            {
                "_id": 1,
                "name": 1,
                "contact_number": 1,
                "email": 1,
                "driver_type": 1,
                "status": 1,
                "truck": 1,
                "dispatcher": 1,
                "hiring_company": 1  # <== добавляем это
            }
        ))

        # Только нужные поля из trucks и dispatchers
        trucks = list(trucks_collection.find({'company': current_user.company}, {"_id": 1, "unit_number": 1}))
        dispatchers = list(users_collection.find({'company': current_user.company, 'role': 'dispatch'}, {"_id": 1, "username": 1}))
        companies = list(db['companies'].find({}, {"_id": 1, "name": 1}))

        # Сопоставления по ID
        truck_units = {str(truck['_id']): truck['unit_number'] for truck in trucks}
        dispatcher_map = {str(dispatcher['_id']): dispatcher['username'] for dispatcher in dispatchers}

        # Обогащаем данными
        for i in range(len(drivers)):
            drivers[i] = convert_to_str_id(drivers[i])
            # преобразуем hiring_company в строку, если есть
            if drivers[i].get('hiring_company'):
                drivers[i]['hiring_company'] = str(drivers[i]['hiring_company'])
            drivers[i]['truck_unit'] = truck_units.get(str(drivers[i].get('truck')), 'Нет трака')
            drivers[i]['dispatcher_name'] = dispatcher_map.get(str(drivers[i].get('dispatcher')), 'Нет диспетчера')

        return render_template(
            'fragments/drivers_fragment.html',
            drivers=drivers,
            trucks=trucks,
            dispatchers=dispatchers,
            companies=companies
        )
    except Exception as e:
        logging.error(f"Error fetching drivers or trucks: {e}")
        return render_template('error.html', message="Failed to retrieve drivers or trucks list")


@drivers_bp.route('/add_driver', methods=['POST'])
@login_required
def add_driver():
    try:
        fs = gridfs.GridFS(db)

        def parse_date_to_utc(date_str):
            try:
                # 1. Получаем локальный часовой пояс компании
                company_tz_doc = db["company_timezone"].find_one({"company": current_user.company})
                tz_str = company_tz_doc[
                    "timezone"] if company_tz_doc and "timezone" in company_tz_doc else "America/Chicago"
                local_tz = ZoneInfo(tz_str)

                # 2. Преобразуем в локальное время
                local_dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=local_tz)

                # 3. Переводим в UTC и убираем tzinfo (Mongo не принимает aware datetime)
                utc_dt = local_dt.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

                return utc_dt
            except Exception as e:
                print(f"❌ parse_date_to_utc error: {e}")
                return None

        def format_dob_string(date_str):
            try:
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                return dt.strftime("%m/%d/%Y")
            except Exception:
                return date_str  # Если уже в нужном формате

        def save_file_to_gridfs(field_name):
            file = request.files.get(field_name)
            if file and file.filename:
                file_id = fs.put(file.stream, filename=secure_filename(file.filename), content_type=file.content_type)
                return {
                    'file_id': file_id,
                    'filename': file.filename,
                    'content_type': file.content_type
                }
            return None

        email = request.form.get('email')
        driver_data = {
            'name': request.form.get('name'),
            'contact_number': request.form.get('contact_number'),
            'address': request.form.get('address'),
            'email': email,
            'dob': format_dob_string(request.form.get('dob')),
            'driver_type': request.form.get('driver_type'),
            'status': request.form.get('status', 'В процессе принятия'),
            'truck': ObjectId(request.form.get('truck')) if request.form.get('truck') else None,
            'dispatcher': ObjectId(request.form.get('dispatcher')) if request.form.get('dispatcher') else None,
            'company': current_user.company,
            'hiring_company': ObjectId(request.form.get('hiring_company')) if request.form.get('hiring_company') else None,
            'license': {
                'number': request.form.get('license_number'),
                'class': request.form.get('license_class'),
                'state': request.form.get('license_state'),
                'address': request.form.get('license_address'),
                'issued_date': parse_date_to_utc(request.form.get('license_issued_date')),
                'expiration_date': parse_date_to_utc(request.form.get('license_expiration_date')),
                'restrictions': request.form.get('license_restrictions'),
                'file': save_file_to_gridfs('license_file')
            },
            'medical_card': {
                'issued_date': parse_date_to_utc(request.form.get('med_issued_date')),
                'expiration_date': parse_date_to_utc(request.form.get('med_expiration_date')),
                'restrictions': request.form.get('med_restrictions'),
                'file': save_file_to_gridfs('med_file')
            },
            'drug_test': {
                'issued_date': parse_date_to_utc(request.form.get('drug_issued_date')),
                'file': save_file_to_gridfs('drug_file')
            },
            'mvr': {
                'expiration_date': parse_date_to_utc(request.form.get('mvr_expiration_date')),
                'file': save_file_to_gridfs('mvr_file')
            },
            'psp': {
                'file': save_file_to_gridfs('psp_file')
            },
            'clearing_house': {
                'file': save_file_to_gridfs('clearing_house_file')
            },
            'agreement': {
                'file': save_file_to_gridfs('agreement_file')
            },
            'ssn': request.form.get('ssn')
        }

        result = drivers_collection.insert_one(driver_data)
        driver_id = result.inserted_id

        password = 'password'
        user_data = {
            'username': email,
            'password': generate_password_hash(password, method='scrypt'),
            'role': 'driver',
            'company': current_user.company,
            'driver_id': driver_id
        }
        users_collection.insert_one(user_data)

        return redirect(url_for('index'))

    except Exception as e:
        logging.error(f"Error adding driver: {e}")
        return render_template('error.html', message="Failed to add driver")


@drivers_bp.route('/fragment/driver_details/<driver_id>', methods=['GET'])
@login_required
def driver_details_fragment(driver_id):
    try:
        from zoneinfo import ZoneInfo
        from datetime import datetime

        # Получение часового пояса компании
        def get_company_timezone():
            tz_doc = db["company_timezone"].find_one({"company": current_user.company})
            return tz_doc["timezone"] if tz_doc and "timezone" in tz_doc else "America/Chicago"

        # Преобразование UTC datetime в локальное представление mm/dd/yyyy
        def format_local_date(dt):
            if not isinstance(dt, datetime):
                return ""
            tz = ZoneInfo(get_company_timezone())
            return dt.astimezone(tz).strftime("%m/%d/%Y")

        # Загружаем все поля, кроме файлов
        driver = drivers_collection.find_one(
            {'_id': ObjectId(driver_id)},
            {
                'license.file': 0,
                'medical_card.file': 0,
                'drug_test.file': 0,
                'mvr.file': 0,
                'psp.file': 0,
                'clearing_house.file': 0,
                'agreement.file': 0
            }
        )

        if not driver:
            return render_template('error.html', message="Driver not found")

        # Форматируем даты в driver
        if "license" in driver:
            driver["license"]["issued_date"] = format_local_date(driver["license"].get("issued_date"))
            driver["license"]["expiration_date"] = format_local_date(driver["license"].get("expiration_date"))

        if "medical_card" in driver:
            driver["medical_card"]["issued_date"] = format_local_date(driver["medical_card"].get("issued_date"))
            driver["medical_card"]["expiration_date"] = format_local_date(driver["medical_card"].get("expiration_date"))

        if "drug_test" in driver:
            driver["drug_test"]["issued_date"] = format_local_date(driver["drug_test"].get("issued_date"))

        if "mvr" in driver:
            driver["mvr"]["expiration_date"] = format_local_date(driver["mvr"].get("expiration_date"))

        # dob оставляем как есть (string, mm/dd/yyyy)
        driver = convert_to_str_id(driver)

        truck = trucks_collection.find_one({'_id': ObjectId(driver.get('truck'))}) if driver.get('truck') else None
        dispatcher = users_collection.find_one({'_id': ObjectId(driver.get('dispatcher'))}) if driver.get('dispatcher') else None

        trucks = list(trucks_collection.find({'company': current_user.company}))
        dispatchers = list(users_collection.find({'company': current_user.company, 'role': 'dispatch'}))
        loads = list(loads_collection.find({'driver': ObjectId(driver['_id'])}))

        scheme_data = {
            'scheme_type': driver.get('scheme_type'),
            'commission_table': driver.get('commission_table') or [],
            'net_commission_table': driver.get('net_commission_table') or [],
            'additional_charges': driver.get('additional_charges') or [],
            'per_mile_rate': driver.get('per_mile_rate')
        }

        return render_template(
            'fragments/driver_details_fragment.html',
            driver=driver,
            truck=convert_to_str_id(truck),
            dispatcher=convert_to_str_id(dispatcher),
            trucks=trucks,
            dispatchers=dispatchers,
            loads=loads,
            scheme_data=scheme_data
        )
    except Exception as e:
        logging.error(f"Error fetching driver details: {e}")
        return render_template('error.html', message="Failed to retrieve driver details")

@drivers_bp.route('/driver_file/<file_id>')
@login_required
def get_driver_file(file_id):
    try:
        fs = gridfs.GridFS(db)
        file = fs.get(ObjectId(file_id))
        return send_file(file, mimetype=file.content_type, download_name=file.filename)
    except Exception as e:
        logging.error(f"Ошибка при получении файла водителя: {e}")
        return f"Ошибка: файл не найден", 404

@drivers_bp.route('/api/driver_file/<driver_id>/<doc_type>', methods=['GET'])
@login_required
def get_driver_file_metadata(driver_id, doc_type):
    driver = drivers_collection.find_one({'_id': ObjectId(driver_id)})

    if not driver:
        return jsonify({"error": "Driver not found"}), 404

    doc = driver.get(doc_type)
    if not doc or not isinstance(doc, dict):
        return jsonify({"error": "Document not found"}), 404

    file_info = doc.get("file")
    if not file_info:
        return jsonify({"error": "File not attached"}), 404

    return jsonify({
        "filename": file_info.get("filename"),
        "file_id": str(file_info.get("file_id"))
    })

@drivers_bp.route('/delete_driver/<driver_id>', methods=['POST'])
@requires_role('admin')
def delete_driver(driver_id):
    try:
        drivers_collection.delete_one({'_id': ObjectId(driver_id)})
        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Error deleting driver: {e}")
        return jsonify({'success': False, 'error': 'Failed to delete driver'})

import base64

@drivers_bp.route('/set_salary_scheme/<driver_id>', methods=['POST'])
@login_required
def set_salary_scheme(driver_id):
    try:
        scheme_type = request.form.get('scheme_type')

        update_data = {}

        if scheme_type == 'percent':
            gross_table = [{
                'from_sum': 0,
                'percent': float(request.form.get('base_percent', 30)),
                'to_sum': None
            }]

            gross_from = request.form.getlist('gross_from_sum[]')
            gross_percent = request.form.getlist('gross_percent[]')

            for from_val, percent_val in zip(gross_from, gross_percent):
                if from_val and percent_val and float(from_val) != 0:
                    gross_table.append({
                        'from_sum': float(from_val),
                        'percent': float(percent_val),
                        'to_sum': None
                    })

            update_data.update({
                'scheme_type': 'percent',
                'commission_table': gross_table,
                'net_commission_table': None
            })

        elif scheme_type == 'net_percent':
            net_table = [{
                'from_sum': 0,
                'percent': float(request.form.get('base_percent', 30)),
                'to_sum': None
            }]

            net_from = request.form.getlist('net_from_sum[]')
            net_percent = request.form.getlist('net_percent[]')

            for from_val, percent_val in zip(net_from, net_percent):
                if from_val and percent_val and float(from_val) != 0:
                    net_table.append({
                        'from_sum': float(from_val),
                        'percent': float(percent_val),
                        'to_sum': None
                    })

            update_data.update({
                'scheme_type': 'net_percent',
                'commission_table': None,
                'net_commission_table': net_table
            })

        elif scheme_type == 'per_mile':
            per_mile_rate = float(request.form.get('per_mile_rate', 0))
            update_data.update({
                'scheme_type': 'per_mile',
                'per_mile_rate': per_mile_rate,
                'commission_table': None,
                'net_commission_table': None
            })

        else:
            return jsonify({'success': False, 'error': 'Неверный тип схемы'}), 400

        # 🧾 Дополнительные списания
        charges = []
        charge_types = request.form.getlist('charge_type[]')
        charge_periods = request.form.getlist('charge_period[]')
        charge_days = request.form.getlist('charge_day_of_month[]')
        charge_amounts = request.form.getlist('charge_amount[]')
        charge_files = request.files.getlist('charge_file[]')

        for i in range(len(charge_types)):
            if not charge_types[i] or not charge_amounts[i]:
                continue

            charge = {
                'type': charge_types[i],
                'period': charge_periods[i],
                'day_of_month': int(charge_days[i]) if charge_periods[i] == 'monthly' and charge_days[i] else None,
                'amount': float(charge_amounts[i]),
                'file': None
            }

            # 📎 Добавим файл как base64
            if i < len(charge_files):
                file = charge_files[i]
                if file and file.filename:
                    file_content = file.read()
                    encoded_file = base64.b64encode(file_content).decode('utf-8')
                    charge['file'] = {
                        'filename': file.filename,
                        'content': encoded_file
                    }

            charges.append(charge)

        update_data['additional_charges'] = charges

        drivers_collection.update_one({'_id': ObjectId(driver_id)}, {'$set': update_data})
        return jsonify({'success': True})

    except Exception as e:
        logging.error(f"Ошибка при сохранении схемы зарплаты: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@drivers_bp.route('/get_salary_scheme/<driver_id>', methods=['GET'])
@login_required
def get_salary_scheme(driver_id):
    try:
        driver = drivers_collection.find_one({'_id': ObjectId(driver_id)})
        if not driver:
            return jsonify({'success': False, 'error': 'Водитель не найден'}), 404

        result = {
            'scheme_type': driver.get('scheme_type'),
            'commission_table': driver.get('commission_table', []),
            'net_commission_table': driver.get('net_commission_table', [])
        }
        return jsonify({'success': True, 'data': result})

    except Exception as e:
        logging.error(f"Ошибка при получении схемы зарплаты: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@drivers_bp.route('/api/parse_driver_pdf', methods=['POST'])
@login_required
def parse_driver_pdf():
    file = request.files.get('file')
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Only PDF or image files are allowed'}), 400

    try:
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        full_text = ""

        if file_ext == 'pdf':
            pdf_bytes = file.read()
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page in doc:
                page_text = page.get_text().strip()
                if not page_text:
                    pix = page.get_pixmap(dpi=300)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    page_text = pytesseract.image_to_string(img)
                full_text += page_text + "\n"
        else:
            # обработка изображения
            img = Image.open(file.stream).convert('RGB')
            full_text = pytesseract.image_to_string(img)

        if not full_text.strip():
            return jsonify({'error': 'Could not extract text from file'}), 400

        client = get_openai_client()
        prompt = f"""
Extract the following driver information from the document. Return the result strictly as a JSON object, and leave any unknown fields empty. Do not include any explanations — only valid JSON.
License State is on LOGO 
License Issued usually mark as ISS
License Class usually mark as CLASS or License Type
License Expiration usually mark as EXP
License Restrictions usually mark as RESTRICTIONS

if you can find exact this values think by yourself

{{
  "Name": "", 
  "Address": "",
  "DOB": "",
  "License Number": "",
  "License Class": "",
  "License State": "",
  "License Issued": "",
  "License Expiration": "",
  "License Restrictions": ""
}}

Document text:
-----
{full_text}
        """

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )

        result = response.choices[0].message.content.strip()
        if result.startswith("```json"):
            result = result[len("```json"):].strip()
        if result.startswith("```"):
            result = result[len("```"):].strip()
        if result.endswith("```"):
            result = result[:-len("```")].strip()

        return jsonify(json.loads(result))

    except Exception as e:
        logging.error(f"Error parsing driver file: {e}")
        return jsonify({'error': 'Failed to process the file'}), 500


@drivers_bp.route('/api/edit_driver_dispatch/<driver_id>', methods=['POST'])
@login_required
def edit_driver_dispatch(driver_id):
    try:
        dispatcher_id = request.form.get('dispatcher')

        update_fields = {}
        if dispatcher_id:
            update_fields['dispatcher'] = ObjectId(dispatcher_id)
        else:
            update_fields['dispatcher'] = None  # очистка, если выбран "—"

        result = drivers_collection.update_one(
            {'_id': ObjectId(driver_id)},
            {'$set': update_fields}
        )

        if result.modified_count == 0:
            return jsonify({'success': False, 'message': 'Не удалось обновить диспетчера'}), 400

        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Ошибка при обновлении диспетчера для водителя {driver_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@drivers_bp.route('/api/edit_driver_truck/<driver_id>', methods=['POST'])
@login_required
def edit_driver_truck(driver_id):
    try:
        truck_id = request.form.get('truck')

        update_fields = {
            'truck': ObjectId(truck_id) if truck_id else None
        }

        result = drivers_collection.update_one(
            {'_id': ObjectId(driver_id)},
            {'$set': update_fields}
        )

        if result.modified_count == 0:
            return jsonify({'success': False, 'message': 'Не удалось обновить трак'}), 400

        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Ошибка при обновлении трака для водителя {driver_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500



@drivers_bp.route('/api/drivers/<driver_id>/update_push_token', methods=['POST'])
@jwt_required
@cross_origin()
def update_push_token(driver_id):
    from flask import request, jsonify
    from bson import ObjectId
    import traceback

    try:
        print("📥 /update_push_token вызван")
        print(f"🧾 driver_id из URL: {driver_id}")

        data = request.get_json()
        print(f"📦 Тело запроса: {data}")

        token = data.get("expo_push_token")
        if not token:
            print("❌ Не передан expo_push_token")
            return jsonify(success=False, error="❌ Токен не передан"), 400

        result = drivers_collection.update_one(
            {"_id": ObjectId(driver_id)},
            {"$set": {"expo_push_token": token}}
        )

        print(f"📊 MongoDB update result: matched={result.matched_count}, modified={result.modified_count}")

        if result.matched_count == 0:
            print("❌ Водитель не найден")
            return jsonify(success=False, error="🚫 Водитель не найден"), 404
        elif result.modified_count == 0:
            print("ℹ️ Токен уже был таким же — не обновлён")
            return jsonify(success=False, error="ℹ️ Токен не изменился", same_token=True), 200
        else:
            print("✅ Push token успешно обновлён")
            return jsonify(success=True), 200

    except Exception as e:
        print("❌ Ошибка в update_push_token")
        traceback.print_exc()
        return jsonify(success=False, error=str(e)), 500
