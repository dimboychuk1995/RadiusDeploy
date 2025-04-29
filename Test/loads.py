import os
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from pymongo import MongoClient
from bson.objectid import ObjectId
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import logging
import gridfs
from datetime import datetime
import fitz  # PyMuPDF
import json
from openai import OpenAI

from Test.auth import requires_role

loads_bp = Blueprint('loads', __name__)

try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['trucks_db']
    loads_collection = db['loads']
    drivers_collection = db['drivers']
    fs = gridfs.GridFS(db)
    client.admin.command('ping')
except Exception as e:
    logging.error(f"MongoDB connection failed: {e}")
    exit(1)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def parse_date(date_str):
    if not date_str:
        return ""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").strftime("%m/%d/%Y")
    except:
        return ""

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# 🔥 НОВОЕ: получать OpenAI клиент из базы
def get_openai_client():
    doc = db.global_integrations.find_one({"name": "openai"})
    if not doc or not doc.get("api_key"):
        raise Exception("OpenAI API Key not found in global_integrations")
    return OpenAI(api_key=doc["api_key"])

def extract_text_from_pdf(path):
    doc = fitz.open(path)
    return "".join(page.get_text() for page in doc)

def ask_gpt(text):
    client = get_openai_client()

    prompt = f"""
    Extract ONLY the following structured information from the text below and return strictly as JSON:

    {{
        "Load Number": "",
        "Broker Name": "",
        "Broker Phone Number": "",
        "Broker Email": "",
        "Price": "",
        "Total Miles": "",
        "Weight": "",
        "Pickup Locations": [
            {{
                "Address": "",
                "Date": "",
                "Time": "",
                "Instructions": "",
                "Location Phone Number": "",
                "Contact Person": ""
            }}
        ],
        "Delivery Locations": [
            {{
                "Address": "",
                "Date": "",
                "Time": "",
                "Instructions": "",
                "Location Phone Number": "",
                "Contact Person": ""
            }}
        ]
    }}

    Include multiple pickup and delivery locations if present.
    -----
    {text}
    """

    try:
        print("🧠 Отправляем запрос к GPT...")
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0
        )
        content = response.choices[0].message.content
        print("✅ Ответ от GPT получен. Длина:", len(content))

        cleaned = content.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[len("```json"):].strip()
        if cleaned.startswith("```"):
            cleaned = cleaned[len("```"):].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-len("```")].strip()

        result = json.loads(cleaned)
        print("✅ JSON успешно распарсен")
        return result

    except Exception as e:
        print("❌ Ошибка при работе с OpenAI:", e)
        raise Exception(f"Ошибка OpenAI: {str(e)}")

@loads_bp.route('/api/parse_load_pdf', methods=['POST'])
def parse_load_pdf():
    print("📥 parse_load_pdf вызван")
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'Файл не был передан'}), 400
    if not allowed_file(file.filename):
        return jsonify({'error': 'Допустим только PDF'}), 400

    filename = secure_filename(file.filename)
    path = os.path.join(UPLOAD_FOLDER, filename)

    try:
        file.save(path)
        text = extract_text_from_pdf(path)
        result = ask_gpt(text)
        return jsonify(result)
    except Exception as e:
        logging.exception("❌ Ошибка при обработке PDF")
        return jsonify({'error': f'Ошибка при обработке файла: {str(e)}'}), 500

@loads_bp.route('/add_load', methods=['POST'])
@requires_role('admin')
def add_load():
    try:
        rate_con_file = request.files.get('rate_con')
        bol_file = request.files.get('bol')

        rate_con_id = fs.put(rate_con_file, filename=secure_filename(rate_con_file.filename)) if rate_con_file and rate_con_file.filename else None
        bol_id = fs.put(bol_file, filename=secure_filename(bol_file.filename)) if bol_file and bol_file.filename else None

        extra_pickups = []
        for key in request.form:
            if key.startswith("extra_pickup[") and key.endswith("][company]"):
                idx = key.split("[")[1].split("]")[0]
                pickup = {
                    "company": request.form.get(f"extra_pickup[{idx}][company]"),
                    "address": request.form.get(f"extra_pickup[{idx}][address]"),
                    "date": parse_date(request.form.get(f"extra_pickup[{idx}][date]")),
                    "instructions": request.form.get(f"extra_pickup[{idx}][instructions]")
                }
                extra_pickups.append(pickup)

        extra_deliveries = []
        for key in request.form:
            if key.startswith("extra_delivery[") and key.endswith("][company]"):
                idx = key.split("[")[1].split("]")[0]
                delivery = {
                    "company": request.form.get(f"extra_delivery[{idx}][company]"),
                    "address": request.form.get(f"extra_delivery[{idx}][address]"),
                    "date": parse_date(request.form.get(f"extra_delivery[{idx}][date]")),
                    "instructions": request.form.get(f"extra_delivery[{idx}][instructions]")
                }
                extra_deliveries.append(delivery)

        vehicles = []
        for key in request.form:
            if key.startswith("vehicles[") and key.endswith("][year]"):
                idx = key.split("[")[1].split("]")[0]
                vehicle = {
                    "year": request.form.get(f"vehicles[{idx}][year]"),
                    "make": request.form.get(f"vehicles[{idx}][make]"),
                    "model": request.form.get(f"vehicles[{idx}][model]"),
                    "vin": request.form.get(f"vehicles[{idx}][vin]"),
                    "mileage": request.form.get(f"vehicles[{idx}][mileage]"),
                    "description": request.form.get(f"vehicles[{idx}][description]")
                }
                vehicles.append(vehicle)

        load_data = {
            "load_id": request.form.get("load_id"),
            "broker_load_id": request.form.get("broker_load_id"),
            "type": request.form.get("type"),
            "load_description": request.form.get("load_description"),
            "weight": request.form.get("weight"),  # ✅ Вставил поле веса
            "vehicles": vehicles if vehicles else None,
            "assigned_driver": ObjectId(request.form.get("assigned_driver")) if request.form.get("assigned_driver") else None,
            "assigned_dispatch": request.form.get("assigned_dispatch"),

            "pickup": {
                "company": request.form.get("pickup_company"),
                "address": request.form.get("pickup_address"),
                "date": parse_date(request.form.get("pickup_date")),
                "instructions": request.form.get("pickup_instructions")
            },
            "delivery": {
                "company": request.form.get("delivery_company"),
                "address": request.form.get("delivery_address"),
                "date": parse_date(request.form.get("delivery_date")),
                "instructions": request.form.get("delivery_instructions")
            },
            "extra_pickup": extra_pickups if extra_pickups else None,
            "extra_delivery": extra_deliveries if extra_deliveries else None,
            "extra_stops": len(extra_pickups) + len(extra_deliveries),

            "status": request.form.get("status"),
            "payment_status": request.form.get("payment_status"),
            "rate_con": rate_con_id,
            "bol": bol_id,
            "company": current_user.company,
            "was_added_to_statement": False
        }

        loads_collection.insert_one(load_data)
        return redirect(url_for('index') + '#section-loads-fragment')
    except Exception as e:
        logging.exception("Ошибка при добавлении груза")
        return render_template("error.html", message="Ошибка при сохранении груза")

@loads_bp.route('/fragment/loads_fragment', methods=['GET'])
@login_required
def loads_fragment():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        driver_map = {str(d['_id']): d['name'] for d in drivers}
        loads = list(loads_collection.find({'company': current_user.company}))
        for load in loads:
            driver_id = load.get("assigned_driver")
            load["driver_name"] = driver_map.get(str(driver_id), "—") if driver_id else "—"
        return render_template("fragments/loads_fragment.html", drivers=drivers, loads=loads)
    except Exception as e:
        return render_template("error.html", message="Ошибка загрузки фрагмента грузов")
