from flask import Blueprint, render_template, request, Response
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from Test.tools.db import db
import logging
from datetime import datetime

fleet_bp = Blueprint('fleet', __name__)

def to_mmddyyyy(date_str):
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").strftime("%m/%d/%Y")
    except Exception:
        return date_str  # если формат не тот

@fleet_bp.route('/fragment/fleet_fragment', methods=['GET'])
@login_required
def fleet_fragment():
    trucks = list(db['trucks'].find({'company': current_user.company}))
    drivers = list(db['drivers'].find({'company': current_user.company}))

    driver_map = {}
    for d in drivers:
        truck_id = d.get('truck')
        if truck_id:
            driver_map[str(truck_id)] = d

    return render_template('fragments/fleet_fragment.html', trucks=trucks, driver_map=driver_map)

@fleet_bp.route('/fragment/fleet_unit_details/<unit_id>', methods=['GET'])
@login_required
def fleet_unit_details_fragment(unit_id):
    unit = db['trucks'].find_one({'_id': ObjectId(unit_id), 'company': current_user.company})
    services = list(db['fleet_services'].find({'unit_id': ObjectId(unit_id)}))
    return render_template('fragments/fleet_unit_details_fragment.html', unit=unit, services=services)

@fleet_bp.route('/fleet/download_service_file/<service_id>', methods=['GET'])
@login_required
def download_service_file(service_id):
    service = db['fleet_services'].find_one({'_id': ObjectId(service_id)})
    if not service or not service.get('file'):
        return "File not found", 404

    file_data = service['file']
    return Response(file_data['content'], mimetype=file_data['content_type'])

@fleet_bp.route('/fleet/add_service', methods=['POST'])
@login_required
def add_service():
    try:
        file = request.files.get('file')
        file_data = None
        if file and file.filename:
            file_data = {
                'filename': file.filename,
                'content': file.read(),
                'content_type': file.content_type
            }

        service = {
            'unit_id': ObjectId(request.form.get('unit_id')),
            'date': to_mmddyyyy(request.form.get('date')),
            'invoice_no': request.form.get('invoice_no'),
            'shop': request.form.get('shop'),
            'shop_address': request.form.get('shop_address'),
            'phone_number': request.form.get('phone_number'),
            'type': request.form.get('type'),
            'mileage': request.form.get('mileage'),
            'amount': float(request.form.get('amount')) if request.form.get('amount') else 0,
            'description': request.form.get('description'),
            'file': file_data
        }

        db['fleet_services'].insert_one(service)
        return '', 200  # 👈 возвращаем 200 OK без редиректа
    except Exception as e:
        logging.error(f"Ошибка при добавлении сервиса: {e}")
        return Response("Error", status=500)
