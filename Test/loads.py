import logging
import json
from datetime import datetime
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from bson.objectid import ObjectId
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import gridfs
import fitz  # PyMuPDF
from PIL import Image
import pytesseract

from Test.auth import requires_role
from Test.tools.gpt_connection import get_openai_client
from Test.tools.db import db

loads_bp = Blueprint('loads', __name__)

fs = gridfs.GridFS(db)

loads_collection = db['loads']
drivers_collection = db['drivers']

ALLOWED_EXTENSIONS = {'pdf'}

def parse_date(date_str):
    if not date_str:
        return ""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").strftime("%m/%d/%Y")
    except:
        return ""

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def ask_gpt(content):
    client = get_openai_client()

    prompt = f"""
Analyze the following Rate Con or BOL text and try to fill in the following JSON structure as accurately as possible.
Leave blank any fields that are missing. Return only valid JSON:

{{
    "Load Number": "",
    "Broker Name": "",
    "Type Of Load": "",
    "Broker Phone Number": "",
    "Broker Email": "",
    "Price": "",
    "Total Miles": "",
    "Weight": "",
    "Load Description": "",
    "Pickup Locations": [
        {{
            "Company": "",
            "Address": "",
            "Date": "",
            "Time": "",
            "Instructions": "",
            "Location Phone Number": "",
            "Contact Person": "",
            "Contact Email": ""
        }}
    ],
    "Delivery Locations": [
        {{
            "Company": "",
            "Address": "",
            "Date": "",
            "Time": "",
            "Instructions": "",
            "Location Phone Number": "",
            "Contact Person": "",
            "Contact Email": ""
        }}
    ]
}}

Document:
-----
{content}
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        message = response.choices[0].message.content.strip()
        if message.startswith("```json"):
            message = message[len("```json"):].strip()
        if message.startswith("```"):
            message = message[len("```"):].strip()
        if message.endswith("```"):
            message = message[:-len("```")].strip()
        return json.loads(message)
    except Exception as e:
        raise Exception(f"OpenAI error: {str(e)}")

@loads_bp.route('/api/parse_load_pdf', methods=['POST'])
def parse_load_pdf():
    file = request.files.get('file')
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Допустим только PDF'}), 400
    try:
        # читаем файл в байты (без сохранения на диск)
        pdf_bytes = file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        merged_result = {
            "Load Number": "",
            "Broker Name": "",
            "Type Of Load": "",
            "Broker Phone Number": "",
            "Broker Email": "",
            "Price": "",
            "Total Miles": "",
            "Weight": "",
            "Load Description": "",
            "Pickup Locations": [],
            "Delivery Locations": []
        }

        for i in range(len(doc)):
            try:
                page_text = doc[i].get_text().strip()

                if not page_text:
                    pix = doc[i].get_pixmap(dpi=300)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    page_text = pytesseract.image_to_string(img)

                if not page_text.strip():
                    continue

                result = ask_gpt(page_text)

                for key in merged_result:
                    if key in ["Pickup Locations", "Delivery Locations"]:
                        merged_result[key].extend(result.get(key, []))
                    else:
                        if not merged_result[key]:
                            merged_result[key] = result.get(key, "")
            except Exception as e:
                logging.warning(f"❌ Ошибка при обработке страницы {i + 1}: {str(e)}")

        return jsonify(merged_result)
    except Exception as e:
        logging.exception("Ошибка при OCR и обработке PDF")
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
                extra_pickups.append({
                    "company": request.form.get(f"extra_pickup[{idx}][company]"),
                    "address": request.form.get(f"extra_pickup[{idx}][address]"),
                    "date": parse_date(request.form.get(f"extra_pickup[{idx}][date]")),
                    "instructions": request.form.get(f"extra_pickup[{idx}][instructions]"),
                    "contact_person": request.form.get(f"extra_pickup[{idx}][contact_person]"),
                    "contact_phone_number": request.form.get(f"extra_pickup[{idx}][contact_phone_number]"),
                    "contact_email": request.form.get(f"extra_pickup[{idx}][contact_email]")
                })

        extra_deliveries = []
        for key in request.form:
            if key.startswith("extra_delivery[") and key.endswith("][company]"):
                idx = key.split("[")[1].split("]")[0]
                extra_deliveries.append({
                    "company": request.form.get(f"extra_delivery[{idx}][company]"),
                    "address": request.form.get(f"extra_delivery[{idx}][address]"),
                    "date": parse_date(request.form.get(f"extra_delivery[{idx}][date]")),
                    "instructions": request.form.get(f"extra_delivery[{idx}][instructions]"),
                    "contact_person": request.form.get(f"extra_delivery[{idx}][contact_person]"),
                    "contact_phone_number": request.form.get(f"extra_delivery[{idx}][contact_phone_number]"),
                    "contact_email": request.form.get(f"extra_delivery[{idx}][contact_email]")
                })

        vehicles = []
        for key in request.form:
            if key.startswith("vehicles[") and key.endswith("][year]"):
                idx = key.split("[")[1].split("]")[0]
                vehicles.append({
                    "year": request.form.get(f"vehicles[{idx}][year]"),
                    "make": request.form.get(f"vehicles[{idx}][make]"),
                    "model": request.form.get(f"vehicles[{idx}][model]"),
                    "vin": request.form.get(f"vehicles[{idx}][vin]"),
                    "mileage": request.form.get(f"vehicles[{idx}][mileage]"),
                    "description": request.form.get(f"vehicles[{idx}][description]")
                })

        load_data = {
            "load_id": request.form.get("load_id"),
            "broker_load_id": request.form.get("broker_load_id"),
            "broker_email": request.form.get("broker_email"),
            "broker_phone_number": request.form.get("broker_phone_number"),
            "type": request.form.get("type"),
            "weight": request.form.get("weight"),
            "price": request.form.get("price"),
            "load_description": request.form.get("load_description"),
            "vehicles": vehicles if vehicles else None,
            "assigned_driver": ObjectId(request.form.get("assigned_driver")) if request.form.get("assigned_driver") else None,
            "assigned_dispatch": request.form.get("assigned_dispatch"),
            "pickup": {
                "company": request.form.get("pickup_company"),
                "address": request.form.get("pickup_address"),
                "date": parse_date(request.form.get("pickup_date")),
                "instructions": request.form.get("pickup_instructions"),
                "contact_person": request.form.get("pickup_contact_person"),
                "contact_phone_number": request.form.get("pickup_contact_phone_number"),
                "contact_email": request.form.get("pickup_contact_email")
            },
            "delivery": {
                "company": request.form.get("delivery_company"),
                "address": request.form.get("delivery_address"),
                "date": parse_date(request.form.get("delivery_date")),
                "instructions": request.form.get("delivery_instructions"),
                "contact_person": request.form.get("delivery_contact_person"),
                "contact_phone_number": request.form.get("delivery_contact_phone_number"),
                "contact_email": request.form.get("delivery_contact_email")
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
