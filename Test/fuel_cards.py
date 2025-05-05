from collections import defaultdict
from datetime import datetime, timedelta

from flask import Blueprint, render_template, jsonify, request
from flask_login import login_required, current_user
from pymongo import MongoClient
from bson.objectid import ObjectId
import logging
from PyPDF2 import PdfReader
import re
from io import BytesIO

logging.basicConfig(level=logging.ERROR)
fuel_cards_bp = Blueprint('fuel_cards', __name__)

try:
    client = MongoClient("mongodb+srv://dimboychuk1995:Mercedes8878@trucks.5egoxb8.mongodb.net/trucks_db")
    db = client['trucks_db']
    drivers_collection = db['drivers']
    fuel_cards_collection = db['fuel_cards']  # 🔹 создаём новую коллекцию
    fuel_cards_transactions_collection = db['fuel_cards_transactions']
    client.admin.command('ping')
except Exception as e:
    logging.error(f"Failed to connect to MongoDB: {e}")
    exit(1)


def format_week_range(billing_date_str):
    try:
        billing_date = datetime.strptime(billing_date_str, "%m/%d/%Y")
        previous_sunday = billing_date - timedelta(days=1)
        start_of_week = previous_sunday - timedelta(days=6)
        return f"{start_of_week.strftime('%m/%d/%Y')} - {previous_sunday.strftime('%m/%d/%Y')}"
    except Exception as e:
        return ""

def extract_text_from_pdf_file(file_storage):
    reader = PdfReader(file_storage)
    text = ''
    for page in reader.pages:
        text += page.extract_text() or ''
    return text

def extract_billing_date(text):
    match = re.search(r'Billing Date:\s*(\d{1,2}/\d{1,2}/\d{4})', text)
    return match.group(1) if match else None

def parse_pdf_transactions(file_storage):
    text = extract_text_from_pdf_file(file_storage)
    billing_date = extract_billing_date(text)

    # Card → Driver mapping
    driver_map = {
        match.group(1): match.group(2)
        for match in re.finditer(r"Subtotal for Card (\d+) - (.+)", text)
    }

    pattern = re.compile(
        r"(?P<card>\d{3})\s+"
        r"(?P<date>\d{1,2}/\d{1,2}/\d{4})\s+"
        r"(?P<transaction>\d+)\s+"
        r"(?P<location>.+?)\s+(?P<state>[A-Z]{2})\s+"
        r"(?P<product>[A-Za-z\s]+?)\s+"
        r"(?P<driver_id>\d{6})\s+"
        r"(?P<vehicle_id>\d+)\s+"
        r"(?P<qty>\d+\.\d+)?\s*"
        r"\$(?P<fuel>\d+\.\d{2})\s+"
        r"(?:\$\d+\.\d{2}\s+)?"  # merch
        r"\$(?P<retail>\d+\.\d{2})\s+"
        r"\$(?P<invoice>\d+\.\d{2})"
    )

    transactions = []
    for m in pattern.finditer(text):
        transactions.append({
            "billing_date": billing_date,
            "card_number": m.group("card"),
            "date": m.group("date"),
            "transaction_number": m.group("transaction"),
            "driver_id": m.group("driver_id"),
            "vehicle_id": m.group("vehicle_id"),
            "qty": float(m.group("qty") or 0),
            "fuel_total": float(m.group("fuel")),
            "retail_price": float(m.group("retail")),
            "invoice_total": float(m.group("invoice")),
            "state": m.group("state"),
            "driver_name": driver_map.get(m.group("card"), f"Card {m.group('card')}"),
        })

    return transactions


@fuel_cards_bp.route('/fragment/fuel_cards')
@login_required
def fuel_cards_fragment():
    return render_template('fragments/fuel_cards_fragment.html')

# 🔹 Вернём водителей для селекта
@fuel_cards_bp.route('/fuel_cards/drivers')
@login_required
def get_drivers_for_fuel_cards():
    try:
        drivers = drivers_collection.find({'company': current_user.company}, {"name": 1})
        result = [{"_id": str(driver["_id"]), "name": driver.get("name", "Без имени")} for driver in drivers]
        return jsonify(result)
    except Exception as e:
        logging.error(f"Error fetching drivers: {e}")
        return jsonify([]), 500

@fuel_cards_bp.route('/fuel_cards/create', methods=['POST'])
@login_required
def create_fuel_card():
    try:
        data = request.get_json()
        new_card = {
            "provider": data.get("provider"),
            "card_number": data.get("card_number"),
            "driver_id": data.get("driver_id"),
            "vehicle_id": data.get("vehicle_id"),
            "assigned_driver": ObjectId(data.get("assigned_driver")) if data.get("assigned_driver") else None,
            "company": current_user.company
        }
        fuel_cards_collection.insert_one(new_card)
        return jsonify({"success": True})
    except Exception as e:
        logging.error(f"Ошибка при создании карты: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@fuel_cards_bp.route('/fuel_cards/list')
@login_required
def get_fuel_cards():
    try:
        cards = list(fuel_cards_collection.find({'company': current_user.company}))
        result = []

        for card in cards:
            assigned_driver_name = ''
            if card.get('assigned_driver'):
                driver = drivers_collection.find_one({'_id': card['assigned_driver']})
                assigned_driver_name = driver['name'] if driver else '—'

            result.append({
                "provider": card.get("provider"),
                "card_number": card.get("card_number"),
                "driver_id": card.get("driver_id"),
                "vehicle_id": card.get("vehicle_id"),
                "assigned_driver_name": assigned_driver_name
            })

        return jsonify(result)
    except Exception as e:
        logging.error(f"Ошибка при получении списка карт: {e}")
        return jsonify([]), 500

@fuel_cards_bp.route('/fuel_cards/upload_transactions', methods=['POST'])
@login_required
def upload_transactions():
    try:
        file = request.files['file']
        if not file or not file.filename.lower().endswith('.pdf'):
            return jsonify({'success': False, 'error': 'Нужен PDF-файл'})

        transactions = parse_pdf_transactions(file)

        for tx in transactions:
            tx['company'] = current_user.company

        if not transactions:
            return jsonify({'success': False, 'error': 'Нет транзакций в файле'})

        # ✅ Сохраняем транзакции в базу
        fuel_cards_transactions_collection.insert_many(transactions)

        summary = defaultdict(lambda: {"qty": 0.0, "retail": 0.0, "invoice": 0.0, "driver_name": ""})
        for tx in transactions:
            card_key = tx["card_number"]
            summary[card_key]["qty"] += tx["qty"]
            summary[card_key]["retail"] += tx["retail_price"]
            summary[card_key]["invoice"] += tx["invoice_total"]
            summary[card_key]["driver_name"] = tx["driver_name"]

        summary_list = []
        for card, data in summary.items():
            summary_list.append({
                "card_number": card,
                "driver_name": data["driver_name"],
                "qty": round(data["qty"], 2),
                "retail": round(data["retail"], 2),
                "invoice": round(data["invoice"], 2)
            })

        return jsonify({
            'success': True,
            'count': len(transactions),
            'summary_by_card': summary_list
        })

    except Exception as e:
        logging.error(f"Ошибка при загрузке транзакций: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500



@fuel_cards_bp.route('/fragment/fuel_cards_transactions')
@login_required
def fuel_cards_transactions_fragment():
    return render_template('fragments/fuel_cards_transactions_fragment.html')


@fuel_cards_bp.route('/fuel_cards/transactions')
@login_required
def get_all_transactions():
    try:
        transactions = list(fuel_cards_transactions_collection.find(
            {'company': current_user.company}
        ))

        result = []
        for tx in transactions:
            billing_raw = tx.get("billing_date", "")
            week_range = format_week_range(billing_raw)

            result.append({
                "billing_range": week_range,
                "date": tx.get("date"),
                "card_number": tx.get("card_number"),
                "driver_id": tx.get("driver_id"),
                "vehicle_id": tx.get("vehicle_id"),
                "qty": tx.get("qty"),
                "fuel_total": tx.get("fuel_total"),
                "retail_price": tx.get("retail_price"),
                "invoice_total": tx.get("invoice_total"),
                "driver_name": tx.get("driver_name"),
            })

        return jsonify(result)
    except Exception as e:
        logging.error(f"Ошибка при получении транзакций: {e}")
        return jsonify([]), 500
