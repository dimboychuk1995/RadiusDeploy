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

        # Извлекаем таймзону
        tz_data = tz_collection.find_one()
        tz_name = tz_data.get("timezone", "America/Chicago")
        local_tz = timezone(tz_name)

        # Парсим диапазон недели
        start_str, end_str = [s.strip() for s in week_range.split("-")]
        start_local_naive = datetime.strptime(start_str, "%m/%d/%Y")
        end_local_naive = datetime.strptime(end_str, "%m/%d/%Y") + timedelta(days=1)

        # Локализуем в текущую таймзону
        start_local = local_tz.localize(start_local_naive)
        end_local = local_tz.localize(end_local_naive)

        # Вывод для отладки
        print("=== Диапазон от клиента ===")
        print(f"Начало (строка): {start_str}")
        print(f"Конец (строка): {end_str}")
        print(f"Локальный диапазон: {start_local.strftime('%Y-%m-%d %H:%M:%S')} - {(end_local - timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')}")

        # Поиск грузов этого диспетчера
        loads = list(loads_collection.find({
            "assigned_dispatch": ObjectId(dispatcher_id),
            "$or": [
                {"extra_delivery": {"$ne": None}},
                {"delivery": {"$ne": None}}
            ]
        }))

        matched_loads = []
        total_price = 0

        for load in loads:
            # Получаем дату последней доставки
            if load.get("extra_delivery"):
                last_delivery = load["extra_delivery"][-1]
            else:
                last_delivery = load.get("delivery")

            if not last_delivery:
                continue

            delivery_date_raw = last_delivery.get("date")
            if not delivery_date_raw:
                continue

            # Приводим дату к UTC, затем в локальную
            delivery_utc = delivery_date_raw.replace(tzinfo=utc)
            delivery_local = delivery_utc.astimezone(local_tz)

            # Сравнение в локальной зоне
            if start_local <= delivery_local < end_local:
                matched_loads.append(load)
                total_price += load.get("price", 0)

                print("=== Груз ===")
                print(f"Load ID: {load.get('load_id')}")
                print(f"Цена: {load.get('price')}")
                print(f"Дата доставки (UTC): {delivery_utc}")
                print(f"Дата доставки (локальная): {delivery_local.strftime('%Y-%m-%d %H:%M:%S')}")

        print("=== ИТОГО ===")
        print(f"Найдено грузов: {len(matched_loads)}")
        print(f"Сумма по грузам: ${total_price}")
        print(f"Диапазон: {start_local.strftime('%m/%d/%Y')} - {(end_local - timedelta(days=1)).strftime('%m/%d/%Y')}")

        return jsonify({"success": True, "matched_loads": len(matched_loads), "total_price": total_price})

    except Exception as e:
        print("Ошибка расчета зарплаты:", str(e))
        return jsonify({"error": str(e)}), 500
