from flask import Blueprint, render_template, jsonify
from flask_login import login_required, current_user

from Test.tools.db import db

load_stats_api = Blueprint('load_stats_api', __name__)
loads_collection = db['loads']

# HTML-фрагмент
@load_stats_api.route('/fragment/load_stats_fragment')
@login_required
def load_stats_fragment():
    return render_template('fragments/load_stats_fragment.html')

@load_stats_api.route('/api/load_stats/general')
@login_required
def load_stats_general():
    loads = list(db['loads'].find({'company': current_user.company}))
    brokers_col = db['brokers']
    customers_col = db['customers']

    total_loads = len(loads)
    total_amount = 0.0
    total_miles = 0.0

    parsed_loads = []

    for load in loads:
        try:
            price = float(load.get('price') or 0)
        except:
            price = 0

        try:
            miles = float(load.get('total_miles') or 0)
        except:
            miles = 0

        total_amount += price
        total_miles += miles

        # Получение имени брокера или кастомера
        broker_id = load.get("broker_id")
        broker_name = ""
        if broker_id:
            if isinstance(broker_id, str):
                broker_id = ObjectId(broker_id)

            broker = brokers_col.find_one({"_id": broker_id}) or customers_col.find_one({"_id": broker_id})
            broker_name = broker.get("name") if broker else ""

        try:
            rpm = float(load.get('RPM') or 0)
        except:
            rpm = 0

        parsed_loads.append({
            "load_id": load.get("load_id", ""),
            "broker": broker_name,
            "pickup": load.get("pickup", {}).get("address", ""),
            "delivery": load.get("delivery", {}).get("address", ""),
            "pickup_date": load.get("pickup", {}).get("date", ""),
            "delivery_date": load.get("delivery", {}).get("date", ""),
            "miles": miles,
            "rpm": rpm,
            "driver": load.get("driver_name", ""),
            "dispatch": load.get("dispatch_name", "")
        })

    avg_rpm = (total_miles / total_amount) if total_amount else 0
    avg_miles = (total_miles / total_loads) if total_loads else 0
    avg_price = (total_amount / total_loads) if total_loads else 0

    return jsonify({
        'total_loads': total_loads,
        'total_amount': total_amount,
        'total_miles': total_miles,
        'avg_rpm': avg_rpm,
        'avg_miles': avg_miles,
        'avg_price': avg_price,
        'loads': parsed_loads
    })