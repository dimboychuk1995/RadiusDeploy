from flask import Blueprint, render_template
from flask_login import login_required, current_user
from pymongo import MongoClient
import logging

statement_bp = Blueprint('statement', __name__)

# Настройки подключения к MongoDB
try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['trucks_db']
    drivers_collection = db['drivers']
    trucks_collection = db['trucks']
    loads_collection = db['loads']
    client.admin.command('ping')
    logging.info("Successfully connected to MongoDB (statement.py)")
except Exception as e:
    logging.error(f"Failed to connect to MongoDB: {e}")
    exit(1)


@statement_bp.route('/statement/fragment', methods=['GET'])
@login_required
def statement_fragment():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        trucks = list(trucks_collection.find({'company': current_user.company}))
        loads = list(loads_collection.find({'company': current_user.company}))

        # Преобразуем _id в строки (на всякий случай для шаблонов)
        for d in drivers:
            d['_id'] = str(d['_id'])
        for t in trucks:
            t['_id'] = str(t['_id'])
        for l in loads:
            l['_id'] = str(l['_id'])
            l['driver_id'] = str(l.get('driver_id'))
            l['truck_id'] = str(l.get('truck_id'))

        return render_template('fragments/statement_fragment.html',
                               drivers=drivers,
                               trucks=trucks,
                               loads=loads)
    except Exception as e:
        logging.error(f"Error fetching statement data: {e}")
        return render_template('error.html', message="Failed to retrieve statement data")
