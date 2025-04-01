from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from pymongo import MongoClient
from bson.objectid import ObjectId
import logging
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import gridfs

from Test.auth import requires_role

# Настраиваем логирование
logging.basicConfig(level=logging.ERROR)

# Создаем Blueprint для функциональности грузов
loads_bp = Blueprint('loads', __name__)

# Настройки подключения к MongoDB
try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['trucks_db']
    loads_collection = db['loads']
    drivers_collection = db['drivers']
    fs = gridfs.GridFS(db)  # Создаем GridFS для хранения файлов
    client.admin.command('ping')
    logging.info("Successfully connected to MongoDB")
except Exception as e:
    logging.error(f"Failed to connect to MongoDB: {e}")
    exit(1)


@loads_bp.route('/loads', methods=['GET'])
@login_required
def loads_list():
    try:
        loads = list(loads_collection.find({'company': current_user.company}))
        drivers = list(drivers_collection.find({'company': current_user.company}))
        return render_template('loads.html', loads=loads, drivers=drivers)
    except Exception as e:
        logging.error(f"Error fetching loads: {e}")
        return render_template('error.html', message="Failed to retrieve loads list")


@loads_bp.route('/add_load', methods=['POST'])
@requires_role('admin')
def add_load():
    if request.method == 'POST':
        try:
            # Обработка загруженного файла
            rate_con_file = request.files['rate_con']
            if rate_con_file:
                filename = secure_filename(rate_con_file.filename)
                file_id = fs.put(rate_con_file, filename=filename)
            else:
                file_id = None

            load_data = {
                'driver': request.form.get('driver'),
                'pickup_location': request.form.get('pickup_location'),
                'delivery_location': request.form.get('delivery_location'),
                'pickup_date': request.form.get('pickup_date'),
                'delivery_date': request.form.get('delivery_date'),
                'status': request.form.get('status'),
                'rate_con': file_id,
                'company': current_user.company
            }
            loads_collection.insert_one(load_data)
            return redirect(url_for('loads.loads_list'))
        except Exception as e:
            logging.error(f"Error adding load: {e}")
            return render_template('error.html', message="Failed to add load")


@loads_bp.route('/rate_con/<file_id>', methods=['GET'])
@login_required
def get_rate_con(file_id):
    try:
        file = fs.get(ObjectId(file_id))
        return file.read(), 200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': f'attachment; filename={file.filename}'
        }
    except Exception as e:
        logging.error(f"Error fetching rate con file: {e}")
        return render_template('error.html', message="Failed to retrieve the file")