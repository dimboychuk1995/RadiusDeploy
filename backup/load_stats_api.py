from bson import ObjectId
from flask import Blueprint, render_template, jsonify
from flask_login import login_required, current_user

from tools.db import db

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
        price = float(load.get('price') or 0)
        miles = float(load.get('total_miles') or 0)
        total_amount += price
        total_miles += miles

        broker_id = load.get("broker_id")
        broker_name = ""
        if broker_id:
            if isinstance(broker_id, str):
                broker_id = ObjectId(broker_id)
            broker = brokers_col.find_one({"_id": broker_id}) or customers_col.find_one({"_id": broker_id})
            broker_name = broker.get("name") if broker else ""

        rpm = float(load.get('RPM') or 0)

        parsed_loads.append({
            "load_id": load.get("load_id", ""),
            "broker": broker_name,
            "pickup": load.get("pickup", {}).get("address", ""),
            "delivery": load.get("delivery", {}).get("address", ""),
            "pickup_date": load.get("pickup", {}).get("date", ""),
            "delivery_date": load.get("delivery", {}).get("date", ""),
            "miles": miles,
            "rpm": rpm,
            "price": price,
            "total_miles": miles,
            "driver": load.get("driver_name", ""),
            "driver_id": str(load.get("assigned_driver", "")),  # 👈 добавили
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


@load_stats_api.route('/api/load_stats/by_driver')
@login_required
def load_stats_by_driver():
    loads = list(db['loads'].find({'company': current_user.company}))
    drivers_col = db['drivers']

    stats_by_driver = {}

    for load in loads:
        driver_id = load.get("assigned_driver") or load.get("driver_id")
        driver_name = ""

        # Поиск имени водителя
        if driver_id:
            if isinstance(driver_id, str):
                try:
                    driver_obj_id = ObjectId(driver_id)
                except:
                    driver_obj_id = None
            else:
                driver_obj_id = driver_id

            if driver_obj_id:
                driver = drivers_col.find_one({"_id": driver_obj_id})
                if driver:
                    driver_name = driver.get("name", "")
        else:
            driver_name = load.get("driver_name", "Без имени")

        driver_name = driver_name or "Без имени"
        driver_id_str = str(driver_id) if driver_id else ""

        try:
            price = float(load.get("price") or 0)
        except:
            price = 0

        try:
            miles = float(load.get("total_miles") or 0)
        except:
            miles = 0

        key = driver_id_str or driver_name
        if key not in stats_by_driver:
            stats_by_driver[key] = {
                "driver_id": driver_id_str,
                "driver": driver_name,
                "count": 0,
                "total": 0.0,
                "miles": 0.0
            }

        stats_by_driver[key]["count"] += 1
        stats_by_driver[key]["total"] += price
        stats_by_driver[key]["miles"] += miles

    result = []
    for stat in stats_by_driver.values():
        count = stat["count"]
        total = stat["total"]
        miles = stat["miles"]
        rpm = miles / total if total else 0
        avg_miles = miles / count if count else 0
        avg_price = total / count if count else 0

        result.append({
            "driver_id": stat["driver_id"],
            "driver": stat["driver"],
            "count": count,
            "total": total,
            "miles": miles,
            "rpm": rpm,
            "avg_miles": avg_miles,
            "avg_price": avg_price
        })

    return jsonify(result)



@load_stats_api.route('/api/load_stats/by_broker')
@login_required
def load_stats_by_broker():
    loads = list(db['loads'].find({'company': current_user.company}))
    brokers_col = db['brokers']
    customers_col = db['customers']

    stats = {}

    for load in loads:
        broker_id = load.get("broker_id")
        if not broker_id:
            continue

        if isinstance(broker_id, str):
            broker_id = ObjectId(broker_id)

        broker = brokers_col.find_one({"_id": broker_id})
        if not broker:
            broker = customers_col.find_one({"_id": broker_id})

        name = broker.get("name", "Без имени") if broker else "Без имени"

        try:
            price = float(load.get("price") or 0)
        except:
            price = 0

        try:
            miles = float(load.get("total_miles") or 0)
        except:
            miles = 0

        if name not in stats:
            stats[name] = {
                "name": name,
                "count": 0,
                "total": 0.0,
                "total_miles": 0.0
            }

        stats[name]["count"] += 1
        stats[name]["total"] += price
        stats[name]["total_miles"] += miles

    result = []
    for s in stats.values():
        count = s["count"]
        total = s["total"]
        miles = s["total_miles"]
        rpm = miles / total if total else 0
        avg_miles = miles / count if count else 0
        avg_price = total / count if count else 0

        result.append({
            "name": s["name"],
            "count": count,
            "total": total,
            "total_miles": miles,
            "avg_miles": avg_miles,
            "rpm": rpm,
            "avg_price": avg_price
        })

    return jsonify(result)
