from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from pymongo import MongoClient
from bson.objectid import ObjectId
import logging
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import gridfs

from Test.auth import requires_role

logging.basicConfig(level=logging.ERROR)

loads_bp = Blueprint('loads', __name__)

try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['trucks_db']
    loads_collection = db['loads']
    drivers_collection = db['drivers']
    fs = gridfs.GridFS(db)
    client.admin.command('ping')
    logging.info("Successfully connected to MongoDB")
except Exception as e:
    logging.error(f"Failed to connect to MongoDB: {e}")
    exit(1)


@loads_bp.route('/add_load', methods=['POST'])
@requires_role('admin')
def add_load():
    if request.method == 'POST':
        try:
            rate_con_file = request.files.get('rate_con')
            if rate_con_file and rate_con_file.filename:
                filename = secure_filename(rate_con_file.filename)
                file_id = fs.put(rate_con_file, filename=filename)
            else:
                file_id = None

            driver_id = request.form.get('driver')
            if not driver_id:
                raise ValueError("Driver is required")

            load_data = {
                'driver': ObjectId(driver_id),
                'pickup_location': request.form.get('pickup_location'),
                'delivery_location': request.form.get('delivery_location'),
                'pickup_date': request.form.get('pickup_date'),
                'delivery_date': request.form.get('delivery_date'),
                'status': request.form.get('status'),
                'rate_con': file_id,
                'company': current_user.company,
                'price': request.form.get('price'),
                'was_added_to_statement': False  # ✅ добавили это поле
            }

            loads_collection.insert_one(load_data)
            return redirect(url_for('index') + '#section-loads-fragment')
        except Exception as e:
            logging.exception("Error adding load:")
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


@loads_bp.route('/fragment/loads_fragment', methods=['GET'])
@login_required
def loads_fragment():
    drivers = list(drivers_collection.find({'company': current_user.company}))
    loads = list(loads_collection.find({'company': current_user.company}))

    driver_map = {str(driver['_id']): driver['name'] for driver in drivers}

    for load in loads:
        load['driver_name'] = driver_map.get(str(load.get('driver')), 'Неизвестно')

    return render_template('fragments/loads_fragment.html', drivers=drivers, loads=loads)
