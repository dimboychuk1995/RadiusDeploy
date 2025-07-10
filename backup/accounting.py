from flask import Blueprint, render_template
from flask_login import login_required, current_user
import logging

from tools.db import db  # Подключаем MongoDB из единого модуля

# Настраиваем логирование
logging.basicConfig(level=logging.ERROR)

# Создаем Blueprint для бухгалтерии
accounting_bp = Blueprint('accounting', __name__)

# Коллекции
drivers_collection = db['drivers']
trucks_collection = db['trucks']

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
