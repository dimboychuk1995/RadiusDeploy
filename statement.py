from datetime import datetime, timedelta

from bson import ObjectId
from flask import Blueprint, render_template, request, jsonify
from tools.db import db
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from bson.objectid import ObjectId


statement_bp = Blueprint('statement', __name__)

drivers_collection = db['drivers']
trucks_collection = db['trucks']
loads_collection = db['loads']
fuel_cards_collection = db['fuel_cards']
statement_collection = db['statement']
fuel_cards_transactions_collection = db['fuel_cards_transactions']


@statement_bp.route("/fragment/statement_fragment")
def statement_fragment():
    try:
        drivers = list(db.drivers.find({}, {"_id": 1, "name": 1}))
        for driver in drivers:
            driver["id"] = str(driver["_id"])
        return render_template("fragments/statement_fragment.html", drivers=drivers)
    except Exception as e:
        return f"Ошибка: {str(e)}", 500


@statement_bp.route("/api/driver_statement_loads", methods=["GET"])
def get_driver_statement_loads():
    try:
        driver_id = request.args.get("driver_id")
        week_range = request.args.get("week_range")

        if not driver_id or not week_range:
            return jsonify({"error": "Missing driver_id or week_range"}), 400

        start_str, end_str = [s.strip() for s in week_range.split("-")]
        start_date = datetime.strptime(start_str, "%m/%d/%Y")
        end_date = datetime.strptime(end_str, "%m/%d/%Y") + timedelta(days=1)

        query = {
            "assigned_driver": ObjectId(driver_id),
            "was_added_to_statement": False,
            "$or": [
                {"delivery.date": {"$gte": start_date, "$lt": end_date}},
                {"extra_delivery.date": {"$gte": start_date, "$lt": end_date}}
            ]
        }

        loads = list(loads_collection.find(query))
     

        # Печатаем даты delivery и extra_delivery найденных грузов
        for i, load in enumerate(loads[:10]):  # максимум 10 для отладки
            d = load.get("delivery", {}).get("date")
            ed = load.get("extra_delivery", {}).get("date")


        def serialize_load(load):
            def str_oid(val):
                return str(val) if isinstance(val, ObjectId) else val

            return {
                "_id": str(load["_id"]),
                "load_id": load.get("load_id", ""),
                "company_sign": str_oid(load.get("company_sign")),
                "assigned_driver": str_oid(load.get("assigned_driver")),
                "assigned_dispatch": str_oid(load.get("assigned_dispatch")),
                "assigned_power_unit": str_oid(load.get("assigned_power_unit")),
                "price": round(load.get("price", 0), 2),
                "RPM": load.get("RPM", 0),
                "pickup": load.get("pickup", {}),
                "delivery": load.get("delivery", {}),
                "extra_delivery": load.get("extra_delivery", {}),
                "extra_stops": load.get("extra_stops", 0),
                "pickup_date": load.get("pickup", {}).get("date"),
                "delivery_date": (
                    (load.get("extra_delivery") or {}).get("date")
                    or (load.get("delivery") or {}).get("date")
                )
            }

        serialized = [serialize_load(l) for l in loads]
        return jsonify({"success": True, "loads": serialized})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})






@statement_bp.route("/api/driver_fuel_summary", methods=["GET"])
def get_driver_fuel_summary():
    try:
        driver_id = request.args.get("driver_id")
        week_range = request.args.get("week_range")

        if not driver_id or not week_range:
            return jsonify({"error": "Missing driver_id or week_range"}), 400

        start_str, end_str = [s.strip() for s in week_range.split("-")]
        start_date = datetime.strptime(start_str, "%m/%d/%Y")
        end_date = datetime.strptime(end_str, "%m/%d/%Y") + timedelta(days=1)


        fuel_cards = list(fuel_cards_collection.find({
            "assigned_driver": ObjectId(driver_id)
        }))

        card_numbers = [c.get("card_number") for c in fuel_cards if c.get("card_number")]

        if not card_numbers:
            print("No cards found.")
            return jsonify({
                "success": True,
                "fuel": {
                    "qty": 0.0,
                    "retail": 0.0,
                    "invoice": 0.0,
                    "cards": []
                }
            })

        query = {
            "card_number": {"$in": card_numbers},
            "date": {"$gte": start_date, "$lt": end_date}
        }

        transactions = list(fuel_cards_transactions_collection.find(query))
        for i, tx in enumerate(transactions[:10]):
            print(f"  Tx {i+1}: card {tx.get('card_number')} → date {tx.get('date')} | qty={tx.get('qty')}, retail={tx.get('retail_price')}, invoice={tx.get('invoice_total')}")

        fuel = {
            "qty": 0.0,
            "retail": 0.0,
            "invoice": 0.0,
            "cards": card_numbers
        }

        for tx in transactions:
            fuel["qty"] += tx.get("qty", 0)
            fuel["retail"] += tx.get("retail_price", 0)
            fuel["invoice"] += tx.get("invoice_total", 0)

        fuel["qty"] = round(fuel["qty"], 2)
        fuel["retail"] = round(fuel["retail"], 2)
        fuel["invoice"] = round(fuel["invoice"], 2)


        return jsonify({"success": True, "fuel": fuel})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})



@statement_bp.route("/api/driver_commission_scheme", methods=["GET"])
def get_driver_commission_scheme():
    try:
        driver_id = request.args.get("driver_id")
        week_range = request.args.get("week_range")

        if not driver_id or not week_range:
            return jsonify({"success": False, "error": "Missing driver_id or week_range"}), 400

        start_str, end_str = [s.strip() for s in week_range.split("-")]
        start_date = datetime.strptime(start_str, "%m/%d/%Y")
        end_date = datetime.strptime(end_str, "%m/%d/%Y")

        driver = drivers_collection.find_one({"_id": ObjectId(driver_id)})
        if not driver:
            return jsonify({"success": False, "error": "Driver not found"}), 404

        # Зарплатная схема
        scheme_info = driver.get("net_commission_table") or {}
        scheme_type = scheme_info.get("type", "percent")
        commission_table = driver.get("commission_table", [])

        # Списания
        additional_charges = driver.get("additional_charges", []) or []
        deductions = []

        for charge in additional_charges:
            period = charge.get("period")
            amount = charge.get("amount", 0)
            day_of_month = charge.get("day_of_month")
            charge_type = charge.get("type", "Unknown")

            if period == "statement":
                deductions.append({
                    "type": charge_type,
                    "amount": amount
                })

            elif period == "monthly" and isinstance(day_of_month, int):
                for day in range((end_date - start_date).days + 1):
                    current = start_date + timedelta(days=day)
                    if current.day == day_of_month:
                        deductions.append({
                            "type": charge_type,
                            "amount": amount
                        })
                        break

        # Бонус за инспекцию (может отсутствовать)
        enable_bonus = bool(driver.get("enable_inspection_bonus", False))
        bonus_level_1 = float(driver.get("bonus_level_1", 0))
        bonus_level_2 = float(driver.get("bonus_level_2", 0))
        bonus_level_3 = float(driver.get("bonus_level_3", 0))

        return jsonify({
            "success": True,
            "scheme_type": scheme_type,
            "commission_table": commission_table,
            "deductions": deductions,
            "enable_inspection_bonus": enable_bonus,
            "bonus_level_1": bonus_level_1,
            "bonus_level_2": bonus_level_2,
            "bonus_level_3": bonus_level_3   
        })

    except Exception as e:
        import traceback
        print("Exception in /api/driver_commission_scheme:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})


@statement_bp.route("/api/driver_inspections_by_range", methods=["GET"])
def get_driver_inspections_by_range():
    try:
        driver_id = request.args.get("driver_id")   # MM/DD/YYYY
        start_str = request.args.get("start_date")
        end_str   = request.args.get("end_date")

        if not driver_id or not start_str or not end_str:
            return jsonify({"success": False, "error": "Missing parameters"}), 400

        # Таймзона из БД (или дефолт)
        tz_doc  = db["company_timezone"].find_one({}) or {}
        tz_name = tz_doc.get("timezone") or "America/Chicago"
        local_tz = ZoneInfo(tz_name)
        utc_tz   = timezone.utc

        # Локальные границы включительно по дням: [start_local 00:00, end_local + 1д 00:00)
        start_local_date = datetime.strptime(start_str, "%m/%d/%Y")
        end_local_date   = datetime.strptime(end_str, "%m/%d/%Y")
        start_local = start_local_date.replace(tzinfo=local_tz)
        end_local_exclusive = (end_local_date + timedelta(days=1)).replace(tzinfo=local_tz)

        # В UTC для Mongo (и наивные UTC-границы для сравнения с наивными датами в БД)
        start_utc = start_local.astimezone(utc_tz)
        end_utc_exclusive = end_local_exclusive.astimezone(utc_tz)
        start_bound_naive = start_utc.replace(tzinfo=None)
        end_bound_naive   = end_utc_exclusive.replace(tzinfo=None)

        print("\n=== [Driver Inspections Debug / TZ-Aware] ===")
        print(f"driver_id: {driver_id}")
        print(f"company timezone: {tz_name}")
        print("-- Local range --")
        print(f"  start_local (inclusive): {start_local.isoformat()}")
        print(f"  end_local   (exclusive): {end_local_exclusive.isoformat()}")
        print("-- UTC range (aware) --")
        print(f"  start_utc   (inclusive): {start_utc.isoformat()}")
        print(f"  end_utc     (exclusive): {end_utc_exclusive.isoformat()}")
        print("-- UTC range used in Mongo (naive) --")
        print(f"  start_bound_naive: {start_bound_naive!r}")
        print(f"  end_bound_naive:   {end_bound_naive!r}")

        query = {
            "driver": ObjectId(driver_id),
            "created_at": {"$gte": start_bound_naive, "$lt": end_bound_naive}
        }
        print("Mongo query (UTC naive):", query)

        inspections_raw = list(
            db["inspections"]
            .find(query)
            .sort("created_at", 1)
        )
        print(f"Fetched by UTC bounds (raw count): {len(inspections_raw)}")

        # Хелперы
        def to_local(dt):
            if not dt:
                return None
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=utc_tz)  # трактуем наивное как UTC
            return dt.astimezone(local_tz)

        def to_utc_aware(dt):
            if not dt:
                return None
            return dt if dt.tzinfo else dt.replace(tzinfo=utc_tz)

        # Подробные принты по каждой записи: "DB time" и приведённые времена
        inspections_out = []
        print("---- Per-row debug (DB -> UTC aware -> UTC naive -> LOCAL) ----")
        for insp in inspections_raw:
            _id = insp.get("_id")
            cat_db = insp.get("created_at")                         # как пришло из БД (обычно наивное UTC)
            cat_type = type(cat_db).__name__
            cat_utc_aw = to_utc_aware(cat_db)                       # UTC-aware
            cat_utc_naive = cat_utc_aw.replace(tzinfo=None) if cat_utc_aw else None
            cat_local = to_local(cat_db)                            # локальное

            # Сопоставления по двум интервалам (UTC и LOCAL) для явной диагностики
            match_utc_naive  = bool(cat_utc_naive and (start_bound_naive <= cat_utc_naive < end_bound_naive))
            match_local_half = bool(cat_local and (start_local <= cat_local < end_local_exclusive))

            print(
                f"  • _id={_id} | "
                f"created_at_DB={cat_db!r} (type={cat_type}) | "
                f"created_at_utc_aw={cat_utc_aw.isoformat() if cat_utc_aw else '—'} | "
                f"created_at_utc_naive={cat_utc_naive!r} | "
                f"created_at_local={cat_local.isoformat() if cat_local else '—'} | "
                f"IN_UTC={match_utc_naive} | IN_LOCAL={match_local_half}"
            )

            # Возвращаем по факту попадания в UTC-диапазон (это и есть корректный поиск)
            # Дополнительно можно требовать и LOCAL, если нужно строго по локальным суткам
            if match_utc_naive:
                insp["_created_at_local"] = cat_local
                insp["_created_at_utc_aw"] = cat_utc_aw
                insp["_created_at_utc_naive"] = cat_utc_naive
                inspections_out.append(insp)

        print(f"Result after UTC range check (count): {len(inspections_out)}")
        if inspections_out:
            print("IDs:", [str(i["_id"]) for i in inspections_out])
        print("=== End Debug ===\n")

        # Ответ (created_at отдаём в локальном времени)
        result = []
        for i in inspections_out:
            created_at_local = i.get("_created_at_local") or to_local(i.get("created_at"))
            date_field = i.get("date", "")
            if isinstance(date_field, datetime):
                date_field = date_field.strftime("%m/%d/%Y")

            result.append({
                "_id": str(i["_id"]),
                "date": date_field,
                "start_time": i.get("start_time", ""),
                "end_time": i.get("end_time", ""),
                "state": i.get("state", ""),
                "address": i.get("address", ""),
                "clean_inspection": i.get("clean_inspection", False),
                "created_at": created_at_local.strftime("%m/%d/%Y %H:%M:%S") if created_at_local else None
            })

        return jsonify({"success": True, "inspections": result, "count": len(result)})

    except Exception as e:
        import traceback
        print("Exception in /api/driver_inspections_by_range (TZ-Aware):")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})

    try:
        driver_id = request.args.get("driver_id")   # MM/DD/YYYY
        start_str = request.args.get("start_date")
        end_str   = request.args.get("end_date")

        if not driver_id or not start_str or not end_str:
            return jsonify({"success": False, "error": "Missing parameters"}), 400

        # Таймзона из БД (или дефолт)
        tz_doc  = db["company_timezone"].find_one({}) or {}
        tz_name = tz_doc.get("timezone") or "America/Chicago"
        local_tz = ZoneInfo(tz_name)
        utc_tz   = timezone.utc

        # Локальные границы: [start_local 00:00, end_local + 1д 00:00)
        start_local_date = datetime.strptime(start_str, "%m/%d/%Y")
        end_local_date   = datetime.strptime(end_str, "%m/%d/%Y")
        start_local = start_local_date.replace(tzinfo=local_tz)
        end_local_exclusive = (end_local_date + timedelta(days=1)).replace(tzinfo=local_tz)

        # В UTC для Mongo (и делаем наивные UTC-границы, если в БД наивные UTC)
        start_utc = start_local.astimezone(utc_tz)
        end_utc_exclusive = end_local_exclusive.astimezone(utc_tz)
        start_bound = start_utc.replace(tzinfo=None)
        end_bound   = end_utc_exclusive.replace(tzinfo=None)

        print("\n=== [Driver Inspections Debug / TZ-Aware] ===")
        print(f"driver_id: {driver_id}")
        print(f"company timezone: {tz_name}")
        print("-- Local range --")
        print(f"  start_local (inclusive): {start_local.isoformat()}")
        print(f"  end_local   (exclusive): {end_local_exclusive.isoformat()}")
        print("-- UTC range (used in Mongo) --")
        print(f"  start_utc   (inclusive): {start_utc.isoformat()}")
        print(f"  end_utc     (exclusive): {end_utc_exclusive.isoformat()}")
        print("Mongo query (UTC naive):",
              {"driver": ObjectId(driver_id), "created_at": {"$gte": start_bound, "$lt": end_bound}})

        inspections = list(
            db["inspections"]
            .find({
                "driver": ObjectId(driver_id),
                "created_at": {"$gte": start_bound, "$lt": end_bound}
            })
            .sort("created_at", 1)
        )

        # Для ответа показываем created_at в локальном времени
        def to_local(dt):
            if not dt:
                return None
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=utc_tz)  # трактуем наивное как UTC
            return dt.astimezone(local_tz)

        print(f"Fetched {len(inspections)} rows by UTC bounds.")
        ids = [str(i["_id"]) for i in inspections]
        print("IDs:", ids)

        result = []
        for i in inspections:
            created_at_local = to_local(i.get("created_at"))
            date_field = i.get("date", "")
            if isinstance(date_field, datetime):
                date_field = date_field.strftime("%m/%d/%Y")

            result.append({
                "_id": str(i["_id"]),
                "date": date_field,
                "start_time": i.get("start_time", ""),
                "end_time": i.get("end_time", ""),
                "state": i.get("state", ""),
                "address": i.get("address", ""),
                "clean_inspection": i.get("clean_inspection", False),
                "created_at": created_at_local.strftime("%m/%d/%Y %H:%M:%S") if created_at_local else None
            })

        print("=== End Debug ===\n")

        return jsonify({"success": True, "inspections": result, "count": len(result)})

    except Exception as e:
        import traceback
        print("Exception in /api/driver_inspections_by_range (TZ-Aware):")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})