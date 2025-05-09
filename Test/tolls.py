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
    data = request.json
    items = data.get('items', [])

    for item in items:
        item['company'] = current_user.company

    if items:
        transponders_collection.insert_many(items)

    return jsonify({"status": "bulk inserted", "count": len(items)})