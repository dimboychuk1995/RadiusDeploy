from flask import Blueprint, render_template
from flask_login import login_required, current_user
from pymongo import MongoClient
import logging

dispatch_bp = Blueprint('dispatch', __name__)

# Настройки подключения к MongoDB
try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['trucks_db']
    trucks_collection = db['trucks']
    drivers_collection = db['drivers']
    client.admin.command('ping')
    logging.info("Successfully connected to MongoDB")
except Exception as e:
    logging.error(f"Failed to connect to MongoDB: {e}")
    exit(1)


@dispatch_bp.route('/dispatch', methods=['GET'])
@login_required
def dispatch_page():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        trucks = list(trucks_collection.find({'company': current_user.company}))
        for truck in trucks:
            truck['_id'] = str(truck['_id'])
        for driver in drivers:
            driver['_id'] = str(driver['_id'])
        return render_template('dispatch.html', drivers=drivers, trucks=trucks)
    except Exception as e:
        logging.error(f"Error fetching data for dispatch: {e}")
        return render_template('error.html', message="Failed to retrieve data for dispatch")