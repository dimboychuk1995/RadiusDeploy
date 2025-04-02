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

# Список всех водителей
@drivers_bp.route('/drivers', methods=['GET', 'POST'])
@login_required
def drivers_list():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        trucks = list(trucks_collection.find({'company': current_user.company}))

        truck_units = {str(truck['_id']): truck['unit_number'] for truck in trucks}

        for driver in drivers:
            driver['_id'] = str(driver['_id'])
            driver['truck_unit'] = truck_units.get(driver.get('truck'), 'Нет трака')

        if request.method == 'POST':
            driver_data = {
                'name': request.form.get('name'),
                'license_number': request.form.get('license_number'),
                'contact_number': request.form.get('contact_number'),
                'company': current_user.company
            }
            drivers_collection.insert_one(driver_data)
            return redirect(url_for('drivers.drivers_list'))

        return render_template('drivers.html', drivers=drivers, trucks=trucks)
    except Exception as e:
        logging.error(f"Error fetching drivers or trucks: {e}")
        return render_template('error.html', message="Failed to retrieve drivers or trucks list")

# Страница водителя + редактирование + вкладка грузов
@drivers_bp.route('/driver/<driver_id>', methods=['GET', 'POST'])
@login_required
def driver_detail(driver_id):
    try:
        driver = drivers_collection.find_one({'_id': ObjectId(driver_id)})
        if not driver:
            return render_template('error.html', message="Driver not found")

        if request.method == 'POST':
            updated_data = {
                'name': request.form.get('name'),
                'license_number': request.form.get('license_number'),
                'contact_number': request.form.get('contact_number'),
                'truck': request.form.get('truck'),
                'dispatcher': request.form.get('dispatcher'),
                'company': current_user.company
            }
            drivers_collection.update_one({'_id': ObjectId(driver_id)}, {'$set': updated_data})
            return redirect(url_for('drivers.driver_detail', driver_id=driver_id))

        driver['_id'] = str(driver['_id'])

        truck = trucks_collection.find_one({'_id': ObjectId(driver.get('truck'))}) if driver.get('truck') else None
        dispatcher = users_collection.find_one({'_id': ObjectId(driver.get('dispatcher'))}) if driver.get('dispatcher') else None
        trucks = list(trucks_collection.find({'company': current_user.company}))
        dispatchers = list(users_collection.find({'company': current_user.company, 'role': 'dispatch'}))

        # Загрузка грузов, где водитель назначен
        loads = list(loads_collection.find({'driver': ObjectId(driver['_id'])}))

        return render_template(
            'driver_detail.html',
            driver=driver,
            truck=truck,
            dispatcher=dispatcher,
            trucks=trucks,
            dispatchers=dispatchers,
            loads=loads
        )
    except Exception as e:
        logging.error(f"Error fetching or updating driver: {e}")
        return render_template('error.html', message="Failed to load or update driver")

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

# Отдельный маршрут редактирования (если используется отдельно)
@drivers_bp.route('/edit_driver/<driver_id>', methods=['POST'])
@requires_role('admin')
def edit_driver(driver_id):
    if request.method == 'POST':
        try:
            updated_data = {
                'name': request.form.get('name'),
                'license_number': request.form.get('license_number'),
                'contact_number': request.form.get('contact_number'),
                'truck': request.form.get('truck'),
                'dispatcher': request.form.get('dispatcher'),
                'company': current_user.company
            }
            drivers_collection.update_one({'_id': ObjectId(driver_id)}, {'$set': updated_data})
            return redirect(url_for('drivers.drivers_list'))
        except Exception as e:
            logging.error(f"Error updating driver: {e}")
            return render_template('error.html', message="Failed to edit driver")

# Страница диспетчерской
@drivers_bp.route('/dispatch', methods=['GET'])
@login_required
def dispatch_list():
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

        return render_template('dispatch.html', drivers=drivers, dispatchers=dispatchers)
    except Exception as e:
        logging.error(f"Error fetching dispatch data: {e}")
        return render_template('error.html', message="Failed to retrieve dispatch data")
