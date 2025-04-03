from flask import Blueprint, render_template
from flask_login import login_required, current_user
from pymongo import MongoClient
import logging

from Test.auth import users_collection

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


@dispatch_bp.route('/fragment/dispatch_fragment', methods=['GET'])
@login_required
def dispatch_fragment():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        trucks = list(trucks_collection.find({'company': current_user.company}))
        dispatchers = list(users_collection.find({'company': current_user.company, 'role': 'dispatch'}))

        truck_units = {str(truck['_id']): truck for truck in trucks}
        dispatchers_dict = {str(dispatcher['_id']): dispatcher for dispatcher in dispatchers}

        for driver in drivers:
            driver['_id'] = str(driver['_id'])
            driver['truck'] = truck_units.get(driver.get('truck'))
            driver['dispatcher'] = dispatchers_dict.get(driver.get('dispatcher'))

        return render_template('fragments/dispatch_fragment.html', drivers=drivers, dispatchers=dispatchers)
    except Exception as e:
        logging.error(f"Error fetching dispatch data: {e}")
        return render_template('error.html', message="Failed to retrieve dispatch data")
