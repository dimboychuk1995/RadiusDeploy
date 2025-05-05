from datetime import datetime, timedelta

from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from pymongo import MongoClient
import logging
from bson import ObjectId
import traceback
from urllib.parse import unquote

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
    client = MongoClient("mongodb+srv://dimboychuk1995:Mercedes8878@trucks.5egoxb8.mongodb.net/trucks_db")
    db = client['trucks_db']
    drivers_collection = db['drivers']
    trucks_collection = db['trucks']
    loads_collection = db['loads']
    fuel_cards_collection = db['fuel_cards']
    statement_collection = db['statement']
    fuel_cards_transactions_collection = db['fuel_cards_transactions']
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
        statements = list(statement_collection.find({'company': current_user.company}))

        truck_map = {str(truck['_id']): cleanup_doc(truck) for truck in trucks}

        cleaned_drivers = []
        valid_schemes = ['gross', 'net', 'net_percent', 'net_gross']

        for driver in drivers:
            d = cleanup_doc(driver)
            d['_id'] = str(d['_id'])  # 🔥 обязательно строка

            raw_commission = driver.get('commission_table', [])
            raw_net_commission = driver.get('net_commission_table', [])

            d['commission_table'] = normalize_commission_table(raw_commission)
            d['net_commission_table'] = normalize_commission_table(raw_net_commission)

            if d.get('scheme_type') not in valid_schemes:
                d['scheme_type'] = 'gross'

            truck_id = str(d.get('truck'))
            d['truck'] = truck_map.get(truck_id)

            cleaned_drivers.append(d)

        for t in trucks:
            t['_id'] = str(t['_id'])
        for l in loads:
            l['_id'] = str(l['_id'])
            l['driver_id'] = str(l.get('driver_id'))
            l['truck_id'] = str(l.get('truck_id'))

        for s in statements:
            s['_id'] = str(s['_id'])
            s['driver_id'] = str(s.get('driver_id'))  # 🔥 тоже строка!
            s['load_ids'] = [str(lid) for lid in s.get('load_ids', [])]
            s['created_at'] = s.get('created_at').strftime('%Y-%m-%d %H:%M') if s.get('created_at') else ''

        return render_template('fragments/statement_fragment.html',
                               drivers=cleaned_drivers,
                               trucks=trucks,
                               loads=loads,
                               statements=statements)

    except Exception as e:
        logging.error("Ошибка в statement_fragment:")
        logging.error(traceback.format_exc())
        return render_template('error.html', message="Failed to retrieve statement data")


# --- Таблица грузов (AJAX) ---
@statement_bp.route('/statement/driver_loads/<driver_id>', methods=['GET'])
@login_required
def get_driver_loads(driver_id):
    try:
        loads = loads_collection.find({
            'assigned_driver': ObjectId(driver_id),
            'company': current_user.company,
            'was_added_to_statement': {'$ne': True}
        })

        parsed = []

        for l in loads:
            # Основная доставка
            delivery_dates = []
            main_delivery = l.get('delivery', {})
            if main_delivery.get('date'):
                delivery_dates.append(main_delivery['date'])

            # Дополнительные доставки
            extra_deliveries = l.get('extra_delivery', [])
            for ed in extra_deliveries:
                if isinstance(ed, dict) and ed.get('date'):
                    delivery_dates.append(ed['date'])

            # Найти самую позднюю дату
            latest_delivery_date = ''
            if delivery_dates:
                try:
                    parsed_dates = [datetime.strptime(d, "%m/%d/%Y") for d in delivery_dates if d]
                    latest_delivery_date = max(parsed_dates).strftime("%m/%d/%Y")
                except Exception as e:
                    logging.warning(f"Ошибка при разборе дат доставки: {e}")

            parsed.append({
                '_id': str(l.get('_id')),
                'pickup_location': l.get('pickup', {}).get('address', ''),
                'delivery_location': l.get('delivery', {}).get('address', ''),
                'pickup_date': l.get('pickup', {}).get('date', ''),
                'delivery_date': latest_delivery_date,
                'price': l.get('price', '0'),
                'status': l.get('status', ''),
                'rate_con': str(l.get('rate_con')) if l.get('rate_con') else None,
                'was_added_to_statement': l.get('was_added_to_statement', False)
            })

        return render_template('fragments/partials/driver_loads_table.html', loads=parsed)

    except Exception as e:
        logging.error(f"Ошибка при получении грузов водителя: {e}")
        return "<p class='text-danger'>Ошибка загрузки данных</p>"

# --- Создание стейтмента ---
@statement_bp.route('/statement/create', methods=['POST'])
@login_required
def create_statement():
    try:
        data = request.get_json()
        driver_id = data.get('driver_id')
        week = data.get('week')
        note = data.get('note', '')
        fuel = float(data.get('fuel', 0))
        tolls = float(data.get('tolls', 0))
        gross = float(data.get('gross', 0))
        salary = float(data.get('salary', 0))
        load_ids = data.get('load_ids', [])

        if not driver_id or not load_ids:
            return jsonify({'error': 'Missing driver or loads'}), 400

        statement_doc = {
            'driver_id': ObjectId(driver_id),
            'week': week,
            'note': note,
            'fuel': fuel,
            'tolls': tolls,
            'gross': gross,
            'salary': salary,
            'load_ids': [ObjectId(lid) for lid in load_ids],
            'company': current_user.company,
            'created_at': datetime.utcnow()
        }

        statement_collection.insert_one(statement_doc)

        loads_collection.update_many(
            {'_id': {'$in': [ObjectId(lid) for lid in load_ids]}},
            {'$set': {'was_added_to_statement': True}}
        )

        return jsonify({'status': 'ok'}), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@statement_bp.route('/statement/details/<statement_id>', methods=['GET'])
@login_required
def statement_details(statement_id):
    try:
        statement = statement_collection.find_one({
            '_id': ObjectId(statement_id),
            'company': current_user.company
        })
        if not statement:
            return "<p class='text-danger'>Стейтмент не найден</p>"

        driver = drivers_collection.find_one({'_id': statement['driver_id']})
        loads = loads_collection.find({'_id': {'$in': statement.get('load_ids', [])}})

        return render_template('fragments/statement_details_fragment.html',
                               statement=cleanup_doc(statement),
                               driver=cleanup_doc(driver) if driver else None,
                               loads=[cleanup_doc(l) for l in loads])
    except Exception as e:
        logging.error("Ошибка в statement_details:")
        logging.error(traceback.format_exc())
        return "<p class='text-danger'>Ошибка при загрузке деталей</p>"

@statement_bp.route('/statement/delete/<statement_id>', methods=['DELETE'])
@login_required
def delete_statement(statement_id):
    try:
        statement = statement_collection.find_one({
            '_id': ObjectId(statement_id),
            'company': current_user.company
        })

        if not statement:
            return jsonify({'error': 'Statement not found'}), 404

        # Получаем список грузов из стейтмента
        load_ids = statement.get('load_ids', [])

        # Удаляем сам стейтмент
        statement_collection.delete_one({'_id': ObjectId(statement_id)})

        # Снимаем флаг was_added_to_statement у грузов
        loads_collection.update_many(
            {'_id': {'$in': load_ids}},
            {'$set': {'was_added_to_statement': False}}
        )

        return jsonify({'status': 'deleted'}), 200

    except Exception as e:
        logging.error(f"Ошибка при удалении стейтмента: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500

@statement_bp.route('/statement/driver_fuel/<driver_id>/<path:week_range>', methods=['GET'])
@login_required
def get_driver_fuel_transactions(driver_id, week_range):
    try:
        # Декодируем диапазон недели
        week_range = unquote(week_range)

        # Ищем карту, привязанную к водителю
        card = fuel_cards_collection.find_one({
            'assigned_driver': ObjectId(driver_id),
            'company': current_user.company
        })

        if not card:
            return "<p class='text-muted'>Карта водителя не найдена.</p>"

        card_number = card.get('card_number')
        if not card_number:
            return "<p class='text-muted'>Номер карты не указан.</p>"

        # Разбор диапазона недели
        start_str, end_str = week_range.split(' - ')
        selected_range = f"{start_str.strip()} - {end_str.strip()}"

        # Перевод billing_date в "понедельник - воскресенье"
        def billing_to_week_range(date_str):
            billing_date = datetime.strptime(date_str, "%m/%d/%Y")
            end = billing_date - timedelta(days=1)
            start = end - timedelta(days=6)
            return f"{start.strftime('%m/%d/%Y')} - {end.strftime('%m/%d/%Y')}"

        # Загружаем транзакции по карте
        transactions = fuel_cards_transactions_collection.find({
            'card_number': card_number,
            'company': current_user.company
        })

        # Фильтрация по диапазону
        matched = []
        for tx in transactions:
            billing_date_str = tx.get('billing_date')
            if not billing_date_str:
                continue
            tx_range = billing_to_week_range(billing_date_str)
            if tx_range == selected_range:
                matched.append(tx)

        # Подготовка к шаблону
        parsed = [{
            '_id': str(t['_id']),
            'date': t.get('date'),
            'card_number': t.get('card_number'),
            'qty': t.get('qty'),
            'fuel_total': t.get('fuel_total'),
            'retail_price': t.get('retail_price'),
            'invoice_total': t.get('invoice_total'),
        } for t in matched]

        return render_template('fragments/partials/driver_fuel_table.html', transactions=parsed)

    except Exception as e:
        logging.error("Ошибка при получении топливных транзакций:")
        logging.error(traceback.format_exc())
        return "<p class='text-danger'>Ошибка загрузки топлива</p>"