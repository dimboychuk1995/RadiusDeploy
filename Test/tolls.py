from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from flask import current_app
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
        if 'vehicle' in item and isinstance(item['vehicle'], ObjectId):
            item['vehicle'] = str(item['vehicle'])
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
        result.append({
            "id": str(t["_id"]),  # ✅ ObjectId как строка
            "text": f"{t.get('unit_number', '')} — {t.get('make', '')} {t.get('model', '')} {t.get('year', '')}"
        })

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
    offset = int(request.args.get('offset', 0))
    limit = int(request.args.get('limit', 30))

    items = list(
        db['all_tolls']
        .find({'company': current_user.company})
        .skip(offset)
        .limit(limit)
    )
    for item in items:
        item['_id'] = str(item['_id'])
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
    import hashlib
    import json

    def compute_import_hash(item):
        # Исключаем технические поля
        data = {k: v for k, v in item.items() if k not in ['_id', 'company']}
        # Сортировка ключей гарантирует одинаковый порядок
        stringified = json.dumps(data, sort_keys=True, ensure_ascii=False)
        return hashlib.md5(stringified.encode('utf-8')).hexdigest()

    items = request.json.get('items', [])
    company = current_user.company

    inserted = 0
    skipped = 0
    used_hashes = set()

    for item in items:
        item['company'] = company
        item['import_hash'] = compute_import_hash(item)

        if not item['import_hash'] or item['import_hash'] in used_hashes:
            skipped += 1
            continue

        used_hashes.add(item['import_hash'])

        existing = db['all_tolls'].find_one({
            'import_hash': item['import_hash'],
            'company': company
        })

        if existing:
            skipped += 1
        else:
            db['all_tolls'].insert_one(item)
            inserted += 1

    return jsonify({
        "inserted": inserted,
        "updated": 0,
        "skipped": skipped
    }), 200


@tolls_bp.route('/api/tolls_summary', methods=['GET'])
@login_required
def tolls_summary():
    company = current_user.company

    transponders = list(db['transponders'].find({'company': company}))
    summary = []

    for t in transponders:
        serial = t.get('serial_number')
        vehicle_id = t.get('vehicle')

        # Получаем юнит (если указан)
        unit_info = {
            'unit_number': '',
            'make': '',
            'model': '',
            'year': ''
        }

        if vehicle_id:
            truck = db['trucks'].find_one({
                '_id': ObjectId(vehicle_id),
                'company': company
            })
            if truck:
                unit_info = {
                    'unit_number': truck.get('unit_number', ''),
                    'make': truck.get('make', ''),
                    'model': truck.get('model', ''),
                    'year': truck.get('year', '')
                }

        matches = list(db['all_tolls'].find({
            'company': company,
            'tag_id': serial
        }))

        count = len(matches)
        total = sum(
            float(toll.get('amount', 0)) for toll in matches
            if isinstance(toll.get('amount'), (int, float)) or str(toll.get('amount')).replace('.', '', 1).replace('-', '').isdigit()
        )

        summary.append({
            'serial_number': serial,
            'count': count,
            'total': round(total, 2),
            **unit_info
        })

    return jsonify(summary)

from bson.objectid import ObjectId, InvalidId

@tolls_bp.route('/api/transponders/<transponder_id>/assign_vehicle', methods=['PATCH'])
@login_required
def assign_vehicle_to_transponder(transponder_id):
    vehicle_id = request.json.get('vehicle')
    company = current_user.company

    current_app.logger.info(f"🛠️ PATCH транспондер {transponder_id}, vehicle: {vehicle_id}, company: {company}")

    try:
        update = {'vehicle': ObjectId(vehicle_id)} if vehicle_id else {'vehicle': None}
    except (InvalidId, TypeError):
        current_app.logger.warning("⚠️ Невалидный ObjectId")
        return jsonify({'error': 'Invalid vehicle ID'}), 400

    result = db['transponders'].update_one(
        {'_id': ObjectId(transponder_id), 'company': company},
        {'$set': update}
    )

    current_app.logger.info(f"📝 Modified count: {result.modified_count}")

    if result.modified_count == 1:
        return jsonify({'status': 'updated'})
    else:
        return jsonify({'error': 'not found or not updated'}), 400