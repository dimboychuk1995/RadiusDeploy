from flask import request, jsonify, Blueprint, render_template
from flask_login import login_required
from datetime import datetime, timedelta
from pytz import timezone, utc
from bson import ObjectId
from tools.db import db
dispatch_statements_bp = Blueprint('dispatch_statements', __name__)

users_collection = db['users']
loads_collection = db["loads"]
tz_collection = db["company_timezone"]


@dispatch_statements_bp.route("/fragment/statement_dispatchers")
def statement_dispatchers_fragment():
    dispatchers = list(users_collection.find({"role": "dispatch"}, {"_id": 1, "real_name": 1}))
    for dispatcher in dispatchers:
        dispatcher["id"] = str(dispatcher["_id"])
    return render_template("fragments/statement_dispatchers_fragment.html", dispatchers=dispatchers)

@dispatch_statements_bp.route("/api/calculate_dispatcher_payroll", methods=["POST"])
@login_required
def calculate_dispatcher_payroll():
    try:
        data = request.get_json()
        dispatcher_id = data.get("dispatcher_id")
        week_range = data.get("week_range")  # формат mm/dd/yyyy - mm/dd/yyyy

        if not dispatcher_id or not week_range:
            return jsonify({"error": "Missing dispatcher_id or week_range"}), 400

        # Таймзона
        tz_data = tz_collection.find_one()
        tz_name = tz_data.get("timezone", "America/Chicago")
        local_tz = timezone(tz_name)

        # Диапазон
        start_str, end_str = [s.strip() for s in week_range.split("-")]
        start_local = local_tz.localize(datetime.strptime(start_str, "%m/%d/%Y"))
        end_local = local_tz.localize(datetime.strptime(end_str, "%m/%d/%Y") + timedelta(days=1))

        # Диспетчер
        dispatcher = users_collection.find_one({"_id": ObjectId(dispatcher_id)})
        if not dispatcher:
            return jsonify({"error": "Dispatcher not found"}), 404

        salary_type = dispatcher.get("salary_scheme_type")
        salary_percent = dispatcher.get("salary_percent", 0)
        salary_fixed = dispatcher.get("salary_fixed", 0)
        salary_per_driver = dispatcher.get("salary_per_driver", 0)

        # Получаем грузы
        loads = list(loads_collection.find({
            "assigned_dispatch": ObjectId(dispatcher_id),
            "$or": [
                {"extra_delivery": {"$ne": None}},
                {"delivery": {"$ne": None}}
            ]
        }))

        matched_loads = []
        total_price = 0
        driver_groups = {}
        no_driver_loads = []
        loads_list = []

        for load in loads:
            if load.get("was_added_to_dispatch_statement") is True:
                continue

            last_delivery = (load["extra_delivery"][-1] if load.get("extra_delivery") else load.get("delivery"))
            if not last_delivery or not last_delivery.get("date"):
                continue

            delivery_utc = last_delivery["date"].replace(tzinfo=utc)
            delivery_local = delivery_utc.astimezone(local_tz)

            if start_local <= delivery_local < end_local:
                price = load.get("price", 0)
                total_price += price
                matched_loads.append(load)

                driver_id = load.get("assigned_driver")
                delivery_str = delivery_local.strftime('%Y-%m-%d %H:%M:%S')
                load_summary = {
                    "load_id": load.get("load_id"),
                    "price": price,
                    "delivery_local": delivery_str,
                    "driver_id": str(driver_id) if driver_id else None
                }
                loads_list.append(load_summary)

                if driver_id:
                    key = str(driver_id)
                    driver_groups.setdefault(key, []).append({
                        "load_id": load.get("load_id"),
                        "price": price,
                        "delivery_local": delivery_str
                    })
                else:
                    no_driver_loads.append({
                        "load_id": load.get("load_id"),
                        "price": price,
                        "delivery_local": delivery_str
                    })

                # Обновить флаг
                loads_collection.update_one(
                    {"_id": load["_id"]},
                    {"$set": {"was_added_to_dispatch_statement": True}}
                )

        unique_driver_count = len(driver_groups)

        # === Расчёт зарплаты ===
        dispatcher_salary = 0
        if salary_type == "percent":
            dispatcher_salary = round(total_price * (salary_percent / 100), 2)
        elif salary_type == "fixed_plus_percent":
            dispatcher_salary = round(total_price * (salary_percent / 100) + salary_fixed, 2)
        elif salary_type == "per_driver_plus_percent":
            dispatcher_salary = round(total_price * (salary_percent / 100) + unique_driver_count * salary_per_driver, 2)

        print('Trying to give result')
        return jsonify({
            "success": True,
            "period_start": start_local.strftime('%Y-%m-%d %H:%M:%S'),
            "period_end": (end_local - timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S'),
            "total_price": total_price,
            "matched_loads_count": len(matched_loads),
            "unique_drivers": unique_driver_count,
            "dispatcher_salary": dispatcher_salary,
            "salary_type": salary_type,
            "driver_groups": driver_groups,
            "no_driver": no_driver_loads,
            "loads_list": loads_list
        })

    except Exception as e:
        print("Ошибка расчета зарплаты:", str(e))
        return jsonify({"error": str(e)}), 500
