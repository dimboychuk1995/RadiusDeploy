import logging
import traceback
import json
from datetime import datetime
from email.mime.application import MIMEApplication

from bson import json_util
from flask import Blueprint, render_template, request, redirect, url_for, jsonify, g, current_app
from bson.objectid import ObjectId
from flask_cors import cross_origin, CORS
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import gridfs
import fitz
from PIL import Image
import pytesseract
import requests
from auth import requires_role
from tools.gpt_connection import get_openai_client
from tools.db import db
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from xhtml2pdf import pisa
from io import BytesIO
from jinja2 import Template
from flask import send_file
import pytz
from utils.notifications import send_push_notification
from tools.jwt_auth import jwt_required

loads_bp = Blueprint('loads', __name__)

fs = gridfs.GridFS(db)

loads_collection = db['loads']
drivers_collection = db['drivers']
users_collection = db['users']
companies_collection = db["companies"]

companies = list(db["companies"].find({}, {"_id": 1, "name": 1}))
dispatchers = list(db["users"].find({"role": "dispatch"}, {"_id": 1, "username": 1}))

ALLOWED_EXTENSIONS = {'pdf'}

def parse_date(date_str):
    if not date_str or not date_str.strip():
        return None
    try:
        # Попробуем разные форматы (добавь свои, если надо)
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%d %H:%M"):
            try:
                naive = datetime.strptime(date_str.strip(), fmt)
                local_tz = pytz.timezone("America/Chicago")  # или твоя таймзона
                local_dt = local_tz.localize(naive)
                return local_dt.astimezone(pytz.utc)
            except ValueError:
                continue
        raise ValueError("Не удалось распарсить дату")
    except Exception as e:
        logging.warning(f"❌ Ошибка в parse_date('{date_str}'): {e}")
        return None

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def ask_gpt(content):
    client = get_openai_client()

    prompt = f"""
You are a logistics assistant. Parse the following document (Rate Confirmation or BOL) into strict JSON format.

📌 RULES:
- Return ONLY valid JSON — no markdown, no explanations.
- Use double quotes (") for all keys and values.
- Use date format: MM/DD/YYYY.
- Use time format: hh:mm AM/PM.
- Use price format: ####.## (two decimals), without currency symbols.
- Use empty strings for missing values.
- Do NOT invent data — if something is missing, leave it blank.
- Include each real pickup or delivery as a separate object in the list.
- The Broker Name is usually found in the top-left or top-center area of the document — typically as a logo or heading.

📌 SPECIAL INSTRUCTIONS LOGIC:
- Instructions may appear throughout the document — at the top, bottom, or near specific stops.
- If an instruction clearly refers to a specific pickup or delivery stop, add it into that stop’s **Instructions** field.
- In this case, also include it in the general **Load Description** field.
- If instructions are general and not tied to a specific stop, include them only in **Load Description**.
- If multiple instruction fragments refer to the same stop, append them to that stop’s **Instructions** field — do not overwrite.
- Always collect all instruction texts found — don’t discard any valid instruction.

🔁 OUTPUT FORMAT EXAMPLE:
{{
  "Load Number": "123456",
  "Broker Name": "ABC Logistics",
  "Type Of Load": "Dry Van",
  "Broker Phone Number": "555-123-4567",
  "Broker Email": "abc@logistics.com",
  "Price": "1500.00",
  "Weight": "42000",
  "Load Description": "Frozen food",
  "Pickup Locations": [
    {{
      "Company": "Walmart",
      "Address": "123 Main St, Dallas, TX",
      "Date": "06/01/2025",
      "Time": "08:00 AM",
      "Instructions": "Go to dock 5",
      "Location Phone Number": "555-999-8888",
      "Contact Person": "John Doe",
      "Contact Email": "john@example.com"
    }}
  ],
  "Delivery Locations": [
    {{
      "Company": "Kroger",
      "Address": "789 Oak Rd, Atlanta, GA",
      "Date": "06/03/2025",
      "Time": "02:00 PM",
      "Instructions": "Call before arrival",
      "Location Phone Number": "555-888-7777",
      "Contact Person": "Jane Smith",
      "Contact Email": "jane@example.com"
    }}
  ]
}}

Document:
-----
{content}
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        message = response.choices[0].message.content.strip()

        # Очистка от markdown
        if message.startswith("```json"):
            message = message[len("```json"):].strip()
        if message.startswith("```"):
            message = message[len("```"):].strip()
        if message.endswith("```"):
            message = message[:-len("```")].strip()

        result = json.loads(message)

        # 🧹 Минимальная валидация и доп. очистка
        expected_keys = [
            "Load Number", "Broker Name", "Type Of Load", "Broker Phone Number",
            "Broker Email", "Price", "Weight", "Load Description",
            "Pickup Locations", "Delivery Locations"
        ]

        for key in expected_keys:
            if key not in result:
                result[key] = "" if "Locations" not in key else []

        # Удаление пустых pickup/delivery
        def clean_stops(stops):
            return [s for s in stops if s.get("Address", "").strip()]

        result["Pickup Locations"] = clean_stops(result["Pickup Locations"])
        result["Delivery Locations"] = clean_stops(result["Delivery Locations"])

        return result

    except Exception as e:
        raise Exception(f"❌ OpenAI error: {str(e)}")

@loads_bp.route('/api/parse_load_pdf', methods=['POST'])
def parse_load_pdf():
    file = request.files.get('file')
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Допустим только PDF'}), 400

    try:
        pdf_bytes = file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        # Собираем весь текст сразу
        full_text = ""
        for i in range(len(doc)):
            try:
                page_text = doc[i].get_text().strip()
                if not page_text:
                    pix = doc[i].get_pixmap(dpi=300)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    page_text = pytesseract.image_to_string(img)

                if page_text.strip():
                    full_text += page_text + "\n\n"
            except Exception as e:
                logging.warning(f"❌ Ошибка при обработке страницы {i + 1}: {str(e)}")

        # Один вызов GPT на весь текст
        result = ask_gpt(full_text)

        # Добавим обязательные поля (если GPT их пропустил)
        merged_result = {
            "Load Number": result.get("Load Number", ""),
            "Broker Name": result.get("Broker Name", ""),
            "Type Of Load": result.get("Type Of Load", ""),
            "Broker Phone Number": result.get("Broker Phone Number", ""),
            "Broker Email": result.get("Broker Email", ""),
            "Price": result.get("Price", ""),
            "Total Miles": "",
            "Rate per Mile": "",
            "Weight": result.get("Weight", ""),
            "Load Description": result.get("Load Description", ""),
            "Pickup Locations": result.get("Pickup Locations", []),
            "Delivery Locations": result.get("Delivery Locations", [])
        }

        def remove_empty_stops(stops):
            return [stop for stop in stops if stop.get("Address", "").strip()]

        merged_result["Pickup Locations"] = remove_empty_stops(merged_result["Pickup Locations"])
        merged_result["Delivery Locations"] = remove_empty_stops(merged_result["Delivery Locations"])

        return jsonify(merged_result)

    except Exception as e:
        logging.exception("Ошибка при OCR и обработке PDF")
        return jsonify({'error': f'Ошибка при обработке файла: {str(e)}'}), 500

@loads_bp.route('/add_load', methods=['POST'])
@requires_role(['admin', 'dispatch'])
def add_load():
    def try_parse_float(value):
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    try:
        print("🟡 add_load() вызван")
        print("🧩 Начинаем обработку формы")

        rate_con_file = request.files.get('rate_con')
        bol_file = request.files.get('bol')
        print("✅ Обработаны файлы")

        rate_con_id = fs.put(rate_con_file, filename=secure_filename(rate_con_file.filename)) if rate_con_file and rate_con_file.filename else None
        bol_id = fs.put(bol_file, filename=secure_filename(bol_file.filename)) if bol_file and bol_file.filename else None

        partner_type = request.form.get("broker_customer_type", "broker")
        partner_name = request.form.get("broker_load_id")
        partner_email = request.form.get("broker_email")
        partner_phone = request.form.get("broker_phone_number")

        print(f"🧾 Broker/customer type: {partner_type}, name: {partner_name}")

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

        print("✅ Обработан брокер")

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

        print("✅ Обработаны extra pickups")

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

        print("✅ Обработаны extra deliveries")

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

        print("✅ Обработаны vehicles")

        assigned_driver_id = request.form.get("assigned_driver")
        print(f"👤 Получен assigned_driver: {assigned_driver_id}")

        assigned_power_unit = None
        if assigned_driver_id:
            driver = drivers_collection.find_one({
                "_id": ObjectId(assigned_driver_id),
                "company": current_user.company
            })
            print(f"🔍 Найден водитель: {driver}")
            if driver and driver.get("truck"):
                assigned_power_unit = driver["truck"]

        company_sign_raw = request.form.get("company_sign")
        company_sign = ObjectId(company_sign_raw) if company_sign_raw and ObjectId.is_valid(company_sign_raw) else None

        load_data = {
            "load_id": request.form.get("load_id"),
            "company_sign": company_sign,
            "broker_load_id": partner_name,
            "broker_id": broker_id,
            "broker_customer_type": partner_type,
            "broker_email": partner_email,
            "broker_phone_number": partner_phone,
            "type": request.form.get("type"),
            "weight": try_parse_float(request.form.get("weight")),
            "RPM": try_parse_float(request.form.get("RPM")),
            "price": try_parse_float(request.form.get("price")),
            "total_miles": try_parse_float(request.form.get("total_miles")),
            "load_description": request.form.get("load_description"),
            "vehicles": vehicles if vehicles else None,
            "assigned_driver": ObjectId(assigned_driver_id) if assigned_driver_id else None,
            "assigned_dispatch": ObjectId(request.form.get("assigned_dispatch")) if request.form.get("assigned_dispatch") else None,
            "assigned_power_unit": assigned_power_unit,
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

        print("📦 Собран load_data, вставляем в базу...")
        loads_collection.insert_one(load_data)

        assigned_driver_obj_id = load_data.get("assigned_driver")
        if assigned_driver_obj_id:
            driver = drivers_collection.find_one({"_id": assigned_driver_obj_id})
            print(f"👤 Водитель для push: {driver}")
            company = db["companies"].find_one({"name": "UWC"})

            if driver and driver.get("email") and company and company.get("email") and company.get("password"):
                try:
                    send_load_email_to_driver(
                        company_email=company["email"],
                        company_password=company["password"],
                        driver_email=driver["email"],
                        driver_name=driver["name"],
                        load_info=load_data
                    )
                except Exception as e:
                    print(f"❌ Ошибка email: {str(e)}")

            expo_token = driver.get("expo_push_token")
            print(f"📱 expo_push_token: {expo_token}")

            if expo_token:
                pickup = load_data["pickup"]["address"]
                delivery = load_data["delivery"]["address"]
                load_id_str = load_data.get("load_id", "Новый груз")

                print("📤 Отправка PUSH...")
                send_push_notification(
                    expo_token,
                    title=f"📦 Назначен новый груз {load_id_str}",
                    body=f"{pickup} → {delivery}"
                )
            else:
                print("⚠️ У водителя нет push токена")

        print("✅ Успешно завершено, redirect...")
        return redirect(url_for('index') + '#section-loads-fragment')

    except Exception as e:
        print("❌ Ошибка в add_load:")
        traceback.print_exc()
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
    from datetime import datetime, timezone
    import pytz

    try:
        # Таймзона компании
        local_tz = pytz.timezone("America/Chicago")  # можно заменить динамически

        # Функция преобразования даты из UTC → local → строка
        def to_local_str(dt):
            if not dt or not isinstance(dt, datetime):
                return ""
            local_dt = dt.replace(tzinfo=timezone.utc).astimezone(local_tz)
            return local_dt.strftime("%m/%d/%Y")

        # Получаем все компании (если используется в шаблоне)
        companies = list(db["companies"].find({}, {"_id": 1, "name": 1}))

        # Получаем всех водителей компании
        all_drivers = list(drivers_collection.find(
            {'company': current_user.company},
            {"_id": 1, "name": 1, "dispatcher": 1, "status": 1, "truck": 1}
        ))

        # Фильтрация: активные с траками
        filtered_drivers = [
            d for d in all_drivers
            if d.get('status') == 'Active' and d.get('truck')
        ]

        # Если диспетчер — сортировка водителей
        if hasattr(current_user, 'role') and current_user.role == 'dispatch':
            dispatcher_id = ObjectId(current_user.get_id())
            own_drivers = [d for d in filtered_drivers if d.get('dispatcher') == dispatcher_id]
            other_drivers = [d for d in filtered_drivers if d.get('dispatcher') != dispatcher_id]
            drivers = own_drivers + other_drivers
        else:
            drivers = filtered_drivers

        # Карта ID -> имя
        driver_map = {str(d['_id']): d['name'] for d in drivers}

        # Все диспетчеры компании
        dispatchers = list(users_collection.find(
            {'company': current_user.company, 'role': 'dispatch'},
            {"_id": 1, "username": 1}
        ))

        # Грузы
        loads = list(loads_collection.find(
            {'company': current_user.company},
            {
                "load_id": 1,
                "broker_load_id": 1,
                "type": 1,
                "assigned_driver": 1,
                "pickup.address": 1,
                "pickup.date": 1,
                "delivery.address": 1,
                "delivery.date": 1,
                "extra_delivery": 1,
                "extra_deliveries": 1,
                "price": 1,
                "RPM": 1,
                "status": 1,
                "payment_status": 1,
                "extra_stops": 1,
                "company_sign": 1
            }
        ))

        # Обогащение
        for load in loads:
            driver_id = load.get("assigned_driver")
            load["driver_name"] = driver_map.get(str(driver_id), "—") if driver_id else "—"

            if load.get("company_sign"):
                load["company_sign"] = str(load["company_sign"])

            # pickup date
            pickup_dt = load.get("pickup", {}).get("date")
            load["pickup_date"] = to_local_str(pickup_dt)

            # delivery date
            extra_deliveries = load.get("extra_delivery") or load.get("extra_deliveries") or []
            if extra_deliveries:
                last_delivery = extra_deliveries[-1]
                delivery_dt = last_delivery.get("date")
            else:
                delivery_dt = load.get("delivery", {}).get("date")
            load["delivery_date"] = to_local_str(delivery_dt)

        return render_template(
            "fragments/loads_fragment.html",
            drivers=drivers,
            loads=loads,
            companies=companies,
            dispatchers=dispatchers,
            current_user=current_user,
            current_user_id=str(current_user.get_id())
        )

    except Exception as e:
        return render_template("error.html", message="Ошибка загрузки фрагмента грузов")


@loads_bp.route("/api/get_mileage", methods=["POST"])
@login_required
def get_mileage():
    data = request.get_json()
    origin = data.get("origin")
    destination = data.get("destination")

    if not origin or not destination:
        return jsonify({"error": "Missing origin or destination"}), 400

    try:
        integration = db["integrations_settings"].find_one({"name": "Google Maps API"})

        if not integration or not integration.get("api_key"):
            return jsonify({"error": "Google Maps API key not found"}), 500

        api_key = integration["api_key"]

        params = {
            "origins": origin,
            "destinations": destination,
            "key": api_key
        }

        res = requests.get("https://maps.googleapis.com/maps/api/distancematrix/json", params=params)
        res.raise_for_status()

        result = res.json()

        rows = result.get("rows", [])
        if not rows or not rows[0].get("elements"):
            return jsonify({"error": "Invalid response from Google Maps"}), 500

        distance_data = rows[0]["elements"][0]

        if distance_data.get("status") != "OK":
            return jsonify({"error": f"Google Maps error: {distance_data.get('status')}"}), 400

        miles = distance_data["distance"]["value"] / 1609.34
        return jsonify({"miles": round(miles)})

    except Exception as e:
        import traceback
        traceback.print_exc()  # ← это покажет точную строку ошибки
        return jsonify({"error": "Server error"}), 500



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


@loads_bp.route('/api/delete_load/<load_id>', methods=['DELETE'])
@login_required
def delete_load(load_id):
    try:
        load = loads_collection.find_one({"_id": ObjectId(load_id), "company": current_user.company})
        if not load:
            return jsonify({"success": False, "message": "Груз не найден"}), 404

        # Удаление вложенных файлов, если нужно
        if load.get("rate_con"):
            fs.delete(load["rate_con"])
        if load.get("bol"):
            fs.delete(load["bol"])

        loads_collection.delete_one({"_id": ObjectId(load_id)})
        return jsonify({"success": True})
    except Exception as e:
        logging.exception("Ошибка при удалении груза")
        return jsonify({"success": False, "message": "Ошибка сервера"}), 500

@loads_bp.route("/api/load/<load_id>/ratecon")
@login_required
def download_ratecon(load_id):
    try:
        load = loads_collection.find_one({"_id": ObjectId(load_id), "company": current_user.company})
        if not load or not load.get("rate_con"):
            return "Rate Con not found", 404

        file = fs.get(load["rate_con"])
        return send_file(BytesIO(file.read()), download_name="RateCon.pdf", mimetype='application/pdf')
    except Exception as e:
        logging.exception("Ошибка при загрузке Rate Con")
        return "Server error", 500

@loads_bp.route("/api/load/<load_id>/bol")
@login_required
def download_bol(load_id):
    try:
        load = loads_collection.find_one({"_id": ObjectId(load_id), "company": current_user.company})
        if not load or not load.get("bol"):
            return "BOL not found", 404

        file = fs.get(load["bol"])
        return send_file(BytesIO(file.read()), download_name="BOL.pdf", mimetype='application/pdf')
    except Exception as e:
        logging.exception("Ошибка при загрузке BOL")
        return "Server error", 500

@loads_bp.route('/fragment/load_details_fragment')
@login_required
def load_details_fragment():
    try:
        load_id = request.args.get("id")
        if not load_id:
            return "Missing load ID", 400

        load = loads_collection.find_one({"_id": ObjectId(load_id), "company": current_user.company})
        if not load:
            return "Load not found", 404

        # Приведение потенциально отсутствующих полей к пустым спискам
        load["extra_pickups"] = load.get("extra_pickups") or []
        load["extra_deliveries"] = load.get("extra_deliveries") or []

        driver = None
        if load.get("assigned_driver"):
            driver = drivers_collection.find_one({"_id": load.get("assigned_driver")})

        mapbox_token = db["integrations_settings"].find_one({"name": "MapBox"}).get("api_key", "")

        return render_template(
            "fragments/load_details_fragment.html",
            load=load,
            driver=driver,
            mapbox_token=mapbox_token,
            load_id=str(load["_id"])
        )

    except Exception as e:
        logging.exception("Ошибка при загрузке фрагмента деталей груза")
        return "Server error", 500


import threading

@loads_bp.route('/api/assign_driver', methods=['POST'])
@login_required
def assign_driver_to_load():
    try:
        data = request.get_json()
        load_id = data.get("load_id")
        driver_id = data.get("driver_id")

        if not load_id or not driver_id:
            return jsonify({"success": False, "message": "ID груза и водителя обязательны"}), 400

        load = loads_collection.find_one({"_id": ObjectId(load_id)})
        if not load:
            return jsonify({"success": False, "message": "Груз не найден"}), 404

        driver = drivers_collection.find_one({"_id": ObjectId(driver_id)})
        if not driver:
            return jsonify({"success": False, "message": "Водитель не найден"}), 404

        update_fields = {
            "assigned_driver": ObjectId(driver_id)
        }
        if driver.get("truck"):
            update_fields["assigned_power_unit"] = driver["truck"]

        loads_collection.update_one({"_id": ObjectId(load_id)}, {"$set": update_fields})

        # === EMAIL отправляем асинхронно ===
        if driver.get("email"):
            company = db["companies"].find_one({"name": driver.get("company")})
            if company and company.get("email") and company.get("password"):
                def send_email():
                    try:
                        send_load_email_to_driver(
                            company_email=company["email"],
                            company_password=company["password"],
                            driver_email=driver["email"],
                            driver_name=driver["name"],
                            load_info=load
                        )
                    except Exception as e:
                        import logging
                        logging.warning(f"❌ Ошибка при отправке email: {e}")
                threading.Thread(target=send_email).start()

        return jsonify({"success": True})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": "Ошибка сервера"}), 500


# ======================= API: Мобильное приложение =======================
@loads_bp.route("/api/loads/<load_id>/upload_photos", methods=["POST"])
@cross_origin()
def upload_load_photos(load_id):
    print("📥 Получен upload для load_id:", load_id)
    print("📥 request.form:", dict(request.form))
    print("📥 request.files:", request.files)

    stage = request.form.get("stage")
    if stage not in ["pickup", "delivery"]:
        return jsonify({"success": False, "error": "Invalid stage"}), 400

    load = loads_collection.find_one({"load_id": load_id})
    if not load:
        return jsonify({"success": False, "error": "Load not found"}), 404

    files = request.files.getlist("photos")
    if not files:
        return jsonify({"success": False, "error": "No files uploaded"}), 400

    saved_ids = []
    for file in files:
        filename = secure_filename(file.filename)
        file_id = fs.put(file, filename=filename, content_type=file.content_type,
                         metadata={"load_id": load_id, "stage": stage})
        saved_ids.append(file_id)

    update_fields = {f"{stage}_photo_ids": saved_ids}

    # Автообновление статуса
    status = str(load.get("status", "")).lower()
    if stage == "pickup" and status == "new":
        update_fields["status"] = "picked_up"
    elif stage == "delivery" and status == "picked_up":
        update_fields["status"] = "delivered"

    loads_collection.update_one({"_id": load["_id"]}, {"$set": update_fields})

    return jsonify({
        "success": True,
        "message": "Photos uploaded",
        "file_ids": [str(fid) for fid in saved_ids]
    })



@loads_bp.route("/api/loads", methods=["GET"])
@jwt_required
def get_loads():
    from flask import g  # ⬅️ важно
    try:
        page = int(request.args.get("page", 1))
        per_page = 10

        query = {}

        if g.role == "driver":
            user = users_collection.find_one({"_id": ObjectId(g.user_id)})
            if not user or "driver_id" not in user:
                return jsonify({"success": False, "error": "Driver not found or missing driver_id"}), 404

            query["assigned_driver"] = ObjectId(user["driver_id"])
        # ⬇️ иначе оставляем query пустым = все грузы

        total = loads_collection.count_documents(query)
        cursor = loads_collection.find(query).skip((page - 1) * per_page).limit(per_page)

        result = []
        for load in cursor:
            delivery_date = load.get("delivery", {}).get("date")
            delivery_address = load.get("delivery", {}).get("address")
            extra_deliveries = load.get("extra_delivery", [])
            if extra_deliveries:
                last_extra = extra_deliveries[-1]
                delivery_date = last_extra.get("date", delivery_date)
                delivery_address = last_extra.get("address", delivery_address)

            result.append({
                "load_id": load.get("load_id"),
                "pickup_address": load.get("pickup", {}).get("address", ""),
                "pickup_date": load.get("pickup", {}).get("date"),
                "delivery_address": delivery_address,
                "delivery_date": delivery_date,
                "price": load.get("price"),
                "RPM": load.get("RPM"),
            })

        return jsonify({
            "success": True,
            "loads": result,
            "page": page,
            "per_page": per_page
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@loads_bp.route("/api/load/<load_id>", methods=["GET"])
@cross_origin()
@jwt_required
def get_load_details(load_id):
    try:
        load = loads_collection.find_one({"load_id": load_id})

        def photo_urls(field_name):
            return [
                f"/api/load/photo/{str(photo_id)}"
                for photo_id in load.get(field_name, [])
                if ObjectId.is_valid(str(photo_id))
            ]

        load["pickup_photo_urls"] = photo_urls("pickup_photo_ids")
        load["delivery_photo_urls"] = photo_urls("delivery_photo_ids")
        load["_id"] = str(load["_id"])

        return current_app.response_class(
            response=json_util.dumps({"success": True, "load": load}),
            status=200,
            mimetype="application/json"
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@loads_bp.route("/api/load/photo/<photo_id>", methods=["GET"])
@cross_origin()
def get_load_photo(photo_id):
    try:
        file_obj = fs.get(ObjectId(photo_id))
        return send_file(
            BytesIO(file_obj.read()),
            mimetype=file_obj.content_type or "image/jpeg",
            as_attachment=False,
            download_name=file_obj.filename
        )
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Cannot retrieve photo: {str(e)}"
        }), 404
