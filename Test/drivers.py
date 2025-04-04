from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from pymongo import MongoClient
from bson.objectid import ObjectId
import logging
from flask_login import login_required, current_user
from Test.auth import requires_role

# Настраиваем логирование
logging.basicConfig(level=logging.ERROR)

# Создаем Blueprint
drivers_bp = Blueprint('drivers', __name__)

# Подключение к базе MongoDB
try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['trucks_db']
    drivers_collection = db['drivers']
    trucks_collection = db['trucks']
    users_collection = db['users']
    loads_collection = db['loads']
    client.admin.command('ping')
    logging.info("Successfully connected to MongoDB")
except Exception as e:
    logging.error(f"Failed to connect to MongoDB: {e}")
    exit(1)

# Функция для преобразования ObjectId в строку
def convert_to_str_id(data):
    if data:
        data['_id'] = str(data['_id'])
    return data

# Список всех водителей
@drivers_bp.route('/fragment/drivers', methods=['GET'])
@login_required
def drivers_fragment():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        trucks = list(trucks_collection.find({'company': current_user.company}))
        dispatchers = list(users_collection.find({'company': current_user.company, 'role': 'dispatch'}))

        truck_units = {str(truck['_id']): truck['unit_number'] for truck in trucks}
        dispatcher_map = {str(dispatcher['_id']): dispatcher['username'] for dispatcher in dispatchers}

        for driver in drivers:
            driver = convert_to_str_id(driver)
            driver['truck_unit'] = truck_units.get(driver.get('truck'), 'Нет трака')
            driver['dispatcher_name'] = dispatcher_map.get(driver.get('dispatcher'), 'Нет диспетчера')

        return render_template('fragments/drivers_fragment.html', drivers=drivers, trucks=trucks, dispatchers=dispatchers)
    except Exception as e:
        logging.error(f"Error fetching drivers or trucks: {e}")
        return render_template('error.html', message="Failed to retrieve drivers or trucks list")

# Информация о водителе
@drivers_bp.route('/fragment/driver_details/<driver_id>', methods=['GET'])
@login_required
def driver_details_fragment(driver_id):
    try:
        driver = convert_to_str_id(drivers_collection.find_one({'_id': ObjectId(driver_id)}))
        if not driver:
            return render_template('error.html', message="Driver not found")

        truck = trucks_collection.find_one({'_id': ObjectId(driver.get('truck'))}) if driver.get('truck') else None
        dispatcher = users_collection.find_one({'_id': ObjectId(driver.get('dispatcher'))}) if driver.get('dispatcher') else None
        trucks = list(trucks_collection.find({'company': current_user.company}))
        dispatchers = list(users_collection.find({'company': current_user.company, 'role': 'dispatch'}))
        loads = list(loads_collection.find({'driver': ObjectId(driver['_id'])}))

        return render_template(
            'fragments/driver_details_fragment.html',
            driver=driver,
            truck=convert_to_str_id(truck),
            dispatcher=convert_to_str_id(dispatcher),
            trucks=trucks,
            dispatchers=dispatchers,
            loads=loads
        )
    except Exception as e:
        logging.error(f"Error fetching driver details: {e}")
        return render_template('error.html', message="Failed to retrieve driver details")

# Добавление водителя
@drivers_bp.route('/add_driver', methods=['POST'])
@login_required
def add_driver():
    try:
        driver_data = {
            'name': request.form.get('name'),
            'license_number': request.form.get('license_number'),
            'contact_number': request.form.get('contact_number'),
            'truck': request.form.get('truck'),
            'dispatcher': request.form.get('dispatcher'),
            'company': current_user.company
        }
        drivers_collection.insert_one(driver_data)
        return redirect(url_for('index'))
    except Exception as e:
        logging.error(f"Error adding driver: {e}")
        return render_template('error.html', message="Failed to add driver")

# Редактирование водителя
@drivers_bp.route('/edit_driver/<driver_id>', methods=['POST'])
@login_required
def edit_driver(driver_id):
    try:
        updated_data = {
            'name': request.form.get('name'),
            'license_number': request.form.get('license_number'),
            'contact_number': request.form.get('contact_number'),
            'truck': request.form.get('truck'),
            'dispatcher': request.form.get('dispatcher')
        }
        drivers_collection.update_one({'_id': ObjectId(driver_id)}, {'$set': updated_data})
        return '', 200  # ✅ просто завершаем без редиректа
    except Exception as e:
        logging.error(f"Error updating driver: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# Удаление водителя
@drivers_bp.route('/delete_driver/<driver_id>', methods=['POST'])
@requires_role('admin')
def delete_driver(driver_id):
    try:
        drivers_collection.delete_one({'_id': ObjectId(driver_id)})
        return jsonify({'success': True})
    except Exception as e:
        logging.error(f"Error deleting driver: {e}")
        return jsonify({'success': False, 'error': 'Failed to delete driver'})


@drivers_bp.route('/set_salary_scheme/<driver_id>', methods=['POST'])
@login_required
def set_salary_scheme(driver_id):
    try:
        scheme_type = request.form.get('scheme_type')

        if scheme_type == 'percent':
            # Схема 1: от суммы грузов (gross)
            gross_table = []
            gross_from = request.form.getlist('gross_from_sum[]')
            gross_percent = request.form.getlist('gross_percent[]')

            for from_val, percent_val in zip(gross_from, gross_percent):
                if from_val and percent_val:
                    gross_table.append({
                        'from_sum': float(from_val),
                        'percent': float(percent_val)
                    })

            update_data = {
                'scheme_type': 'percent',
                'commission_table': gross_table,
                'net_commission_table': None  # очистим, если раньше была net схема
            }

        elif scheme_type == 'net_percent':
            # Схема 2: от чистой прибыли (net)
            net_table = []
            net_from = request.form.getlist('net_from_sum[]')
            net_percent = request.form.getlist('net_percent[]')

            for from_val, percent_val in zip(net_from, net_percent):
                if from_val and percent_val:
                    net_table.append({
                        'from_sum': float(from_val),
                        'percent': float(percent_val)
                    })

            update_data = {
                'scheme_type': 'net_percent',
                'net_commission_table': net_table,
                'commission_table': None  # очистим, если раньше была gross схема
            }

        else:
            return jsonify({'success': False, 'error': 'Неверный тип схемы'}), 400

        drivers_collection.update_one(
            {'_id': ObjectId(driver_id)},
            {'$set': update_data}
        )

        return jsonify({'success': True})

    except Exception as e:
        logging.error(f"Ошибка при сохранении схемы зарплаты: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@drivers_bp.route('/get_salary_scheme/<driver_id>', methods=['GET'])
@login_required
def get_salary_scheme(driver_id):
    try:
        driver = drivers_collection.find_one({'_id': ObjectId(driver_id)})
        if not driver:
            return jsonify({'success': False, 'error': 'Водитель не найден'}), 404

        result = {
            'scheme_type': driver.get('scheme_type'),
            'commission_table': driver.get('commission_table', []),
            'net_commission_table': driver.get('net_commission_table', [])
        }

        return jsonify({'success': True, 'data': result})

    except Exception as e:
        logging.error(f"Ошибка при получении схемы зарплаты: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500