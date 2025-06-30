

import requests
from flask import Blueprint, render_template
from flask_login import login_required, current_user
import logging
from flask import request, jsonify
from bson import ObjectId
from flask_login import login_required
from datetime import datetime, time
from zoneinfo import ZoneInfo
from auth import users_collection
from tools.db import db
from dateutil import parser
dispatch_bp = Blueprint('dispatch', __name__)

drivers_collection = db['drivers']
trucks_collection = db['trucks']
loads_collection = db['loads']
consolidated_loads_collection =db['consolidated_loads']
integrations_settings_collection = db['integrations_settings']
drivers_brakes_collection = db['drivers_brakes']

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
    from datetime import datetime, timedelta, timezone
    from bson import ObjectId

    t0 = time.time()

    try:
        log = []

        # === Drivers ===
        t1 = time.time()
        drivers = list(drivers_collection.find(
            {'company': current_user.company},
            {'_id': 1, 'name': 1, 'truck': 1, 'dispatcher': 1}
        ))
        log.append(f"✅ Drivers: {time.time() - t1:.3f} сек")

        # === Trucks ===
        t2 = time.time()
        trucks = list(trucks_collection.find(
            {'company': current_user.company},
            {'_id': 1, 'unit_number': 1}
        ))
        log.append(f"✅ Trucks: {time.time() - t2:.3f} сек")

        # === Dispatchers ===
        t3 = time.time()
        dispatchers = list(users_collection.find(
            {'company': current_user.company, 'role': 'dispatch'},
            {'_id': 1, 'username': 1}
        ))
        log.append(f"✅ Dispatchers: {time.time() - t3:.3f} сек")

        # === Loads ===
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
                'RPM': 1,
                'consolidated': 1,
                'consolidateId': 1
            }
        ))
        log.append(f"✅ Loads: {time.time() - t4:.3f} сек")

        # === Consolidated Loads ===
        t5 = time.time()
        consolidated_loads = list(consolidated_loads_collection.find({}, {
            '_id': 1,
            'load_ids': 1,
            'route_points': 1,
            'total_miles': 1,
            'total_price': 1,
            'rpm': 1
        }))
        log.append(f"✅ Consolidated Loads: {time.time() - t5:.3f} сек")

        # === Driver Breaks ===
        t6 = time.time()
        driver_breaks = list(db['drivers_breaks'].find({}, {
            '_id': 1,
            'driver_id': 1,
            'reason': 1,
            'start_date': 1,
            'end_date': 1
        }))
        log.append(f"✅ Driver Breaks: {time.time() - t6:.3f} сек")

        # === Очистка ===
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
        consolidated_loads = clean_for_json(consolidated_loads)
        driver_breaks = clean_for_json(driver_breaks)

        # === Группировка водителей ===
        truck_map = {t['_id']: t for t in trucks}
        dispatcher_map = {d['_id']: d for d in dispatchers}

        grouped_drivers = {}
        for driver in drivers:
            dispatcher_id = driver.get('dispatcher') or "unassigned"
            driver['dispatcher'] = dispatcher_map.get(dispatcher_id)
            driver['truck'] = truck_map.get(driver.get('truck'))
            grouped_drivers.setdefault(dispatcher_id, []).append(driver)

        # === Рендеринг ===
        render_start = time.time()
        rendered = render_template(
            'fragments/dispatch_fragment.html',
            dispatchers=dispatchers,
            grouped_drivers=grouped_drivers,
            all_loads=loads,
            consolidated_loads=consolidated_loads,
            driver_breaks=driver_breaks
        )
        log.append(f"✅ Render: {time.time() - render_start:.3f} сек")

        total_time = time.time() - t0
        log.append(f"⏱️ Всего: {total_time:.3f} сек")
        for line in log:
            print(line)
        print(f"📊 Breaks count: {len(driver_breaks)}")
        return rendered

    except Exception as e:
        logging.error(f"Ошибка в dispatch_fragment: {e}")
        return render_template('error.html', message="Не удалось загрузить данные диспетчеров.")


# we called this method from different places
@dispatch_bp.route('/api/consolidation/prep', methods=['POST'])
@login_required
def prep_consolidation():
    try:
        data = request.get_json()
        load_ids = data.get('load_ids', [])
        if not load_ids:
            return jsonify({"success": False, "error": "No load_ids provided"}), 400

        object_ids = [ObjectId(id_) for id_ in load_ids]

        # Получаем грузы
        loads = list(loads_collection.find(
            {'_id': {'$in': object_ids}},
            {
                '_id': 1,
                'load_id': 1,  # ← обязательно!
                'pickup': 1,
                'delivery': 1,
                'extra_pickup': 1,
                'extra_delivery': 1,
                'price': 1,
                'total_price': 1,
                'miles': 1,
                'broker': 1,
                'broker_id': 1,
                'broker_load_id': 1,
                'RPM': 1
            }
        ))

        pickup_points = []
        delivery_points = []
        result_loads = []

        for load in loads:
            load_id = str(load['_id'])
            price = float(load.get("total_price", load.get("price", 0)) or 0)

            for ep in load.get('extra_pickup') or []:
                pickup_points.append({
                    "address": ep.get("address", ""),
                    "scheduled_at": ep.get("scheduled_at", ""),
                    "load_id": load_id,
                    "price": price
                })

            pickup = load.get('pickup')
            if pickup:
                pickup_points.append({
                    "address": pickup.get("address", ""),
                    "scheduled_at": pickup.get("date", ""),
                    "load_id": load_id,
                    "price": price
                })

            delivery = load.get('delivery')
            if delivery:
                delivery_points.append({
                    "address": delivery.get("address", ""),
                    "scheduled_at": delivery.get("date", ""),
                    "load_id": load_id,
                    "price": price
                })

            for ed in load.get('extra_delivery') or []:
                delivery_points.append({
                    "address": ed.get("address", ""),
                    "scheduled_at": ed.get("scheduled_at", ""),
                    "load_id": load_id,
                    "price": price
                })

            load_id = str(load['_id'])

            result_loads.append({
                "_id": load_id,
                "load_id": str(load.get("load_id", "")),
                "broker_id": str(load.get("broker_id")) if load.get("broker_id") else "",
                "company_sign": str(load.get("company_sign")) if load.get("company_sign") else "",
                "assigned_driver": str(load.get("assigned_driver")) if load.get("assigned_driver") else "",
                "assigned_dispatch": str(load.get("assigned_dispatch")) if load.get("assigned_dispatch") else "",
                "assigned_power_unit": str(load.get("assigned_power_unit")) if load.get("assigned_power_unit") else "",
                "broker_load_id": load.get("broker_load_id", ""),
                "broker": load.get("broker", {}),
                "pickup": load.get("pickup") or {},
                "extra_pickup": load.get("extra_pickup") or [],
                "delivery": load.get("delivery") or {},
                "extra_delivery": load.get("extra_delivery") or [],
                "price": load.get("price"),
                "total_price": load.get("total_price"),
                "RPM": load.get("RPM"),
                "miles": load.get("total_miles")
            })

        # ✅ Возврат JSON-ответа
        return jsonify({
            "success": True,
            "pickup_points": pickup_points,
            "delivery_points": delivery_points,
            "loads": result_loads
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@dispatch_bp.route('/api/consolidation/save', methods=['POST'])
@login_required
def save_consolidation():
    try:
        data = request.get_json()
        raw_load_ids = data.get('load_ids', [])
        route_points = data.get('route_points', [])

        # 🧼 Преобразуем в ObjectId и фильтруем мусор
        object_ids = []
        for lid in raw_load_ids:
            try:
                object_ids.append(ObjectId(lid))
            except Exception as e:
                print(f"⚠️ Пропущен невалидный ID: {lid}")

        if not object_ids or not route_points:
            return jsonify({"success": False, "error": "Missing data"}), 400

        # 📦 Получаем грузы для подсчета total_price
        loads = list(loads_collection.find({'_id': {'$in': object_ids}}, {'price': 1}))
        total_price = sum(float(load.get('price') or 0) for load in loads)

        # 🗺️ Получаем API-ключ
        integration = integrations_settings_collection.find_one({"name": "Google Maps API"})
        if not integration or not integration.get("api_key"):
            return jsonify({"success": False, "error": "Google API key not found"}), 500

        api_key = integration["api_key"]

        # 🚗 Формируем список адресов
        addresses = [point['address'] for point in route_points]

        from urllib.parse import urlencode
        import requests

        url = f"https://maps.googleapis.com/maps/api/directions/json?" + urlencode({
            'origin': addresses[0],
            'destination': addresses[-1],
            'waypoints': '|'.join(addresses[1:-1]),
            'key': api_key
        })

        response = requests.get(url)
        if response.status_code != 200:
            return jsonify({"success": False, "error": f"Google API error: {response.status_code}"}), 500

        data = response.json()
        total_miles = 0
        for leg in data.get("routes", [])[0].get("legs", []):
            total_miles += leg.get("distance", {}).get("value", 0) / 1609.34  # meters to miles

        rpm = round(total_price / total_miles, 2) if total_miles else 0

        consolidated_doc = {
            "load_ids": object_ids,
            "route_points": [
                {
                    "address": p.get("address", ""),
                    "scheduled_at": p.get("scheduled_at", ""),
                    "load_id": ObjectId(p["load_id"]) if ObjectId.is_valid(p["load_id"]) else None
                } for p in route_points
            ],
            "total_miles": round(total_miles, 2),
            "total_price": round(total_price, 2),
            "rpm": rpm,
            "created_at": datetime.utcnow(),
            "created_by": ObjectId(current_user.id)
        }

        consolidated_doc["route_points"] = [p for p in consolidated_doc["route_points"] if p["load_id"]]

        result = consolidated_loads_collection.insert_one(consolidated_doc)
        consolidate_id = result.inserted_id

        # 🔁 Обновляем грузы
        loads_collection.update_many(
            {'_id': {'$in': object_ids}},
            {'$set': {
                'consolidated': True,
                'consolidateId': consolidate_id
            }}
        )

        return jsonify({"success": True, "miles": round(total_miles, 2), "rpm": rpm})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@dispatch_bp.route('/api/drivers/break', methods=['POST'])
@login_required
def save_driver_break():
    try:
        data = request.get_json()
        driver_id = data.get("driver_id")
        reason = data.get("reason")
        start_date_str = data.get("start_date")  # ISO: "2025-06-24T00:00:00.000Z"
        end_date_str = data.get("end_date")

        if not driver_id or not reason or not start_date_str or not end_date_str:
            return jsonify({"success": False, "error": "Missing fields"}), 400

        # Получаем таймзону из базы
        tz_doc = db.company_timezone.find_one({}) or {}
        tz_name = tz_doc.get("timezone", "America/Chicago")
        tz = ZoneInfo(tz_name)

        # Парсим ISO-формат и конвертируем в локальную таймзону
        start_utc = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
        end_utc = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))

        # Переводим в локальное время
        start_local = start_utc.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        end_local = end_utc.astimezone(tz).replace(hour=23, minute=59, second=59, microsecond=999999)

        # Сохраняем в UTC (Mongo предпочитает UTC)
        doc = {
            "driver_id": ObjectId(driver_id),
            "reason": reason,
            "start_date": start_local.astimezone(ZoneInfo("UTC")),
            "end_date": end_local.astimezone(ZoneInfo("UTC")),
            "created_at": datetime.utcnow(),
            "created_by": ObjectId(current_user.id)
        }

        db.drivers_brakes.insert_one(doc)
        return jsonify({"success": True})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@dispatch_bp.route('/api/driver/location/<driver_id>')
@login_required
def get_driver_location(driver_id):
    try:
        from datetime import datetime

        print(f"🔍 Получение местоположения для водителя: {driver_id}")

        driver = drivers_collection.find_one({'_id': ObjectId(driver_id)})
        if not driver:
            print("❌ Водитель не найден")
            return jsonify({'success': False, 'error': 'Driver not found'}), 404

        truck_id = driver.get('truck')
        if not truck_id:
            print("❌ У водителя нет привязанного трака")
            return jsonify({'success': False, 'error': 'Driver has no assigned truck'}), 400

        truck = trucks_collection.find_one({'_id': ObjectId(truck_id)})
        if not truck:
            print("❌ Трак не найден")
            return jsonify({'success': False, 'error': 'Truck not found'}), 404

        vin = truck.get('vin')
        print(f"✅ VIN трака: {vin}")
        if not vin:
            print("❌ VIN отсутствует")
            return jsonify({'success': False, 'error': 'Truck missing VIN number'}), 400

        samsara_integration = integrations_settings_collection.find_one({'name': 'samsara'})
        mapbox_integration = integrations_settings_collection.find_one({'name': 'MapBox'})

        samsara_token = samsara_integration.get('api_key') if samsara_integration else None
        mapbox_token = mapbox_integration.get('api_key') if mapbox_integration else None
        print(f"🗺️ Mapbox token: {mapbox_token}")
        print(f"🔐 Samsara token: {samsara_token}")

        if not samsara_token:
            print("❌ Нет токена Samsara")
            return jsonify({'success': False, 'error': 'Samsara token missing'}), 500

        # === Получаем местоположение от Samsara ===
        print("🌐 Запрос к Samsara API...")
        url = "https://api.samsara.com/fleet/vehicles/stats?types=gps"
        headers = {
            "accept": "application/json",
            "authorization": f"Bearer {samsara_token}"
        }

        response = requests.get(url, headers=headers)
        print(f"📡 Ответ Samsara статус: {response.status_code}")
        if response.status_code != 200:
            print("❌ Ошибка при запросе к Samsara")
            return jsonify({'success': False, 'error': 'Samsara API error'}), 500

        data = response.json()
        vehicles = data.get("data", [])
        print(f"🔢 Найдено {len(vehicles)} vehicles")

        matched = None
        for vehicle in vehicles:
            ext_ids = vehicle.get("externalIds", {})
            if ext_ids.get("samsara.vin") == vin:
                matched = vehicle
                break

        if not matched:
            print("❌ Совпадение по VIN не найдено")
            return jsonify({'success': False, 'error': 'VIN not found in Samsara'}), 404

        gps = matched.get("gps")
        if not gps:
            print("❌ Нет данных GPS в найденном vehicle")
            return jsonify({'success': False, 'error': 'Location not found'}), 404

        lat = gps.get("latitude")
        lng = gps.get("longitude")
        print(f"📍 Координаты: {lat}, {lng}")

        # === Поиск грузов на сегодня ===
        today_str = datetime.utcnow().strftime("%m/%d/%Y")
        loads_cursor = loads_collection.find({
            'assigned_driver': ObjectId(driver_id),
            '$or': [
                {'pickup.date': today_str},
                {'delivery.date': today_str}
            ]
        })

        today_loads = []
        for load in loads_cursor:
            today_loads.append({
                'pickup': load.get('pickup', {}),
                'delivery': load.get('delivery', {}),
                'load_id': str(load.get('_id'))
            })

        print(f"📦 Найдено грузов на сегодня: {len(today_loads)}")

        return jsonify({
            'success': True,
            'lat': lat,
            'lng': lng,
            'driver_name': driver.get('name'),
            'mapbox_token': mapbox_token,
            'location_text': gps.get("reverseGeo", {}).get("formattedLocation", ""),
            'loads': today_loads
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500
