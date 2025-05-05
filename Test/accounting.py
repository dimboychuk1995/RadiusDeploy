from flask import Blueprint, render_template, request
from pymongo import MongoClient
import logging
from flask_login import login_required, current_user

# Настраиваем логирование
logging.basicConfig(level=logging.ERROR)

# Создаем Blueprint для бухгалтерии
accounting_bp = Blueprint('accounting', __name__)

# Настройки подключения к MongoDB
try:
    client = MongoClient("mongodb+srv://dimboychuk1995:Mercedes8878@trucks.5egoxb8.mongodb.net/trucks_db")
    db = client['trucks_db']
    drivers_collection = db['drivers']
    trucks_collection = db['trucks']
    client.admin.command('ping')
    logging.info("Successfully connected to MongoDB")
except Exception as e:
    logging.error(f"Failed to connect to MongoDB: {e}")
    exit(1)

# Маршрут для отображения страницы бухгалтерии
@accounting_bp.route('/fragment/accounting_fragment', methods=['GET'])
@login_required
def accounting_fragment():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        trucks = list(trucks_collection.find({'company': current_user.company}))
        return render_template('fragments/accounting_fragment.html', drivers=drivers, trucks=trucks)
    except Exception as e:
        logging.error(f"Error fetching accounting fragment: {e}")
        return render_template('error.html', message="Failed to retrieve accounting fragment")