from flask import Blueprint, render_template, request
from flask_login import login_required, current_user
from pymongo import MongoClient
import logging
from bson import ObjectId
import traceback

statement_bp = Blueprint('statement', __name__)

# --- Очистка и нормализация ---
def cleanup_doc(doc):
    cleaned = {}
    for key, value in doc.items():
        if isinstance(value, bytes):
            try:
                cleaned[key] = value.decode('utf-8')
            except:
                continue
        elif isinstance(value, ObjectId):
            cleaned[key] = str(value)
        elif isinstance(value, dict):
            cleaned[key] = cleanup_doc(value)
        elif isinstance(value, list):
            cleaned[key] = [
                cleanup_doc(v) if isinstance(v, dict) else (
                    str(v) if isinstance(v, ObjectId) else v
                ) for v in value
            ]
        else:
            cleaned[key] = value
    return cleaned

def normalize_commission_table(raw_table):
    if not raw_table or not isinstance(raw_table, list):
        return []

    normalized = []
    for i, row in enumerate(raw_table):
        from_val = row.get('from') or row.get('from_sum') or 0
        percent = row.get('percent', 0)
        to_val = None
        if i + 1 < len(raw_table):
            to_val = raw_table[i + 1].get('from') or raw_table[i + 1].get('from_sum')
        normalized.append({
            'from': from_val,
            'to': to_val,
            'percent': percent
        })
    return normalized

# --- Подключение к MongoDB ---
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

# --- Загрузка основного фрагмента ---
@statement_bp.route('/statement/fragment', methods=['GET'])
@login_required
def statement_fragment():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        trucks = list(trucks_collection.find({'company': current_user.company}))
        loads = list(loads_collection.find({'company': current_user.company}))

        truck_map = {str(truck['_id']): cleanup_doc(truck) for truck in trucks}

        cleaned_drivers = []
        valid_schemes = ['gross', 'net', 'net_percent', 'net_gross']

        for driver in drivers:
            d = cleanup_doc(driver)
            d['_id'] = str(d['_id'])

            raw_commission = driver.get('commission_table', [])
            raw_net_commission = driver.get('net_commission_table', [])

            d['commission_table'] = normalize_commission_table(raw_commission)
            d['net_commission_table'] = normalize_commission_table(raw_net_commission)

            if d.get('scheme_type') not in valid_schemes:
                d['scheme_type'] = 'gross'

            truck_id = str(d.get('truck'))
            d['truck'] = truck_map.get(truck_id)

            cleaned_drivers.append(d)

        # DEBUG: покажем что попадёт в шаблон
        import json
        print("=== DRIVERS TO TEMPLATE ===")
        for d in cleaned_drivers:
            print(json.dumps(d, indent=2))

        for t in trucks:
            t['_id'] = str(t['_id'])
        for l in loads:
            l['_id'] = str(l['_id'])
            l['driver_id'] = str(l.get('driver_id'))
            l['truck_id'] = str(l.get('truck_id'))

        return render_template('fragments/statement_fragment.html',
                               drivers=cleaned_drivers,
                               trucks=trucks,
                               loads=loads)

    except Exception as e:
        logging.error("Ошибка в statement_fragment:")
        logging.error(traceback.format_exc())
        return render_template('error.html', message="Failed to retrieve statement data")

# --- Создание стейтмента ---
@statement_bp.route('/statement/create', methods=['POST'])
@login_required
def create_statement():
    try:
        driver_id = request.form.get('driver_id')
        if not driver_id:
            return render_template('error.html', message="Driver ID не передан")

        driver = drivers_collection.find_one({'_id': ObjectId(driver_id), 'company': current_user.company})
        if not driver:
            return render_template('error.html', message="Водитель не найден")

        truck = None
        if driver.get('truck'):
            truck = trucks_collection.find_one({'_id': ObjectId(driver['truck'])})

        raw_loads = loads_collection.find({'driver': ObjectId(driver_id), 'company': current_user.company})
        loads = []
        for l in raw_loads:
            loads.append({
                '_id': str(l.get('_id')),
                'pickup_location': l.get('pickup_location'),
                'delivery_location': l.get('delivery_location'),
                'pickup_date': l.get('pickup_date'),
                'delivery_date': l.get('delivery_date'),
                'price': l.get('price'),
                'fuel': l.get('fuel', 0),
                'tolls': l.get('tolls', 0),
                'status': l.get('status'),
                'rate_con': str(l.get('rate_con')) if l.get('rate_con') else None
            })

        return render_template('fragments/statement_detail.html',
                               driver=driver,
                               truck=truck,
                               loads=loads)

    except Exception as e:
        logging.error(f"Ошибка при создании стейтмента: {e}")
        return render_template('error.html', message="Не удалось создать стейтмент")

# --- Таблица грузов (AJAX) ---
@statement_bp.route('/statement/driver_loads/<driver_id>', methods=['GET'])
@login_required
def get_driver_loads(driver_id):
    try:
        loads = loads_collection.find({'driver': ObjectId(driver_id), 'company': current_user.company})
        parsed = []
        for l in loads:
            parsed.append({
                'pickup_location': l.get('pickup_location'),
                'delivery_location': l.get('delivery_location'),
                'pickup_date': l.get('pickup_date'),
                'delivery_date': l.get('delivery_date'),
                'price': l.get('price'),
                'fuel': l.get('fuel', 0),
                'tolls': l.get('tolls', 0),
                'status': l.get('status'),
                'rate_con': str(l.get('rate_con')) if l.get('rate_con') else None
            })

        return render_template('fragments/partials/driver_loads_table.html', loads=parsed)

    except Exception as e:
        logging.error(f"Ошибка при получении грузов водителя: {e}")
        return "<p class='text-danger'>Ошибка загрузки данных</p>"
