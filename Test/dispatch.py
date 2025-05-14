from flask import Blueprint, render_template
from flask_login import login_required, current_user
import logging

from Test.auth import users_collection
from Test.tools.db import db  # централизованное подключение

dispatch_bp = Blueprint('dispatch', __name__)

# Коллекции
trucks_collection = db['trucks']
drivers_collection = db['drivers']
loads_collection = db['loads']

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

        # Грузы с датами pickup и delivery
        loads = list(loads_collection.find({
            'company': current_user.company,
            'pickup.date': {'$exists': True},
            'delivery.date': {'$exists': True}
        }))

        # Преобразуем ObjectId → str
        for load in loads:
            load['_id'] = str(load['_id'])
            load['assigned_driver'] = str(load.get('assigned_driver', ''))
            if 'pickup' in load and isinstance(load['pickup'], dict):
                load['pickup']['date'] = load['pickup'].get('date', '')
            if 'delivery' in load and isinstance(load['delivery'], dict):
                load['delivery']['date'] = load['delivery'].get('date', '')

        return render_template(
            'fragments/dispatch_fragment.html',
            drivers=drivers,
            dispatchers=dispatchers,
            loads=loads
        )
    except Exception as e:
        logging.error(f"Error fetching dispatch data: {e}")
        return render_template('error.html', message="Failed to retrieve dispatch data")
