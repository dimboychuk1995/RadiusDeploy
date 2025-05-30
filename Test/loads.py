import logging
import json
from datetime import datetime
from email.mime.application import MIMEApplication


from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from bson.objectid import ObjectId
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import gridfs
import fitz  # PyMuPDF
from PIL import Image
import pytesseract
import requests
from Test.auth import requires_role
from Test.tools.gpt_connection import get_openai_client
from Test.tools.db import db
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from xhtml2pdf import pisa
from io import BytesIO
from jinja2 import Template

loads_bp = Blueprint('loads', __name__)

fs = gridfs.GridFS(db)

loads_collection = db['loads']
drivers_collection = db['drivers']

companies = list(db["companies"].find({}, {"_id": 1, "name": 1}))
dispatchers = list(db["users"].find({"role": "dispatch"}, {"_id": 1, "username": 1}))

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
    Analyze the following Rate Con or BOL text and fill in the JSON structure as accurately as possible.

    🟡 RULES:
    - Return ONLY valid JSON (no comments, no explanations).
    - Leave fields blank if missing.
    - Return dates in format: MM/DD/YYYY.
    - Return price as: ####.## (2 decimals).
    - Do NOT include extra Pickup or Delivery entries if they are not in the document.
    - If there is only one pickup or delivery, include only one object in the array.

    🔁 JSON FORMAT:
    {{
        "Load Number": "",
        "Broker Name": "",
        "Type Of Load": "",
        "Broker Phone Number": "",
        "Broker Email": "",
        "Price": "",
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

    def remove_empty_stops(stops):
        return [stop for stop in stops if stop.get("Address", "").strip()]

    try:
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
            "Rate per Mile": "",
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

        # Удаляем пустые pickup/delivery объекты
        merged_result["Pickup Locations"] = remove_empty_stops(merged_result["Pickup Locations"])
        merged_result["Delivery Locations"] = remove_empty_stops(merged_result["Delivery Locations"])

        return jsonify(merged_result)

    except Exception as e:
        logging.exception("Ошибка при OCR и обработке PDF")
        return jsonify({'error': f'Ошибка при обработке файла: {str(e)}'}), 500

@loads_bp.route('/add_load', methods=['POST'])
@requires_role(['admin', 'dispatch'])
def add_load():
    try:
        rate_con_file = request.files.get('rate_con')
        bol_file = request.files.get('bol')

        rate_con_id = fs.put(rate_con_file, filename=secure_filename(rate_con_file.filename)) if rate_con_file and rate_con_file.filename else None
        bol_id = fs.put(bol_file, filename=secure_filename(bol_file.filename)) if bol_file and bol_file.filename else None

        # === Проверка и добавление брокера/кастомера ===
        partner_type = request.form.get("broker_customer_type", "broker")
        partner_name = request.form.get("broker_load_id")
        partner_email = request.form.get("broker_email")
        partner_phone = request.form.get("broker_phone_number")

        broker_id = None
        if partner_name:
            collection = db["brokers"] if partner_type == "broker" else db["customers"]
            existing = collection.find_one({
                "name": partner_name,
                "company": current_user.company
            })

            if existing:
                broker_id = existing["_id"]
            else:
                broker_id = collection.insert_one({
                    "name": partner_name,
                    "email": partner_email,
                    "phone": partner_phone,
                    "company": current_user.company
                }).inserted_id

        # === Extra pickups ===
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

        # === Extra deliveries ===
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

        # === Vehicles ===
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

        # === Груз ===
        load_data = {
            "load_id": request.form.get("load_id"),
            "company_sign": ObjectId(request.form.get("company_sign")) if request.form.get("company_sign") else None,
            "broker_load_id": partner_name,
            "broker_id": broker_id,
            "broker_customer_type": partner_type,
            "broker_email": partner_email,
            "broker_phone_number": partner_phone,
            "type": request.form.get("type"),
            "weight": request.form.get("weight"),
            "RPM": request.form.get("RPM"),
            "price": request.form.get("price"),
            "total_miles": request.form.get("total_miles"),
            "load_description": request.form.get("load_description"),
            "vehicles": vehicles if vehicles else None,
            "assigned_driver": ObjectId(request.form.get("assigned_driver")) if request.form.get("assigned_driver") else None,
            "assigned_dispatch": ObjectId(request.form.get("assigned_dispatch")) if request.form.get("assigned_dispatch") else None,
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

        # === Отправка email водителю ===
        if load_data.get("assigned_driver"):
            driver = drivers_collection.find_one({"_id": load_data["assigned_driver"]})
            company = db["companies"].find_one({"name": "UWC"})

            if driver and driver.get("email") and company and company.get("email") and company.get("password"):
                try:
                    print("📨 Попытка отправить email водителю")
                    send_load_email_to_driver(
                        company_email=company["email"],
                        company_password=company["password"],
                        driver_email=driver["email"],
                        driver_name=driver["name"],
                        load_info=load_data
                    )
                except Exception as e:
                    logging.warning(f"❌ Ошибка отправки email водителю: {str(e)}")

        return redirect(url_for('index') + '#section-loads-fragment')

    except Exception as e:
        logging.exception("Ошибка при добавлении груза")
        return render_template("error.html", message="Ошибка при сохранении груза")


@loads_bp.route('/api/brokers_list')
@login_required
def brokers_list():
    brokers = db["brokers"].find({"company": current_user.company})
    return jsonify([
        {"name": b["name"], "email": b.get("email", ""), "phone": b.get("phone", "")}
        for b in brokers
    ])

@loads_bp.route('/api/customers_list')
@login_required
def customers_list():
    customers = db["customers"].find({"company": current_user.company})
    return jsonify([
        {"name": c["name"], "email": c.get("email", ""), "phone": c.get("phone", "")}
        for c in customers
    ])

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
        return render_template("fragments/loads_fragment.html", drivers=drivers, loads=loads, companies=companies, dispatchers=dispatchers)
    except Exception as e:
        return render_template("error.html", message="Ошибка загрузки фрагмента грузов")


@loads_bp.route('/api/get_mileage', methods=['POST'])
@login_required
def get_mileage():
    try:
        data = request.get_json()
        origin = data.get("origin")
        destination = data.get("destination")

        if not origin or not destination:
            return jsonify({"error": "Missing origin or destination"}), 400

        setting = db['integrations_settings'].find_one({
            'name': "Google Maps API",
        })
        api_key = setting.get('api_key') if setting else None
        if not api_key:
            return jsonify({"error": "API key not found"}), 400

        url = f"https://maps.googleapis.com/maps/api/directions/json?origin={origin}&destination={destination}&key={api_key}"
        resp = requests.get(url)
        data = resp.json()

        if data["status"] != "OK":
            return jsonify({"error": "Google Maps API error", "details": data}), 400

        meters = sum(leg["distance"]["value"] for leg in data["routes"][0]["legs"])
        miles = meters / 1609.34

        return jsonify({"miles": round(miles)})

    except Exception as e:
        logging.exception("Mileage fetch error")
        return jsonify({"error": str(e)}), 500


def send_load_email_to_driver(company_email, company_password, driver_email, driver_name, load_info):
    subject = f"🚚 Новый груз для {driver_name}"
    body = f"""
Привет, {driver_name}!

Вам назначен новый груз. Подробности — в прикреплённом PDF-файле.

Удачи в рейсе!
    """

    msg = MIMEMultipart()
    msg['From'] = company_email
    msg['To'] = driver_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    pdf_buffer = generate_load_pdf(load_info)
    pdf_attachment = MIMEApplication(pdf_buffer.read(), _subtype="pdf")
    pdf_attachment.add_header('Content-Disposition', 'attachment', filename="LoadDetails.pdf")
    msg.attach(pdf_attachment)

    with smtplib.SMTP('smtp.gmail.com', 587) as server:
        server.starttls()
        server.login(company_email, company_password)
        server.send_message(msg)

    logging.info(f"📧 Email с красивым PDF отправлен на {driver_email}")


def generate_load_pdf(load_info):
    html_template = """
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #1a3568; }
            .section { margin-bottom: 20px; }
            .label { font-weight: bold; }
            .box { border: 1px solid #ccc; padding: 10px; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>Load Summary</h1>

        <div class="section box">
            <div><span class="label">Load ID:</span> {{ load.load_id or '—' }}</div>
            <div><span class="label">Description:</span> {{ load.load_description or '—' }}</div>
            <div><span class="label">Price:</span> ${{ load.price or '—' }}</div>
            <div><span class="label">Weight:</span> {{ load.weight or '—' }} lbs</div>
            <div><span class="label">Rate per Mile:</span> {{ load.RPM or '—' }}</div>
        </div>

        <div class="section box">
            <h2>📦 Pickup</h2>
            <div>{{ load.pickup.company }}</div>
            <div>{{ load.pickup.address }}</div>
            <div>Date: {{ load.pickup.date }}</div>
        </div>

        <div class="section box">
            <h2>📬 Delivery</h2>
            <div>{{ load.delivery.company }}</div>
            <div>{{ load.delivery.address }}</div>
            <div>Date: {{ load.delivery.date }}</div>
        </div>
    </body>
    </html>
    """

    template = Template(html_template)
    rendered_html = template.render(load=load_info)

    pdf_io = BytesIO()
    result = pisa.CreatePDF(rendered_html, dest=pdf_io)
    if result.err:
        raise Exception("❌ Ошибка генерации PDF")

    pdf_io.seek(0)
    return pdf_io