from flask import Blueprint, request, jsonify, render_template
from flask_login import login_required, current_user
from bson import ObjectId
from Test.tools.db import db

load_stats_api = Blueprint('load_stats_api', __name__)
loads_collection = db['loads']

# HTML-фрагмент
@load_stats_api.route('/fragment/load_stats_fragment')
@login_required
def load_stats_fragment():
    return render_template('fragments/load_stats_fragment.html')

# API для статистики
@load_stats_api.route('/api/load_stats')
@login_required
def api_load_stats():
    start = request.args.get('start')
    end = request.args.get('end')
    driver_id = request.args.get('driver')

    query = {'company': current_user.company}

    if start and end:
        query['delivery.date'] = {'$gte': start, '$lte': end}

    if driver_id:
        query['assigned_driver'] = ObjectId(driver_id)

    loads = list(loads_collection.find(query))
    result = {}

    for load in loads:
        driver_name = load.get('driver_name', 'Без имени')
        driver_key = str(load.get('assigned_driver'))

        if driver_key not in result:
            result[driver_key] = {
                'driver_name': driver_name,
                'load_count': 0,
                'total_price': 0.0,
                'total_rpm': 0.0
            }

        result[driver_key]['load_count'] += 1
        result[driver_key]['total_price'] += float(load.get('price', 0))
        result[driver_key]['total_rpm'] += float(load.get('RPM', 0))

    final = []
    for stats in result.values():
        avg_rpm = stats['total_rpm'] / stats['load_count'] if stats['load_count'] else 0
        final.append({
            'driver_name': stats['driver_name'],
            'load_count': stats['load_count'],
            'total_price': stats['total_price'],
            'avg_rpm': avg_rpm
        })

    return jsonify(final)
