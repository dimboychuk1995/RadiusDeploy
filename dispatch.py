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

        # Очистка всех от bytes и ObjectId
        def clean_for_json(obj):
            if isinstance(obj, dict):
                return {
                    k: clean_for_json(v)
                    for k, v in obj.items()
                    if not isinstance(v, bytes)
                }
            elif isinstance(obj, list):
                return [clean_for_json(item) for item in obj]
            elif isinstance(obj, ObjectId):
                return str(obj)
            return obj

        drivers = clean_for_json(drivers)
        trucks = clean_for_json(trucks)
        dispatchers = clean_for_json(dispatchers)
        loads = clean_for_json(loads)

        truck_map = {t['_id']: t for t in trucks}
        dispatcher_map = {d['_id']: d for d in dispatchers}

        grouped_drivers = {}
        for driver in drivers:
            dispatcher_id = driver.get('dispatcher') or "unassigned"
            driver['dispatcher'] = dispatcher_map.get(dispatcher_id)
            driver['truck'] = truck_map.get(driver.get('truck'))
            grouped_drivers.setdefault(dispatcher_id, []).append(driver)

        return render_template(
            'fragments/dispatch_fragment.html',
            dispatchers=dispatchers,
            grouped_drivers=grouped_drivers,
            all_loads=loads
        )

    except Exception as e:
        logging.error(f"Ошибка в dispatch_fragment: {e}")
        return render_template('error.html', message="Не удалось загрузить данные диспетчеров.")
