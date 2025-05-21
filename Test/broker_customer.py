from flask import Blueprint, render_template
import logging
from flask import request, jsonify
from flask_login import login_required, current_user
from bson import ObjectId

from Test.tools.db import db  # централизованное подключение

broker_customer_bp = Blueprint('broker_customer', __name__)
brokers_collection = db['brokers']
customers_collection = db['customers']


@broker_customer_bp.route('/fragment/dispatch_brokers', methods=['GET'])
@login_required
def dispatch_brokers_fragment():
    try:
        brokers = list(brokers_collection.find({'company': current_user.company}))
        customers = list(customers_collection.find({'company': current_user.company}))

        return render_template('fragments/dispatch_brokers_fragment.html',
                               brokers=brokers,
                               customers=customers)
    except Exception as e:
        logging.error(f"Ошибка при загрузке брокеров/кастомеров: {e}")
        return "Ошибка загрузки данных", 500

@broker_customer_bp.route('/api/add_broker_customer', methods=['POST'])
@login_required
def add_broker_customer():
    try:
        data = request.json
        entity_type = data.get('type')

        if entity_type not in ['broker', 'customer']:
            return jsonify({'error': 'Invalid type'}), 400

        doc = {
            'name': data.get('name'),
            'phone': data.get('phone'),  # ✅ новое поле
            'email': data.get('email'),
            'contact_person': data.get('contact_person'),
            'contact_phone': data.get('contact_phone'),
            'contact_email': data.get('contact_email'),
            'address': data.get('address'),
            'payment_term': data.get('payment_term'),
            'company': current_user.company
        }

        if entity_type == 'broker':
            doc['mc'] = data.get('mc')
            doc['dot'] = data.get('dot')
            brokers_collection.insert_one(doc)
        else:
            customers_collection.insert_one(doc)

        return jsonify({'message': 'Добавлено успешно'}), 200

    except Exception as e:
        logging.error(f"Ошибка добавления брокера/кастомера: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500


@broker_customer_bp.route('/api/delete_broker_customer', methods=['POST'])
@login_required
def delete_broker_customer():
    try:
        data = request.get_json()
        entity_type = data.get("type")
        _id = data.get("id")

        if not _id or entity_type not in ['broker', 'customer']:
            return jsonify({'error': 'Invalid data'}), 400

        collection = brokers_collection if entity_type == 'broker' else customers_collection
        result = collection.delete_one({'_id': ObjectId(_id), 'company': current_user.company})

        if result.deleted_count == 1:
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Не найдено'}), 404
    except Exception as e:
        logging.error(f"Ошибка удаления: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500