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
drivers_collection = db["drivers"]
companies_collection = db["companies"]

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

        # Предзагрузка водителей и компаний
        drivers_map = {str(d["_id"]): d.get("name", "") for d in drivers_collection.find({}, {"_id": 1, "name": 1})}
        companies_map = {str(c["_id"]): c.get("name", "") for c in companies_collection.find({}, {"_id": 1, "name": 1})}

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
                matched_loads.append(load)
                total_price += load.get("price", 0)

                driver_id = load.get("assigned_driver")
                driver_id_str = str(driver_id) if driver_id else None
                driver_name = drivers_map.get(driver_id_str, "Нет")

                company_id = str(load.get("company_sign", ""))
                company_name = companies_map.get(company_id, "—")

                pickup_info = load.get("pickup", {})
                pickup_date_utc = pickup_info.get("date")
                pickup_date = pickup_date_utc.replace(tzinfo=utc).astimezone(local_tz).strftime("%m/%d/%Y") if pickup_date_utc else ""
                pickup_address = pickup_info.get("address", "")

                delivery_address = last_delivery.get("address", "")
                delivery_date = delivery_local.strftime("%m/%d/%Y")

                load_data = {
                    "load_id": load.get("load_id"),
                    "company_name": company_name,
                    "RPM": load.get("RPM", ""),
                    "price": load.get("price", 0),
                    "driver_name": driver_name,
                    "pickup_address": pickup_address,
                    "pickup_date": pickup_date,
                    "delivery_address": delivery_address,
                    "delivery_date": delivery_date,
                    "extra_stops": load.get("extra_stops", [])
                }

                loads_list.append(load_data)

                if driver_id:
                    driver_groups.setdefault(driver_name, []).append(load_data)
                else:
                    no_driver_loads.append(load_data)

        unique_driver_count = len(driver_groups)

        # Расчёт зарплаты
        dispatcher_salary = 0
        if salary_type == "percent":
            dispatcher_salary = round(total_price * (salary_percent / 100), 2)
        elif salary_type == "fixed_plus_percent":
            dispatcher_salary = round(total_price * (salary_percent / 100) + salary_fixed, 2)
        elif salary_type == "per_driver_plus_percent":
            dispatcher_salary = round(total_price * (salary_percent / 100) + unique_driver_count * salary_per_driver, 2)

        return jsonify({
            "success": True,
            "period_start": start_local.strftime('%Y-%m-%d %H:%M:%S'),
            "period_end": (end_local - timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S'),
            "total_price": total_price,
            "matched_loads_count": len(matched_loads),
            "unique_drivers": unique_driver_count,
            "dispatcher_salary": dispatcher_salary,
            "salary_percent": salary_percent,  # ← добавь это
            "salary_fixed": salary_fixed,  # ← и это
            "salary_per_driver": salary_per_driver,  # ← и это
            "salary_type": salary_type,
            "driver_groups": driver_groups,
            "no_driver": no_driver_loads,
            "loads_list": loads_list
        })

    except Exception as e:
        print("Ошибка расчета зарплаты:", str(e))
        return jsonify({"error": str(e)}), 500


@dispatch_statements_bp.route("/api/save_dispatcher_statement", methods=["POST"])
@login_required
def save_dispatcher_statement():
    try:
        data = request.get_json()

        dispatcher_id = data.get("dispatcher_id")
        week_range = data.get("week_range")
        total_price = data.get("total_price", 0)
        salary_type = data.get("salary_type")
        salary_percent = data.get("salary_percent", 0)
        salary_fixed = data.get("salary_fixed", 0)
        salary_per_driver = data.get("salary_per_driver", 0)
        dispatcher_salary = float(data.get("dispatcher_salary", 0))
        unique_drivers = int(data.get("unique_drivers", 0))
        selected_load_ids = data.get("selected_load_ids", [])

        if not dispatcher_id or not week_range or not selected_load_ids:
            return jsonify({"error": "Missing required data"}), 400

        # Конвертация диапазона в UTC
        start_str, end_str = [s.strip() for s in week_range.split("-")]
        start_naive = datetime.strptime(start_str, "%m/%d/%Y")
        end_naive = datetime.strptime(end_str, "%m/%d/%Y")

        tz_data = tz_collection.find_one()
        tz_name = tz_data.get("timezone", "America/Chicago")
        local_tz = timezone(tz_name)

        week_start = local_tz.localize(start_naive).astimezone(utc)
        week_end = local_tz.localize(end_naive).astimezone(utc)

        # Получаем грузы по load_id → найдём их _id
        loads_cursor = loads_collection.find({"load_id": {"$in": selected_load_ids}})
        loads = list(loads_cursor)

        load_id_to_object_id = {load["load_id"]: load["_id"] for load in loads}

        drivers_map = {str(d["_id"]): d.get("name", "") for d in drivers_collection.find({}, {"_id": 1, "name": 1})}
        companies_map = {str(c["_id"]): c.get("name", "") for c in companies_collection.find({}, {"_id": 1, "name": 1})}

        loads_by_driver = []
        selected_object_ids = []
        driver_group_map = {}

        for load in loads:
            if load.get("load_id") not in selected_load_ids:
                continue

            selected_object_ids.append(load["_id"])

            driver_id = load.get("assigned_driver")
            driver_id_str = str(driver_id) if driver_id else None
            driver_name = drivers_map.get(driver_id_str, "Нет")

            last_delivery = (load.get("extra_delivery", [])[-1]
                             if load.get("extra_delivery") else load.get("delivery"))
            if not last_delivery:
                continue

            delivery_date = last_delivery.get("date")
            delivery_address = last_delivery.get("address", "")
            delivery_date_str = delivery_date.replace(tzinfo=utc).astimezone(local_tz).strftime("%m/%d/%Y") if delivery_date else ""

            pickup = load.get("pickup", {})
            pickup_date = pickup.get("date")
            pickup_address = pickup.get("address", "")
            pickup_date_str = pickup_date.replace(tzinfo=utc).astimezone(local_tz).strftime("%m/%d/%Y") if pickup_date else ""

            company_id = str(load.get("company_sign", ""))
            company_name = companies_map.get(company_id, "—")

            load_entry = {
                "_id": load["_id"],
                "load_id": load.get("load_id"),
                "company_name": company_name,
                "RPM": load.get("RPM", ""),
                "price": load.get("price", 0),
                "pickup_address": pickup_address,
                "pickup_date": pickup_date_str,
                "delivery_address": delivery_address,
                "delivery_date": delivery_date_str,
                "extra_stops": load.get("extra_stops", [])
            }

            driver_group_map.setdefault(driver_name, []).append(load_entry)

        for driver_name, loads in driver_group_map.items():
            loads_by_driver.append({
                "driver": driver_name,
                "loads": loads
            })

        statement_doc = {
            "dispatcher_id": ObjectId(dispatcher_id),
            "week_start": week_start,
            "week_end": week_end,
            "created_at": datetime.utcnow(),
            "total_price": total_price,
            "salary_type": salary_type,
            "salary_percent": salary_percent,
            "salary_fixed": salary_fixed,
            "salary_per_driver": salary_per_driver,
            "dispatcher_salary": dispatcher_salary,
            "unique_driver_count": unique_drivers,
            "selected_load_ids": selected_object_ids,
            "loads_by_driver": loads_by_driver
        }

        result = db.statement_dispatch.insert_one(statement_doc)
        return jsonify({"success": True, "inserted_id": str(result.inserted_id)})

    except Exception as e:
        print("Ошибка сохранения стейтмента:", str(e))
        return jsonify({"error": str(e)}), 500

@dispatch_statements_bp.route("/api/dispatcher_statements_by_week", methods=["POST"])
def get_dispatcher_statements_by_week():
    try:
        data = request.get_json()
        week_str = data.get("week_start")
        if not week_str:
            return jsonify({"error": "Missing week_start"}), 400

        # Парсим дату и переводим в UTC
        start_naive = datetime.strptime(week_str.strip(), "%m/%d/%Y")
        tz_data = tz_collection.find_one()
        tz_name = tz_data.get("timezone", "America/Chicago")
        local_tz = timezone(tz_name)
        week_start_utc = local_tz.localize(start_naive).astimezone(utc)

        # Загружаем диспетчеров
        dispatchers = users_collection.find({"role": "dispatch"}, {"_id": 1, "real_name": 1})
        dispatcher_map = {str(d["_id"]): d.get("real_name", "—") for d in dispatchers}

        # Ищем стейтменты
        statements = list(db.statement_dispatch.find(
            {"week_start": week_start_utc},
            {"dispatcher_id": 1, "total_price": 1, "dispatcher_salary": 1}
        ))

        # Подставляем имя диспетчера
        for stmt in statements:
            stmt["_id"] = str(stmt["_id"])
            stmt["dispatcher_id"] = str(stmt["dispatcher_id"])
            stmt["dispatcher_name"] = dispatcher_map.get(stmt["dispatcher_id"], "—")

        return jsonify({"success": True, "statements": statements})
    except Exception as e:
        print("Ошибка получения стейтментов:", str(e))
        return jsonify({"error": str(e)}), 500


@dispatch_statements_bp.route("/fragment/statement_dispatchers/details/<statement_id>")
def statement_dispatch_details_fragment(statement_id):
    try:
        statement = db.statement_dispatch.find_one({"_id": ObjectId(statement_id)})
        if not statement:
            return "Стейтмент не найден", 404

        dispatcher = db.users.find_one({"_id": statement["dispatcher_id"]}, {"real_name": 1})
        dispatcher_name = dispatcher.get("real_name", "—") if dispatcher else "—"

        return render_template("fragments/statement_dispatchers_details_fragment.html",
                               statement=statement,
                               dispatcher_name=dispatcher_name)
    except Exception as e:
        return f"Ошибка: {str(e)}", 500