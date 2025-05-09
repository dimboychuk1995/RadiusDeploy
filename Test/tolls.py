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
