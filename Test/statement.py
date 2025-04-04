from flask import Blueprint, render_template
from flask_login import login_required, current_user
from pymongo import MongoClient
import logging
from bson import ObjectId
from flask import request

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

        truck_map = {str(truck['_id']): truck for truck in trucks}

        # Преобразуем _id в строки (на всякий случай для шаблонов)
        for driver in drivers:
            driver['_id'] = str(driver['_id'])
            truck_id = str(driver.get('truck'))
            driver['truck'] = truck_map.get(truck_id)  # теперь это объект, а не просто _id
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

        # Грузы водителя
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
                'status': l.get('status'),
                'rate_con': str(l.get('rate_con')) if l.get('rate_con') else None
            })

        return render_template('fragments/partials/driver_loads_table.html', loads=parsed)

    except Exception as e:
        logging.error(f"Ошибка при получении грузов водителя: {e}")
        return "<p class='text-danger'>Ошибка загрузки данных</p>"