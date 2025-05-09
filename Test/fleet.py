from flask import Blueprint, render_template, request, Response, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from Test.tools.db import db
import logging
from datetime import datetime
import fitz  # PyMuPDF
import pytesseract
import io
import json
from Test.tools.gpt_connection import get_openai_client
from PIL import Image




fleet_bp = Blueprint('fleet', __name__)

def to_mmddyyyy(date_str):
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").strftime("%m/%d/%Y")
    except Exception:
        return date_str  # если формат не тот

@fleet_bp.route('/fragment/fleet_fragment', methods=['GET'])
@login_required
def fleet_fragment():
    trucks = list(db['trucks'].find({'company': current_user.company}))
    drivers = list(db['drivers'].find({'company': current_user.company}))

    driver_map = {}
    for d in drivers:
        truck_id = d.get('truck')
        if truck_id:
            driver_map[str(truck_id)] = d

    return render_template('fragments/fleet_fragment.html', trucks=trucks, driver_map=driver_map)

@fleet_bp.route('/fragment/fleet_unit_details/<unit_id>', methods=['GET'])
@login_required
def fleet_unit_details_fragment(unit_id):
    unit = db['trucks'].find_one({'_id': ObjectId(unit_id), 'company': current_user.company})
    services = list(db['fleet_services'].find({'unit_id': ObjectId(unit_id)}))
    return render_template('fragments/fleet_unit_details_fragment.html', unit=unit, services=services)

@fleet_bp.route('/fleet/download_service_file/<service_id>', methods=['GET'])
@login_required
def download_service_file(service_id):
    service = db['fleet_services'].find_one({'_id': ObjectId(service_id)})
    if not service or not service.get('file'):
        return "File not found", 404

    file_data = service['file']
    return Response(file_data['content'], mimetype=file_data['content_type'])

@fleet_bp.route('/fleet/add_service', methods=['POST'])
@login_required
def add_service():
    try:
        file = request.files.get('file')
        file_data = None
        if file and file.filename:
            file_data = {
                'filename': file.filename,
                'content': file.read(),
                'content_type': file.content_type
            }

        service = {
            'unit_id': ObjectId(request.form.get('unit_id')),
            'date': to_mmddyyyy(request.form.get('date')),
            'invoice_no': request.form.get('invoice_no'),
            'shop': request.form.get('shop'),
            'shop_address': request.form.get('shop_address'),
            'phone_number': request.form.get('phone_number'),
            'type': request.form.get('type'),
            'mileage': request.form.get('mileage'),
            'amount': float(request.form.get('amount')) if request.form.get('amount') else 0,
            'description': request.form.get('description'),
            'file': file_data
        }

        db['fleet_services'].insert_one(service)
        return '', 200  # 👈 возвращаем 200 OK без редиректа
    except Exception as e:
        logging.error(f"Ошибка при добавлении сервиса: {e}")
        return Response("Error", status=500)

@fleet_bp.route('/api/analyze_service_file', methods=['POST'])
@login_required
def analyze_service_file():
    file = request.files.get('file')
    if not file:
        return jsonify({'success': False, 'error': 'Файл не получен'}), 400

    filename = file.filename.lower()
    full_text = ""

    try:
        if filename.endswith('.pdf'):
            doc = fitz.open(stream=file.read(), filetype="pdf")
            for page in doc:
                text = page.get_text().strip()
                if not text:
                    pix = page.get_pixmap(dpi=300)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    text = pytesseract.image_to_string(img)
                full_text += text + "\n"
        else:
            img = Image.open(file.stream).convert("RGB")
            full_text = pytesseract.image_to_string(img)

        if not full_text.strip():
            return jsonify({'success': False, 'error': 'Не удалось извлечь текст'}), 400

        # GPT-подключение
        client = get_openai_client()
        prompt = f"""
        You are a specialized assistant that extracts structured data from auto repair or maintenance invoices.

        Your job is to return the following JSON format:

        {{
          "date": "",
          "invoice_no": "",
          "shop": "",
          "shop_address": "",
          "phone_number": "",
          "mileage": "",
          "amount": "",
          "description": ""
        }}

        For the "description" field:

        1. Identify each labor/service performed in the document. For each labor:
           - Extract its name and cost (if present).
        2. Then find all parts related to that labor, with names and prices.
        3. Format the description clearly, as:

        Labor: <labor name> ($<price>)
          Parts: 
          <part1> ($<price>), 
          <part2> ($<price>)

        If any price is missing, leave it blank like ($).

        Separate each labor block with a new line.

        If a field (e.g., invoice number or mileage) is not found, leave it empty.

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

        parsed = json.loads(result)
        return jsonify({'success': True, 'fields': parsed})

    except Exception as e:
        logging.error(f"Ошибка при анализе документа: {e}")
        return jsonify({'success': False, 'error': 'Ошибка при анализе документа'}), 500

