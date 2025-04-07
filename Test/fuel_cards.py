from flask import Blueprint, render_template, jsonify, request
from flask_login import login_required, current_user
from pymongo import MongoClient
from bson.objectid import ObjectId
import logging

logging.basicConfig(level=logging.ERROR)
fuel_cards_bp = Blueprint('fuel_cards', __name__)

try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['trucks_db']
    drivers_collection = db['drivers']
    fuel_cards_collection = db['fuel_cards']  # 🔹 создаём новую коллекцию
    client.admin.command('ping')
except Exception as e:
    logging.error(f"Failed to connect to MongoDB: {e}")
    exit(1)

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