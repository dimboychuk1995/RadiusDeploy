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
    import time
    t0 = time.time()

    try:
        log = []

        t1 = time.time()
        drivers = list(drivers_collection.find(
            {'company': current_user.company},
            {'_id': 1, 'name': 1, 'truck': 1, 'dispatcher': 1}
        ))
        log.append(f"✅ Drivers: {time.time() - t1:.3f} сек")

        t2 = time.time()
        trucks = list(trucks_collection.find(
            {'company': current_user.company},
            {'_id': 1, 'unit_number': 1}
        ))
        log.append(f"✅ Trucks: {time.time() - t2:.3f} сек")

        t3 = time.time()
        dispatchers = list(users_collection.find(
            {'company': current_user.company, 'role': 'dispatch'},
            {'_id': 1, 'username': 1}
        ))
        log.append(f"✅ Dispatchers: {time.time() - t3:.3f} сек")

        t4 = time.time()
        loads = list(loads_collection.find(
            {'company': current_user.company},
            {
                '_id': 1,
                'assigned_driver': 1,
                'pickup.date': 1,
                'pickup.address': 1,
                'delivery.date': 1,
                'delivery.address': 1,
                'status': 1,
                'load_id': 1,
                'extra_delivery': 1,
                'price': 1,
                'total_price': 1,
                'RPM': 1
            }
        ))
        log.append(f"✅ Loads: {time.time() - t4:.3f} сек")

        # Очистка
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

        render_start = time.time()
        rendered = render_template(
            'fragments/dispatch_fragment.html',
            dispatchers=dispatchers,
            grouped_drivers=grouped_drivers,
            all_loads=loads
        )
        log.append(f"✅ Render: {time.time() - render_start:.3f} сек")

        total_time = time.time() - t0
        log.append(f"⏱️ Всего: {total_time:.3f} сек")
        for line in log:
            print(line)

        return rendered

    except Exception as e:
        logging.error(f"Ошибка в dispatch_fragment: {e}")
        return render_template('error.html', message="Не удалось загрузить данные диспетчеров.")

from flask import request, jsonify
from bson import ObjectId
from flask_login import login_required
from datetime import datetime

@dispatch_bp.route('/api/consolidation/prep', methods=['POST'])
@login_required
def prep_consolidation():
    try:
        data = request.get_json()
        load_ids = data.get('load_ids', [])
        if not load_ids:
            return jsonify({"success": False, "error": "No load_ids provided"}), 400

        # Преобразование строк в ObjectId
        object_ids = [ObjectId(id_) for id_ in load_ids]

        # Получаем грузы
        loads = list(loads_collection.find(
            {'_id': {'$in': object_ids}},
            {
                '_id': 1,
                'pickup': 1,
                'delivery': 1,
                'extra_pickup': 1,
                'extra_delivery': 1
            }
        ))

        pickup_points = []
        delivery_points = []

        for load in loads:
            load_id = str(load['_id'])

            # extra_pickup → pickup
            extras = load.get('extra_pickup') or []
            for ep in extras:
                pickup_points.append({
                    "address": ep.get("address", ""),
                    "scheduled_at": ep.get("scheduled_at", ""),
                    "original_load_id": load_id
                })

            pickup = load.get('pickup')
            if pickup:
                pickup_points.append({
                    "address": pickup.get("address", ""),
                    "scheduled_at": pickup.get("date", ""),  # в основной пикап поле называется 'date'
                    "original_load_id": load_id
                })

            # delivery → extra_delivery
            delivery = load.get('delivery')
            if delivery:
                delivery_points.append({
                    "address": delivery.get("address", ""),
                    "scheduled_at": delivery.get("date", ""),
                    "original_load_id": load_id
                })

            extras = load.get('extra_delivery') or []
            for ed in extras:
                delivery_points.append({
                    "address": ed.get("address", ""),
                    "scheduled_at": ed.get("scheduled_at", ""),
                    "original_load_id": load_id
                })

        return jsonify({
            "success": True,
            "pickup_points": pickup_points,
            "delivery_points": delivery_points
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
