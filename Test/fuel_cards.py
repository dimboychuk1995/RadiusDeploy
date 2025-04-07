from flask import Blueprint, render_template, jsonify
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
