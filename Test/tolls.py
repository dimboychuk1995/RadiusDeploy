from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from bson.objectid import ObjectId
from Test.tools.db import db  # централизованное подключение к базе

tolls_bp = Blueprint('tolls', __name__)
transponders_collection = db['transponders']

@tolls_bp.route('/fragment/tolls_fragment', methods=['GET'])
@login_required
def tolls_fragment():
    return render_template('fragments/tolls_fragment.html')


# ✅ Получить все транспондеры
@tolls_bp.route('/api/transponders', methods=['GET'])
@login_required
def get_transponders():
    items = list(transponders_collection.find({'company': current_user.company}))
    for item in items:
        item['_id'] = str(item['_id'])
    return jsonify(items)


# ✅ Сохранить новый транспондер
@tolls_bp.route('/api/transponders', methods=['POST'])
@login_required
def add_transponder():
    data = request.json
    data['company'] = current_user.company
    transponders_collection.insert_one(data)
    return jsonify({"status": "success"}), 201


@tolls_bp.route('/api/trucks', methods=['GET'])
@login_required
def get_trucks():
    term = request.args.get('term', '').strip().lower()
    query = {'company': current_user.company}

    if term:
        query['unit_number'] = {'$regex': term, '$options': 'i'}

    trucks = db['trucks'].find(query)
    result = []

    for t in trucks:
        unit = t.get('unit_number', '')
        make = t.get('make', '')
        model = t.get('model', '')
        year = t.get('year', '')

        label = f"{unit} — {make} {model} {year}".strip()
        result.append({"id": unit, "text": label})

    return jsonify(result)

@tolls_bp.route('/api/transponders/<transponder_id>', methods=['DELETE'])
@login_required
def delete_transponder(transponder_id):
    result = db['transponders'].delete_one({
        '_id': ObjectId(transponder_id),
        'company': current_user.company
    })
    if result.deleted_count == 1:
        return jsonify({"status": "deleted"}), 200
    else:
        return jsonify({"error": "Not found"}), 404


@tolls_bp.route('/api/transponders/bulk', methods=['POST'])
@login_required
def add_bulk_transponders():
    items = request.json.get('items', [])
    company = current_user.company

    inserted = 0
    updated = 0
    skipped = 0

    for item in items:
        # Нормализуем serial_number
        serial = str(item.get('serial_number', '')).strip().replace('"', '')
        if not serial:
            continue

        item['serial_number'] = serial
        item['company'] = company

        existing = transponders_collection.find_one({
            'serial_number': serial,
            'company': company
        })

        if existing:
            changed = False
            for key in item:
                if key not in ['_id', 'company'] and item[key] != existing.get(key):
                    changed = True
                    break

            if changed:
                transponders_collection.update_one(
                    {'_id': existing['_id']},
                    {'$set': item}
                )
                updated += 1
            else:
                skipped += 1
        else:
            transponders_collection.insert_one(item)
            inserted += 1

    return jsonify({
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped
    }), 200

@tolls_bp.route('/api/tolls', methods=['POST'])
@login_required
def add_toll():
    data = request.json
    data['company'] = current_user.company
    db['all_tolls'].insert_one(data)
    return jsonify({'status': 'success'}), 201

@tolls_bp.route('/api/all_tolls', methods=['GET'])
@login_required
def get_all_tolls():
    items = list(db['all_tolls'].find({'company': current_user.company}))
    for item in items:
        item['_id'] = str(item['_id'])  # для фронта
    return jsonify(items)

@tolls_bp.route('/api/tolls/<toll_id>', methods=['DELETE'])
@login_required
def delete_toll(toll_id):
    result = db['all_tolls'].delete_one({
        '_id': ObjectId(toll_id),
        'company': current_user.company
    })
    if result.deleted_count == 1:
        return jsonify({'status': 'deleted'}), 200
    else:
        return jsonify({'error': 'Not found'}), 404


@tolls_bp.route('/api/tolls/bulk', methods=['POST'])
@login_required
def bulk_import_tolls():
    items = request.json.get('items', [])
    print(f"📥 Получено {len(items)} записей на импорт")

    company = current_user.company
    print(f"🏢 Компания пользователя: {company}")

    for item in items:
        print(f"📄 Импортируемая строка: {item}")
        item['company'] = company

    if items:
        db['all_tolls'].insert_many(items)
        print(f"✅ Вставлено {len(items)} записей в базу all_tolls")

    return jsonify({'status': 'imported', 'count': len(items)})