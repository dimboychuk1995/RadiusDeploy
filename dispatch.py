from flask import Blueprint, render_template
from flask_login import login_required, current_user
import logging
from bson import ObjectId

from auth import users_collection
from tools.db import db

dispatch_bp = Blueprint('dispatch', __name__)

drivers_collection = db['drivers']
trucks_collection = db['trucks']
loads_collection = db['loads']


def convert_object_ids(obj):
    if isinstance(obj, list):
        return [convert_object_ids(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_object_ids(value) for key, value in obj.items()}
    elif isinstance(obj, ObjectId):
        return str(obj)
    else:
        return obj


@dispatch_bp.route('/fragment/dispatch_fragment', methods=['GET'])
@login_required
def dispatch_fragment():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        trucks = list(trucks_collection.find({'company': current_user.company}))
        dispatchers = list(users_collection.find({'company': current_user.company, 'role': 'dispatch'}))
        loads = list(loads_collection.find({'company': current_user.company}))

        truck_map = {str(t['_id']): t for t in trucks}
        dispatcher_map = {str(d['_id']): d for d in dispatchers}

        grouped_drivers = {}

        for driver in drivers:
            dispatcher_id = str(driver.get('dispatcher')) if driver.get('dispatcher') else "unassigned"
            driver['_id'] = str(driver['_id'])
            driver['dispatcher'] = dispatcher_map.get(dispatcher_id)
            driver['truck'] = truck_map.get(str(driver.get('truck')))
            grouped_drivers.setdefault(dispatcher_id, []).append(driver)

        # Обработка грузов
        for load in loads:
            load['_id'] = str(load['_id'])
            load['assigned_driver'] = str(load.get('assigned_driver')) if load.get('assigned_driver') else None
            load['assigned_dispatch'] = str(load.get('assigned_dispatch')) if load.get('assigned_dispatch') else None

        # Преобразование всех ObjectId
        grouped_drivers = convert_object_ids(grouped_drivers)
        all_loads = convert_object_ids(loads)

        return render_template(
            'fragments/dispatch_fragment.html',
            dispatchers=dispatchers,
            grouped_drivers=grouped_drivers,
            all_loads=all_loads
        )

    except Exception as e:
        logging.error(f"Ошибка в dispatch_fragment: {e}")
        return render_template('error.html', message="Не удалось загрузить данные диспетчеров.")
