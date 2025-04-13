from flask import Blueprint, render_template, request, redirect, url_for
from pymongo import MongoClient
from bson.objectid import ObjectId
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import logging
import gridfs
from datetime import datetime

from Test.auth import requires_role

loads_bp = Blueprint('loads', __name__)

# Подключение к MongoDB
try:
    client = MongoClient('mongodb://localhost:27017/')
    db = client['trucks_db']
    loads_collection = db['loads']
    drivers_collection = db['drivers']
    fs = gridfs.GridFS(db)
    client.admin.command('ping')
    logging.info("Connected to MongoDB")
except Exception as e:
    logging.error(f"MongoDB connection failed: {e}")
    exit(1)


def parse_date(date_str):
    if not date_str:
        return ""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").strftime("%m/%d/%Y")
    except:
        return ""


@loads_bp.route('/add_load', methods=['POST'])
@requires_role('admin')
def add_load():
    try:
        # Загрузка файлов
        rate_con_file = request.files.get('rate_con')
        bol_file = request.files.get('bol')

        rate_con_id = fs.put(rate_con_file, filename=secure_filename(rate_con_file.filename)) if rate_con_file and rate_con_file.filename else None
        bol_id = fs.put(bol_file, filename=secure_filename(bol_file.filename)) if bol_file and bol_file.filename else None

        # Основная информация
        load_data = {
            "load_id": request.form.get("load_id"),
            "broker_load_id": request.form.get("broker_load_id"),
            "type": request.form.get("type"),
            "assigned_driver": ObjectId(request.form.get("assigned_driver")) if request.form.get("assigned_driver") else None,
            "assigned_dispatch": request.form.get("assigned_dispatch"),

            "pickup": {
                "company": request.form.get("pickup_company"),
                "address": request.form.get("pickup_address"),
                "date": parse_date(request.form.get("pickup_date")),
                "instructions": request.form.get("pickup_instructions")
            },

            "delivery": {
                "company": request.form.get("delivery_company"),
                "address": request.form.get("delivery_address"),
                "date": parse_date(request.form.get("delivery_date")),
                "instructions": request.form.get("delivery_instructions")
            },

            "status": request.form.get("status"),
            "payment_status": request.form.get("payment_status"),
            "rate_con": rate_con_id,
            "bol": bol_id,
            "company": current_user.company,
            "was_added_to_statement": False
        }

        # Опциональные extra pickup/delivery
        if request.form.get("extra_pickup_company"):
            load_data["extra_pickup"] = {
                "company": request.form.get("extra_pickup_company"),
                "address": request.form.get("extra_pickup_address"),
                "date": parse_date(request.form.get("extra_pickup_date")),
                "instructions": request.form.get("extra_pickup_instructions")
            }

        if request.form.get("extra_delivery_company"):
            load_data["extra_delivery"] = {
                "company": request.form.get("extra_delivery_company"),
                "address": request.form.get("extra_delivery_address"),
                "date": parse_date(request.form.get("extra_delivery_date")),
                "instructions": request.form.get("extra_delivery_instructions")
            }

        loads_collection.insert_one(load_data)
        return redirect(url_for('index') + '#section-loads-fragment')

    except Exception as e:
        logging.exception("Error adding load")
        return render_template("error.html", message="Ошибка при добавлении груза")


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
        logging.error(f"Rate Con fetch error: {e}")
        return render_template('error.html', message="Не удалось получить файл Rate Con")


@loads_bp.route('/bol/<file_id>', methods=['GET'])
@login_required
def get_bol(file_id):
    try:
        file = fs.get(ObjectId(file_id))
        return file.read(), 200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': f'attachment; filename={file.filename}'
        }
    except Exception as e:
        logging.error(f"BOL fetch error: {e}")
        return render_template('error.html', message="Не удалось получить файл BOL")


@loads_bp.route('/fragment/loads_fragment', methods=['GET'])
@login_required
def loads_fragment():
    try:
        drivers = list(drivers_collection.find({'company': current_user.company}))
        driver_map = {str(d['_id']): d['name'] for d in drivers}

        loads = list(loads_collection.find({'company': current_user.company}))
        for load in loads:
            driver_id = load.get("assigned_driver")
            load["driver_name"] = driver_map.get(str(driver_id), "—") if driver_id else "—"

        return render_template("fragments/loads_fragment.html", drivers=drivers, loads=loads)
    except Exception as e:
        logging.exception("Error loading loads fragment")
        return render_template("error.html", message="Ошибка загрузки фрагмента грузов")
