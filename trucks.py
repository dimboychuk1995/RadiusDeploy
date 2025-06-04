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

from auth import requires_role
from tools.db import db
from tools.gpt_connection import get_openai_client

logging.basicConfig(level=logging.ERROR)

trucks_bp = Blueprint('trucks', __name__)
trucks_collection = db['trucks']

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif'}
TRUCK_TYPES = ["Truck", "Trailer"]
TRUCK_SUBTYPES = ["Flatbed", "Dry Van", "Reefer", "Step Deck", "Lowboy", "Tanker"]

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@trucks_bp.route('/fragment/trucks')
@login_required
def trucks_fragment():
    try:
        trucks = list(trucks_collection.find({'company': current_user.company}))
        return render_template(
            'fragments/trucks_fragment.html',
            trucks=trucks,
            truck_types=TRUCK_TYPES,
            truck_subtypes=TRUCK_SUBTYPES
        )
    except Exception as e:
        logging.error(f"Error loading trucks fragment: {e}")
        return render_template('error.html', message="Failed to load trucks fragment")

@trucks_bp.route('/add_truck', methods=['POST'])
@requires_role('admin')
def add_truck():
    try:
        def get_file(field_name):
            file = request.files.get(field_name)
            if file and allowed_file(file.filename):
                return {
                    'file_data': file.read(),
                    'file_name': secure_filename(file.filename),
                    'file_mimetype': file.mimetype
                }
            return {}

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

            "registration": {
                "license_plate": request.form.get("registration_plate"),
                "expiration_date": request.form.get("registration_exp"),
                **get_file("registration_file")
            },

            "annual_inspection": {
                "expiration_date": request.form.get("inspection_exp"),
                **get_file("inspection_file")
            },

            "power_of_attorney": get_file("power_of_attorney_file"),

            "liability_insurance": {
                "provider": request.form.get("insurance_provider"),
                "policy_number": request.form.get("insurance_policy"),
                "expiration_date": request.form.get("insurance_exp"),
                **get_file("insurance_file")
            }
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
        truck = trucks_collection.find_one({'_id': ObjectId(truck_id)})
        if truck and truck.get('file_data'):
            return send_file(BytesIO(truck['file_data']),
                             download_name=truck.get('file_name', 'file'),
                             mimetype=truck.get('file_mimetype', 'application/octet-stream'),
                             as_attachment=True)
        return "Файл не найден", 404
    except Exception as e:
        logging.error(f"Error getting file: {e}")
        return "Ошибка при получении файла", 500

@trucks_bp.route('/fragment/unit_details/<truck_id>')
@login_required
def unit_details_fragment(truck_id):
    try:
        truck = trucks_collection.find_one({'_id': ObjectId(truck_id)})
        if not truck:
            return render_template('error.html', message="Юнит не найден")
        return render_template('fragments/unit_details_fragment.html', truck=truck)
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
