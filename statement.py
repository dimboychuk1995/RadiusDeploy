from datetime import datetime, timedelta

from bson import ObjectId
from flask import Blueprint, render_template, request, jsonify
from tools.db import db
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from bson.objectid import ObjectId
from flask_login import login_required
import hashlib
from flask_login import login_required, current_user

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

        # Парсим диапазон дат (MM/DD/YYYY - MM/DD/YYYY)
        try:
            start_str, end_str = [s.strip() for s in week_range.split("-")]
        except Exception:
            return jsonify({"error": "Invalid week_range format"}), 400

        # Таймзона компании (или дефолт)
        tz_doc  = db["company_timezone"].find_one({}) or {}
        tz_name = tz_doc.get("timezone") or "America/Chicago"
        local_tz = ZoneInfo(tz_name)
        utc_tz   = timezone.utc

        # Локальные границы по дням
        extra_days = 1
        start_local_date = datetime.strptime(start_str, "%m/%d/%Y")
        end_local_date   = datetime.strptime(end_str,   "%m/%d/%Y")

        start_local = start_local_date.replace(tzinfo=local_tz)
        base_end_local_exclusive = (end_local_date + timedelta(days=1)).replace(tzinfo=local_tz)  # конец диапазона без extra
        end_local_exclusive = (end_local_date + timedelta(days=1 + extra_days)).replace(tzinfo=local_tz)  # с extra

        # UTC aware → naive for Mongo
        start_bound_naive = start_local.astimezone(utc_tz).replace(tzinfo=None)
        base_end_bound_naive = base_end_local_exclusive.astimezone(utc_tz).replace(tzinfo=None)
        end_bound_naive   = end_local_exclusive.astimezone(utc_tz).replace(tzinfo=None)

        print("\n=== [Driver Statement Loads Debug / TZ-Aware] ===")
        print(f"driver_id: {driver_id}")
        print(f"company timezone: {tz_name}")
        print(f"extra_days added to right boundary: {extra_days}")
        print("-- Local range --")
        print(f"  start_local: {start_local.isoformat()}")
        print(f"  base_end_local: {base_end_local_exclusive.isoformat()}")
        print(f"  end_local+extra: {end_local_exclusive.isoformat()}")
        print("-- UTC naive range for Mongo --")
        print(f"  start_bound_naive: {start_bound_naive!r}")
        print(f"  base_end_bound_naive: {base_end_bound_naive!r}")
        print(f"  end_bound_naive: {end_bound_naive!r}")

        # --- Aggregation ---
        pipeline = [
            {"$match": {
                "assigned_driver": ObjectId(driver_id),
                "was_added_to_statement": False
            }},
            # нормализуем extra_delivery в массив
            {"$addFields": {
                "extra_arr": {
                    "$cond": [
                        {"$isArray": "$extra_delivery"},
                        "$extra_delivery",
                        {
                            "$cond": [
                                {"$and": [
                                    {"$ne": ["$extra_delivery", None]},
                                    {"$eq": [ {"$type": "$extra_delivery"}, "object" ]}
                                ]},
                                ["$extra_delivery"],
                                []
                            ]
                        }
                    ]
                }
            }},
            # выбираем дату для фильтрации
            {"$addFields": {
                "effective_date": {
                    "$cond": [
                        {"$gt": [ {"$size": "$extra_arr"}, 0 ]},
                        {"$let": {
                            "vars": {"last": {"$arrayElemAt": ["$extra_arr", -1]}},
                            "in": "$$last.date"
                        }},
                        "$delivery.date"
                    ]
                }
            }},
            # фильтр по диапазону + extra день
            {"$match": {
                "effective_date": {"$gte": start_bound_naive, "$lt": end_bound_naive}
            }},
            {"$sort": {"effective_date": 1}}
        ]

        cursor = loads_collection.aggregate(pipeline)
        loads = list(cursor)
        print(f"Fetched loads (count): {len(loads)}")

        def str_oid(val):
            return str(val) if isinstance(val, ObjectId) else val

        serialized = []
        for load in loads:
            eff_date = load.get("effective_date")
            out_of_diap = False
            if eff_date and isinstance(eff_date, datetime):
                naive_eff = eff_date if eff_date.tzinfo is None else eff_date.astimezone(utc_tz).replace(tzinfo=None)
                if not (start_bound_naive <= naive_eff < base_end_bound_naive):
                    out_of_diap = True

            serialized.append({
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
                "pickup_date": (load.get("pickup") or {}).get("date") if isinstance(load.get("pickup"), dict) else None,
                "delivery_date": eff_date or (load.get("delivery") or {}).get("date"),
                "out_of_diap": out_of_diap
            })

        return jsonify({"success": True, "loads": serialized, "count": len(serialized)})

    except Exception as e:
        import traceback
        print("Exception in /api/driver_statement_loads (TZ-Aware):")
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
        end_date   = datetime.strptime(end_str,   "%m/%d/%Y")

        driver = drivers_collection.find_one({"_id": ObjectId(driver_id)})
        if not driver:
            return jsonify({"success": False, "error": "Driver not found"}), 404

        # 1) тип схемы: сначала пробуем явное поле driver.scheme_type (per_mile/percent/…),
        #    затем из net_commission_table.type, иначе "percent" по умолчанию
        raw_net = (driver.get("net_commission_table") or {})
        scheme_type = (driver.get("scheme_type")
                       or raw_net.get("type")
                       or "percent")

        # 2) таблица комиссий (для percent)
        commission_table = driver.get("commission_table", []) or []

        # 3) per-mile ставка (для per_mile)
        per_mile_rate = float(driver.get("per_mile_rate", 0) or 0)

        # 4) постоянные удержания (additional_charges) — как было
        additional_charges = driver.get("additional_charges", []) or []
        deductions = []
        for charge in additional_charges:
            period = charge.get("period")
            amount = charge.get("amount", 0)
            day_of_month = charge.get("day_of_month")
            charge_type = charge.get("type", "Unknown")

            if period == "statement":
                deductions.append({"type": charge_type, "amount": amount})

            elif period == "monthly" and isinstance(day_of_month, int):
                for day in range((end_date - start_date).days + 1):
                    current = start_date + timedelta(days=day)
                    if current.day == day_of_month:
                        deductions.append({"type": charge_type, "amount": amount})
                        break

        # 5) бонусы за инспекции — как было
        enable_bonus  = bool(driver.get("enable_inspection_bonus", False))
        bonus_level_1 = float(driver.get("bonus_level_1", 0) or 0)
        bonus_level_2 = float(driver.get("bonus_level_2", 0) or 0)
        bonus_level_3 = float(driver.get("bonus_level_3", 0) or 0)

        return jsonify({
            "success": True,
            "scheme_type": scheme_type,           # <-- теперь приходит 'per_mile' когда нужно
            "commission_table": commission_table,
            "per_mile_rate": per_mile_rate,       # <-- добавили
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
    

@statement_bp.route("/api/driver_expenses_by_range", methods=["GET"])
def get_driver_expenses_by_range():
    try:
        driver_id = request.args.get("driver_id")
        start_str = request.args.get("start_date")   # MM/DD/YYYY
        end_str   = request.args.get("end_date")     # MM/DD/YYYY

        if not driver_id or not start_str or not end_str:
            return jsonify({"success": False, "error": "Missing parameters"}), 400

        # Таймзона компании (или дефолт)
        tz_doc  = db["company_timezone"].find_one({}) or {}
        tz_name = tz_doc.get("timezone") or "America/Chicago"
        local_tz = ZoneInfo(tz_name)
        utc_tz   = timezone.utc

        # Локальные границы: [start_local 00:00, end_local+1д 00:00)
        start_local_date = datetime.strptime(start_str, "%m/%d/%Y")
        end_local_date   = datetime.strptime(end_str, "%m/%d/%Y")
        start_local = start_local_date.replace(tzinfo=local_tz)
        end_local_exclusive = (end_local_date + timedelta(days=1)).replace(tzinfo=local_tz)

        # В UTC (aware) -> наивные UTC-границы для Mongo
        start_utc_aw = start_local.astimezone(utc_tz)
        end_utc_aw_exclusive = end_local_exclusive.astimezone(utc_tz)
        start_bound_naive = start_utc_aw.replace(tzinfo=None)
        end_bound_naive   = end_utc_aw_exclusive.replace(tzinfo=None)

        try:
            driver_oid = ObjectId(driver_id)
        except Exception:
            return jsonify({"success": False, "error": "Invalid driver_id"}), 400

        # ВАЖНО: выборка только по водителю (drivers._id).
        # Поддерживаем разные схемы поля ссылки: driver_id ИЛИ driver (обе — id водителя).
        query = {
            "$and": [
                {"created_at": {"$gte": start_bound_naive, "$lt": end_bound_naive}},
                {"$or": [
                    {"driver_id": driver_oid},
                    {"driver": driver_oid}
                ]}
            ]
        }

        expenses_raw = list(
            db["driver_expenses"]
            .find(query)
            .sort("created_at", 1)
        )

        # TZ helpers
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

        # Фильтрация по границам (диагностика + приведение времени)
        expenses_out = []
        for exp in expenses_raw:
            cat_db = exp.get("created_at")
            cat_utc_aw = to_utc_aware(cat_db)
            cat_utc_naive = cat_utc_aw.replace(tzinfo=None) if cat_utc_aw else None
            if cat_utc_naive and (start_bound_naive <= cat_utc_naive < end_bound_naive):
                exp["_created_at_local"] = to_local(cat_db)
                expenses_out.append(exp)

        # Ответ
        result = []
        for e in expenses_out:
            created_at_local = e.get("_created_at_local") or to_local(e.get("created_at"))
            date_field = e.get("date", "")
            if isinstance(date_field, datetime):
                date_field = date_field.strftime("%m/%d/%Y")

            result.append({
                "_id": str(e["_id"]),
                "amount": e.get("amount", 0),
                "category": e.get("category", ""),
                "note": e.get("note", ""),
                "date": date_field if isinstance(date_field, str) else (date_field.strftime("%m/%d/%Y") if date_field else ""),
                "created_at": created_at_local.strftime("%m/%d/%Y %H:%M:%S") if created_at_local else None,
                "photo_id": str(e["photo_id"]) if e.get("photo_id") else None,
                # поля для стейтмента:
                "action": (e.get("action") or "keep"),
                "removed": bool(e.get("removed", False))
            })

        return jsonify({"success": True, "expenses": result, "count": len(result)})

    except Exception as e:
        import traceback
        print("Exception in /api/driver_expenses_by_range (TZ-Aware):")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})






#Driver list for statement for all drivers 
@statement_bp.route("/api/drivers/list_for_statements", methods=["GET"])
@login_required
def list_drivers_for_statements():
    """
    Возвращает список водителей для массового расчёта стейтментов.
    Группировка/сортировка идёт по hiring_company.
    Дополнительно резолвим:
      - truck_number (из trucks.unit_number)
      - dispatcher_name (из users.name / username)
    """
    try:
        status = request.args.get("status", "").strip()
        query = {}

        if status and status.lower() != "all":
            query["status"] = status
        elif not status or status.lower() != "all":
            query["status"] = {"$in": ["Active", "ACTIVE", "active"]}

        projection = {
            "name": 1,
            "status": 1,
            "contact_number": 1,
            "truck": 1,
            "dispatcher": 1,
            "hiring_company": 1
        }

        drivers_cur = db["drivers"].find(query, projection)
        drivers = list(drivers_cur)

        # Соберём справочники
        truck_ids = [d["truck"] for d in drivers if isinstance(d.get("truck"), ObjectId)]
        dispatcher_ids = [d["dispatcher"] for d in drivers if isinstance(d.get("dispatcher"), ObjectId)]
        hiring_company_ids = [d["hiring_company"] for d in drivers if isinstance(d.get("hiring_company"), ObjectId)]

        trucks_map = {}
        if truck_ids:
            for t in db["trucks"].find({"_id": {"$in": truck_ids}}, {"unit_number": 1, "make": 1, "model": 1, "year": 1}):
                trucks_map[t["_id"]] = {
                    "unit_number": t.get("unit_number") or "",
                    "make": t.get("make") or "",
                    "model": t.get("model") or "",
                    "year": t.get("year") or ""
                }

        users_map = {}
        if dispatcher_ids:
            for u in db["users"].find({"_id": {"$in": dispatcher_ids}}, {"name": 1, "username": 1, "role": 1}):
                users_map[u["_id"]] = u.get("name") or u.get("username") or ""

        companies_map = {}
        if hiring_company_ids:
            for c in db["companies"].find({"_id": {"$in": hiring_company_ids}}, {"name": 1}):
                companies_map[c["_id"]] = c.get("name", "—")

        def str_oid(v):
            return str(v) if isinstance(v, ObjectId) else (str(v) if v and type(v).__name__ == "ObjectId" else (str(v) if isinstance(v, str) else None))

        result = []
        for d in drivers:
            truck_info = trucks_map.get(d.get("truck")) if isinstance(d.get("truck"), ObjectId) else None
            dispatcher_name = users_map.get(d.get("dispatcher")) if isinstance(d.get("dispatcher"), ObjectId) else ""

            hiring_company_id = d.get("hiring_company")
            hiring_company_name = companies_map.get(hiring_company_id, "—") if isinstance(hiring_company_id, ObjectId) else "—"

            result.append({
                "id": str(d["_id"]),
                "name": d.get("name", "—"),
                "status": d.get("status") or "",
                "phone": d.get("contact_number") or "",
                "hiring_company_id": str_oid(hiring_company_id),
                "hiring_company_name": hiring_company_name,

                "truck_id": str_oid(d.get("truck")),
                "truck_number": (truck_info or {}).get("unit_number", "") if truck_info else "",
                "truck_make": (truck_info or {}).get("make", "") if truck_info else "",
                "truck_model": (truck_info or {}).get("model", "") if truck_info else "",
                "truck_year": (truck_info or {}).get("year", "") if truck_info else "",

                "dispatcher_id": str_oid(d.get("dispatcher")),
                "dispatcher_name": dispatcher_name or "",
            })

        # Сортировка по hiring_company_name, затем по name
        result.sort(key=lambda x: ((x.get("hiring_company_name") or "").lower(), (x.get("name") or "").lower()))

        return jsonify({"success": True, "count": len(result), "drivers": result})

    except Exception as e:
        import traceback
        print("Exception in /api/drivers/list_for_statements:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
    


@statement_bp.route("/api/statements/bulk_save", methods=["POST"])
@login_required
def bulk_save_statements():
    """
    Массовое сохранение стейтментов за неделю для списка водителей.

    Body(JSON):
      - week_range: "MM/DD/YYYY - MM/DD/YYYY" (локальные даты компании; конец — инклюзивно)
      - items: [
          {
            driver_id, week_range?, loads[], fuel, scheme, inspections[], expenses[],
            mileage: { miles, meters, source, truck_id, samsara_vehicle_id },
            calc? (не обязателен, сервер пересчитает)
          }, ...
        ]

    Логика расчёта:
      loads_gross = sum(load.price)
      gross_add / gross_deduct / salary_add / salary_deduct — из expenses по action (только не removed)
      gross_for_commission = loads_gross + gross_add - gross_deduct

      commission:
        - percent: по таблице процентов
        - per_mile: commission = (mileage.miles) * (scheme.per_mile_rate)

      final_salary = commission - scheme_deductions_total - salary_deduct + salary_add
    """
    from flask import request, jsonify
    from bson import ObjectId
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo
    import hashlib

    statement_collection = db["statements"]

    try:
        payload = request.get_json(silent=True) or {}
        week_range = (payload.get("week_range") or "").strip()
        items = payload.get("items") or []

        # --- таймзона компании ---
        tz_doc  = db["company_timezone"].find_one({}) or {}
        tz_name = tz_doc.get("timezone") or "America/Chicago"
        local_tz = ZoneInfo(tz_name)
        utc_tz   = timezone.utc

        # --- парсим week_range → (UTC-границы) ---
        def parse_week_range_to_bounds(wr: str):
            # "MM/DD/YYYY - MM/DD/YYYY" → [start@00:00 local .. end@23:59:59 local] => [start_utc .. (end+1d)@00:00 utc)
            s, e = [x.strip() for x in wr.split("-")]
            start_local_date = datetime.strptime(s, "%m/%d/%Y")
            end_local_date   = datetime.strptime(e, "%m/%d/%Y")
            start_local = start_local_date.replace(tzinfo=local_tz)
            end_local_excl = (end_local_date + timedelta(days=1)).replace(tzinfo=local_tz)
            start_utc = start_local.astimezone(utc_tz).replace(tzinfo=None)
            end_utc   = end_local_excl.astimezone(utc_tz).replace(tzinfo=None)
            return start_utc, end_utc

        # утилиты
        def to_local_date_only(val):
            if not val:
                return None
            if isinstance(val, datetime):
                dt = val
            else:
                try:
                    dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
                except Exception:
                    return None
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=utc_tz)
            return dt.astimezone(local_tz).date()

        def to_objectid(val):
            try:
                return ObjectId(val) if val else None
            except Exception:
                return None

        def to_float(val, default=0.0):
            try:
                return float(val)
            except Exception:
                return float(default)

        # created_by
        try:
            created_by_oid = current_user.id if isinstance(current_user.id, ObjectId) else ObjectId(str(current_user.id))
        except Exception:
            created_by_oid = None

        # допустимые действия по инвойсам
        ALLOWED_EXPENSE_ACTIONS = {"keep", "deduct_salary", "add_salary", "deduct_gross", "add_gross"}

        added = replaced = ignored = 0

        for it in items:
            wr = it.get("week_range") or week_range
            try:
                week_start_utc, week_end_utc = parse_week_range_to_bounds(wr)
            except Exception:
                # кривой диапазон — пропускаем элемент
                continue

            driver_oid = to_objectid(it.get("driver_id"))
            if not driver_oid:
                continue

            loads        = it.get("loads") or []
            inspections  = it.get("inspections") or []
            expenses_in  = it.get("expenses") or []
            scheme       = it.get("scheme") or {}
            mileage_in   = it.get("mileage") or {}  # 👈 добавлено

            # --- monday_loads (подсчёт грузов с доставкой в понедельник по локальным суткам) ---
            monday_loads = 0
            for ld in loads:
                eff = ld.get("delivery_date")
                if not eff:
                    if isinstance(ld.get("extra_delivery"), list) and ld["extra_delivery"]:
                        eff = ld["extra_delivery"][-1].get("date")
                    elif isinstance(ld.get("extra_delivery"), dict):
                        eff = ld["extra_delivery"].get("date")
                    elif isinstance(ld.get("delivery"), dict):
                        eff = ld["delivery"].get("date")
                d_local = to_local_date_only(eff)
                if d_local is not None and d_local.weekday() == 0:
                    monday_loads += 1

            # --- нормализация *_id в loads/inspections ---
            for ld in loads:
                if "_id" in ld: ld["_id"] = to_objectid(ld["_id"])
                if "assigned_driver" in ld: ld["assigned_driver"] = to_objectid(ld["assigned_driver"])
                if "assigned_dispatch" in ld: ld["assigned_dispatch"] = to_objectid(ld["assigned_dispatch"])
                if "assigned_power_unit" in ld: ld["assigned_power_unit"] = to_objectid(ld["assigned_power_unit"])
                if "company_sign" in ld: ld["company_sign"] = to_objectid(ld["company_sign"])
            for insp in inspections:
                if "_id" in insp: insp["_id"] = to_objectid(insp["_id"])

            # --- Нормализация expenses с action/removed/amount ---
            expenses = []
            for exp in expenses_in:
                action = str(exp.get("action") or "keep")
                if action not in ALLOWED_EXPENSE_ACTIONS:
                    action = "keep"
                normalized = {
                    "_id": to_objectid(exp.get("_id")),
                    "amount": to_float(exp.get("amount"), 0.0),
                    "category": exp.get("category") or "",
                    "note": exp.get("note") or "",
                    "date": exp.get("date") or "",
                    "photo_id": to_objectid(exp.get("photo_id")),
                    "action": action,
                    "removed": bool(exp.get("removed", False)),
                }
                expenses.append(normalized)

            invoices_num = len(expenses)
            invoices_included = sum(1 for e in expenses if not e.get("removed", False))

            # --- Расчёт зарплаты на бэке ---
            # 1) гросс из грузов
            loads_gross = 0.0
            for ld in loads:
                loads_gross += to_float(ld.get("price"), 0.0)

            # 2) корректировки из инвойсов (только не удалённые)
            gross_add = gross_deduct = salary_add = salary_deduct = 0.0
            for e in expenses:
                if e.get("removed", False):
                    continue
                amt = to_float(e.get("amount"), 0.0)
                act = e.get("action") or "keep"
                if act == "add_gross":
                    gross_add += amt
                elif act == "deduct_gross":
                    gross_deduct += amt
                elif act == "add_salary":
                    salary_add += amt
                elif act == "deduct_salary":
                    salary_deduct += amt
                # keep -> без влияния

            gross_for_commission = loads_gross + gross_add - gross_deduct

            # 3) комиссия по схеме
            commission = 0.0
            scheme_type = (scheme.get("scheme_type") or scheme.get("type") or "percent")

            if scheme_type == "per_mile":
                # 💡 новая схема: считаем по милям от Самсары
                miles_total = to_float((mileage_in or {}).get("miles"), 0.0)
                per_mile_rate = to_float(scheme.get("per_mile_rate"), 0.0)
                commission = miles_total * per_mile_rate
            else:
                # percent (по умолчанию)
                table = scheme.get("commission_table") or []
                # привести числа
                safe_table = []
                for row in table:
                    safe_table.append({
                        "from_sum": to_float(row.get("from_sum"), 0.0),
                        "percent": to_float(row.get("percent"), 0.0)
                    })
                if len(safe_table) == 1:
                    commission = gross_for_commission * (safe_table[0]["percent"] / 100.0)
                elif len(safe_table) > 1:
                    safe_table.sort(key=lambda r: r["from_sum"], reverse=True)
                    matched = next((r for r in safe_table if gross_for_commission >= r["from_sum"]), None)
                    if matched:
                        commission = gross_for_commission * (matched["percent"] / 100.0)

            # 4) вычеты по схеме
            scheme_deductions = scheme.get("deductions") or []
            scheme_deductions_total = 0.0
            for d in scheme_deductions:
                scheme_deductions_total += to_float(d.get("amount"), 0.0)

            # 5) итог к выплате
            final_salary = commission - scheme_deductions_total - salary_deduct + salary_add

            # агрегаты по расходам
            expenses_totals = {
                "visible_total": round(sum(to_float(e.get("amount"), 0.0) for e in expenses if not e.get("removed", False)), 2),
                "gross_add": round(gross_add, 2),
                "gross_deduct": round(gross_deduct, 2),
                "salary_add": round(salary_add, 2),
                "salary_deduct": round(salary_deduct, 2),
            }

            # calc (добавили ключи для per_mile)
            calc = {
                "loads_gross": round(loads_gross, 2),
                "gross_add_from_expenses": round(gross_add, 2),
                "gross_deduct_from_expenses": round(gross_deduct, 2),
                "gross_for_commission": round(gross_for_commission, 2),
                "commission": round(commission, 2),
                "scheme_deductions_total": round(scheme_deductions_total, 2),
                "salary_add_from_expenses": round(salary_add, 2),
                "salary_deduct_from_expenses": round(salary_deduct, 2),
                "final_salary": round(final_salary, 2),
            }
            # если передали mileage — приятно сохранить в calc для прозрачности
            if mileage_in:
                calc["miles_total"] = round(to_float(mileage_in.get("miles"), 0.0), 2)
                if scheme_type == "per_mile":
                    calc["per_mile_rate"] = round(to_float(scheme.get("per_mile_rate"), 0.0), 4)

            # hash по драйверу и интервалу
            hash_hex = hashlib.sha256(f"{str(driver_oid)}|{wr}".encode("utf-8")).hexdigest()

            # итоговый документ
            doc = {
                "driver_id": driver_oid,
                "week_range": wr,
                "week_start_utc": week_start_utc,
                "week_end_utc":   week_end_utc,
                "snapshot": {
                    "loads": loads,
                    "fuel": it.get("fuel"),
                    "scheme": scheme,
                    "inspections": inspections,
                    "expenses": expenses,
                    "mileage": {
                        "miles":  to_float((mileage_in or {}).get("miles"), 0.0),
                        "meters": to_float((mileage_in or {}).get("meters"), 0.0),
                        "source": (mileage_in or {}).get("source"),
                        "truck_id": (mileage_in or {}).get("truck_id"),
                        "samsara_vehicle_id": (mileage_in or {}).get("samsara_vehicle_id"),
                    }
                },
                "expenses_totals": expenses_totals,
                "calc": calc,
                "monday_loads": monday_loads,
                "invoices_num": invoices_num,
                "invoices_included": invoices_included,
                "inspections_num": len(inspections),
                "approved": False,
                "created_at": datetime.utcnow(),
                "created_by": created_by_oid,
                "hash": hash_hex
            }

            # upsert по hash; если approved — не трогаем
            existing = statement_collection.find_one({"hash": hash_hex}, {"_id": 1, "approved": 1})
            if existing:
                if existing.get("approved") is True:
                    ignored += 1
                    continue
                else:
                    statement_collection.delete_one({"_id": existing["_id"]})
                    statement_collection.insert_one(doc)
                    replaced += 1
            else:
                statement_collection.insert_one(doc)
                added += 1

        return jsonify({"success": True, "added": added, "ignored": ignored, "replaced": replaced})

    except Exception as e:
        import traceback
        print("Exception in /api/statements/bulk_save:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500



    


@statement_bp.route("/api/statements/list", methods=["GET"])
@login_required
def list_statements():
    try:
        wr = (request.args.get("week_range") or "").strip()
        query = {}
        if wr:
            # если уже записаны нормализованные даты, ищем по ним
            try:
                tz_doc  = db["company_timezone"].find_one({}) or {}
                tz_name = tz_doc.get("timezone") or "America/Chicago"
                local_tz = ZoneInfo(tz_name)
                utc_tz   = timezone.utc

                s, e = [x.strip() for x in wr.split("-")]
                s_local = datetime.strptime(s, "%m/%d/%Y").replace(tzinfo=local_tz)
                e_local_excl = (datetime.strptime(e, "%m/%d/%Y") + timedelta(days=1)).replace(tzinfo=local_tz)
                s_utc = s_local.astimezone(utc_tz).replace(tzinfo=None)
                e_utc = e_local_excl.astimezone(utc_tz).replace(tzinfo=None)
                query["week_start_utc"] = s_utc
                query["week_end_utc"]   = e_utc
            except Exception:
                # fallback — по строке
                query["week_range"] = wr

        # добавили calc и snapshot чтобы либо забрать готовую зарплату, либо пересчитать
        projection = {
            "driver_id": 1, "week_range": 1,
            "monday_loads": 1, "invoices_num": 1, "inspections_num": 1,
            "approved": 1, "created_at": 1,
            "calc": 1,
            "snapshot.loads": 1,
            "snapshot.expenses": 1,
            "snapshot.scheme": 1
        }
        docs = list(statement_collection.find(query, projection).sort([("created_at", -1)]))

        # справочники driver -> name, truck, hiring_company
        driver_ids = list({d["driver_id"] for d in docs if isinstance(d.get("driver_id"), ObjectId)})
        drivers_map, trucks_map, companies_map = {}, {}, {}
        if driver_ids:
            for drv in db["drivers"].find(
                {"_id": {"$in": driver_ids}},
                {"name": 1, "truck": 1, "hiring_company": 1}
            ):
                drivers_map[drv["_id"]] = {
                    "name": drv.get("name") or "—",
                    "truck": drv.get("truck"),
                    "hiring_company": drv.get("hiring_company")
                }

            # траки
            truck_ids = list({v["truck"] for v in drivers_map.values() if isinstance(v.get("truck"), ObjectId)})
            if truck_ids:
                for t in db["trucks"].find({"_id": {"$in": truck_ids}}, {"unit_number": 1}):
                    trucks_map[t["_id"]] = t.get("unit_number") or ""

            # компании найма
            company_ids = list({v["hiring_company"] for v in drivers_map.values() if isinstance(v.get("hiring_company"), ObjectId)})
            if company_ids:
                for c in db["companies"].find({"_id": {"$in": company_ids}}, {"name": 1}):
                    companies_map[c["_id"]] = c.get("name") or "—"

        def to_float(val, default=0.0):
            try:
                return float(val)
            except Exception:
                return float(default)

        def compute_final_salary_from_snapshot(snap: dict) -> float:
            """
            Быстрый пересчёт, если нет calc:
              - loads_gross = sum(price)
              - корректировки из expenses по action/removed
              - percent-схема
              - вычеты scheme.deductions
            """
            if not isinstance(snap, dict):
                return 0.0
            loads   = snap.get("loads") or []
            scheme  = snap.get("scheme") or {}
            expenses = snap.get("expenses") or []

            # 1) гросс по грузам
            loads_gross = 0.0
            for ld in loads:
                loads_gross += to_float((ld or {}).get("price"), 0.0)

            # 2) корректировки по инвойсам (только не удалённые)
            gross_add = gross_deduct = salary_add = salary_deduct = 0.0
            for e in expenses:
                if (e or {}).get("removed", False):
                    continue
                amt = to_float((e or {}).get("amount"), 0.0)
                action = (e or {}).get("action") or "keep"
                if action == "add_gross":
                    gross_add += amt
                elif action == "deduct_gross":
                    gross_deduct += amt
                elif action == "add_salary":
                    salary_add += amt
                elif action == "deduct_salary":
                    salary_deduct += amt

            gross_for_commission = loads_gross + gross_add - gross_deduct

            # 3) комиссия по percent
            commission = 0.0
            scheme_type = scheme.get("scheme_type") or scheme.get("type") or "percent"
            if scheme_type == "percent":
                table = scheme.get("commission_table") or []
                safe_table = [{"from_sum": to_float(r.get("from_sum"), 0.0),
                               "percent": to_float(r.get("percent"), 0.0)} for r in table]
                if len(safe_table) == 1:
                    commission = gross_for_commission * (safe_table[0]["percent"] / 100.0)
                elif len(safe_table) > 1:
                    safe_table.sort(key=lambda r: r["from_sum"], reverse=True)
                    matched = next((r for r in safe_table if gross_for_commission >= r["from_sum"]), None)
                    if matched:
                        commission = gross_for_commission * (matched["percent"] / 100.0)

            # 4) вычеты по схеме
            scheme_deductions_total = 0.0
            for d in (scheme.get("deductions") or []):
                scheme_deductions_total += to_float(d.get("amount"), 0.0)

            # 5) итог
            final_salary = commission - scheme_deductions_total - salary_deduct + salary_add
            return round(final_salary, 2)

        items = []
        for d in docs:
            drv = drivers_map.get(d.get("driver_id"), {})
            truck_oid = drv.get("truck") if isinstance(drv.get("truck"), ObjectId) else None
            hiring_company_oid = drv.get("hiring_company") if isinstance(drv.get("hiring_company"), ObjectId) else None
            hiring_company_name = companies_map.get(hiring_company_oid, "—") if hiring_company_oid else "—"

            # берём salary: сначала calc.final_salary, иначе считаем из snapshot
            calc = d.get("calc") or {}
            if isinstance(calc, dict) and isinstance(calc.get("final_salary"), (int, float)):
                final_salary = float(calc.get("final_salary"))
            else:
                snap = d.get("snapshot") or {}
                final_salary = compute_final_salary_from_snapshot(snap)

            items.append({
                "_id": str(d["_id"]),
                "week_range": d.get("week_range", ""),
                "driver_id": str(d["driver_id"]) if isinstance(d.get("driver_id"), ObjectId) else (d.get("driver_id") or ""),
                "driver_name": drv.get("name", "—"),

                "truck_id": str(truck_oid) if isinstance(truck_oid, ObjectId) else "",
                "truck_number": trucks_map.get(truck_oid, "") if truck_oid else "",

                # новое: компания найма
                "hiring_company_id": str(hiring_company_oid) if hiring_company_oid else "",
                "hiring_company_name": hiring_company_name,

                "monday_loads": int(d.get("monday_loads") or 0),
                "invoices_num": int(d.get("invoices_num") or 0),
                "inspections_num": int(d.get("inspections_num") or 0),
                "approved": bool(d.get("approved", False)),
                "salary": round(final_salary, 2),
                "created_at": (d.get("created_at") or datetime.utcnow()).isoformat()
            })

        return jsonify({"success": True, "count": len(items), "items": items})
    except Exception as e:
        import traceback
        print("Exception in /api/statements/list:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500




# --- Считаем мили водителя (инклюзивный диапазон дат с TZ → UTC, корректный baseline) ---
@statement_bp.route("/api/statement/driver_mileage", methods=["GET"])
@login_required
def api_samsara_driver_mileage():
    """
    Считает пробег за интервал ДЛЯ ВОДИТЕЛЯ:
      - по driver_id → находим drivers.truck
      - по truck → trucks.samsara_vehicle_id
      - дальше считаем пробег по Samsara (stats/history)

    Диапазон времени:
      - date: сутки компании [00:00..23:59:59] инклюзивно
      - start/end без времени: обе даты инклюзивно (start@00:00 .. end@23:59:59)
      - start/end с временем: используем как есть

    Параметры:
      driver_id (required), date | start, end, tz (IANA, по умолчанию TZ компании), pad (минуты)
    """
    import requests
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo
    from bson import ObjectId
    from flask import request, jsonify
    from samsara import get_samsara_headers, BASE_URL

    # --- константы/локальные утилиты ---
    MILES_PER_METER = 0.000621371
    TYPES = ["obdOdometerMeters", "gpsDistanceMeters", "gpsOdometerMeters"]

    def _looks_like_date_only(s: str) -> bool:
        if not s:
            return False
        s = s.strip()
        if len(s) == 10 and s[4] == "-" and s[7] == "-":  # YYYY-MM-DD
            return True
        if len(s) >= 10 and s[2] == "/" and s[5] == "/":  # MM/DD/YYYY
            return True
        return False

    def _parse_any_ts_localfirst(s: str, local_tz: ZoneInfo):
        """Поддержка ISO/offset/YYYY-MM-DD/MM/DD/YYYY → TZ-aware."""
        if not s:
            return None
        s = s.strip()
        # YYYY-MM-DD → 00:00 local
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=local_tz)
        # MM/DD/YYYY → 00:00 local
        if len(s) >= 10 and s[2] == "/" and s[5] == "/":
            return datetime.strptime(s[:10], "%m/%d/%Y").replace(tzinfo=local_tz)
        # ISO (может быть с Z/offset) → aware
        return datetime.fromisoformat(s.replace("Z", "+00:00"))

    def _to_utc_iso(dt: datetime) -> str:
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _ensure_list(obj):
        if obj is None:
            return []
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            return [obj]
        return []

    def _parse_time(s: str) -> datetime:
        # Примеры в Самсаре: "2025-08-04T05:00:03Z"
        return datetime.fromisoformat(s.replace("Z", "+00:00"))

    def _pick_window_delta(arr, start_local: datetime, end_local: datetime):
        """
        Берём baseline = последняя точка <= start_local (если нет — первая >= start_local),
        end      = последняя точка <= end_local.
        Возвращаем (meters, miles, samples, firstTime, lastTime).
        """
        samples = [x for x in arr if x and x.get("time") and (x.get("value") is not None)]
        if not samples:
            return 0.0, 0.0, 0, None, None

        # сортируем по времени
        samples.sort(key=lambda x: x["time"])

        # найдём индексы
        start_idx = None
        end_idx = None

        # бинарный/линейный поиск (массив уже отсортирован)
        # 1) end_idx: последняя точка <= end_local
        for i in range(len(samples) - 1, -1, -1):
            t = _parse_time(samples[i]["time"]).astimezone(start_local.tzinfo)
            if t <= end_local:
                end_idx = i
                break

        if end_idx is None:
            # все точки после конца окна
            return 0.0, 0.0, len(samples), None, None

        # 2) start_idx: последняя точка <= start_local
        for i in range(end_idx, -1, -1):
            t = _parse_time(samples[i]["time"]).astimezone(start_local.tzinfo)
            if t <= start_local:
                start_idx = i
                break
        if start_idx is None:
            # нет точек до старта — возьмём первую точку >= start_local
            for i in range(0, end_idx + 1):
                t = _parse_time(samples[i]["time"]).astimezone(start_local.tzinfo)
                if t >= start_local:
                    start_idx = i
                    break

        if start_idx is None:
            return 0.0, 0.0, len(samples), None, None

        v0 = float(samples[start_idx]["value"])
        v1 = float(samples[end_idx]["value"])
        delta_m = v1 - v0
        if delta_m < 0:
            delta_m = 0.0

        meters = round(delta_m, 3)
        miles = round(meters * MILES_PER_METER, 3)
        return meters, miles, len(samples), samples[start_idx]["time"], samples[end_idx]["time"]

    try:
        # --- входные параметры ---
        driver_id_str = request.args.get("driver_id")
        if not driver_id_str:
            return jsonify({"success": False, "error": "Missing driver_id"}), 400
        try:
            driver_oid = ObjectId(driver_id_str)
        except Exception:
            return jsonify({"success": False, "error": "Invalid driver_id"}), 400

        drivers_collection = db["drivers"]
        trucks_collection  = db["trucks"]

        # --- водитель и трак ---
        driver = drivers_collection.find_one(
            {"_id": driver_oid, "company": current_user.company},
            {"_id": 1, "name": 1, "truck": 1}
        )
        if not driver:
            return jsonify({"success": False, "error": "Driver not found in your company"}), 404
        truck_oid = driver.get("truck")
        if not truck_oid:
            return jsonify({"success": False, "error": "Driver has no assigned truck"}), 404

        truck = trucks_collection.find_one(
            {"_id": truck_oid, "company": current_user.company},
            {"_id": 1, "unit_number": 1, "samsara_vehicle_id": 1}
        )
        if not truck:
            return jsonify({"success": False, "error": "Truck not found in your company"}), 404

        samsara_vehicle_id = truck.get("samsara_vehicle_id")
        if isinstance(samsara_vehicle_id, str):
            samsara_vehicle_id = samsara_vehicle_id.strip()
        if not samsara_vehicle_id:
            return jsonify({"success": False, "error": "Truck has no samsara_vehicle_id"}), 404

        # --- таймзона компании (fallback America/Chicago) ---
        tz_doc  = db["company_timezone"].find_one({"company": current_user.company}) or {}
        tz_name = request.args.get("tz") or tz_doc.get("timezone") or "America/Chicago"
        local_tz = ZoneInfo(tz_name)

        # --- вычисляем окно ---
        date_str  = request.args.get("date")
        start_str = request.args.get("start")
        end_str   = request.args.get("end")

        if date_str and not (start_str or end_str):
            # сутки выбранной даты инклюзивно
            day_local = _parse_any_ts_localfirst(date_str, local_tz)
            if not day_local:
                return jsonify({"success": False, "error": "Invalid date format"}), 400
            start_local = day_local.replace(hour=0, minute=0, second=0, microsecond=0)
            end_local   = day_local.replace(hour=23, minute=59, second=59, microsecond=0)
        else:
            if not (start_str and end_str):
                return jsonify({"success": False, "error": "Provide either date or start+end"}), 400

            if _looks_like_date_only(start_str) and _looks_like_date_only(end_str):
                s_local = _parse_any_ts_localfirst(start_str, local_tz)
                e_local = _parse_any_ts_localfirst(end_str,   local_tz)
                start_local = s_local.replace(hour=0, minute=0, second=0, microsecond=0)
                end_local   = e_local.replace(hour=23, minute=59, second=59, microsecond=0)
            else:
                start_local = _parse_any_ts_localfirst(start_str, local_tz)
                end_local   = _parse_any_ts_localfirst(end_str,   local_tz)
                if not (start_local and end_local):
                    return jsonify({"success": False, "error": "Bad start/end format"}), 400

        # --- паддинг для запроса, baseline остаётся на start_local ---
        pad_min = int(request.args.get("pad") or 45)
        start_local_padded = start_local - timedelta(minutes=max(0, pad_min))

        # --- UTC/ISO ---
        start_iso        = _to_utc_iso(start_local)
        end_iso          = _to_utc_iso(end_local)          # включительно 23:59:59 локали → UTC
        start_iso_padded = _to_utc_iso(start_local_padded) # только для выборки

        # --- запрос в Samsara ---
        headers = get_samsara_headers()
        url = f"{BASE_URL}/fleet/vehicles/stats/history"
        params = {
            "vehicleIds": str(samsara_vehicle_id),
            "types": ",".join(TYPES),
            "startTime": start_iso_padded,
            "endTime": end_iso
        }

        pages = 0
        accum = {t: [] for t in TYPES}
        names = {}
        while True:
            pages += 1
            if pages > 60:
                break
            r = requests.get(url, headers=headers, params=params, timeout=30)
            if not r.ok:
                return jsonify({
                    "success": False,
                    "error": f"Failed to fetch stats history ({r.status_code})",
                    "details": r.text
                }), r.status_code

            payload = r.json() or {}
            for veh in payload.get("data", []):
                if str(veh.get("id")) != str(samsara_vehicle_id):
                    continue
                names["vehicle"] = veh.get("name")
                for t in TYPES:
                    accum[t].extend(_ensure_list(veh.get(t)))

            pag = (payload.get("pagination") or {})
            if pag.get("hasNextPage"):
                params["after"] = pag.get("endCursor")
            else:
                break

        # --- считаем дельты по каждому источнику на строго заданном окне ---
        breakdown = {}
        for t in TYPES:
            meters, miles, samples, firstTime, lastTime = _pick_window_delta(accum[t], start_local, end_local)
            breakdown[t] = {
                "meters": meters,
                "miles":  miles,
                "samples": samples,
                "firstTime": firstTime,
                "lastTime":  lastTime
            }

        # --- выбираем лучший источник ---
        best_key = None
        for key in ["obdOdometerMeters", "gpsDistanceMeters", "gpsOdometerMeters"]:
            if breakdown.get(key, {}).get("meters", 0) > 0:
                best_key = key
                break
        if not best_key:
            best_key = "obdOdometerMeters"

        resp = {
            "success": True,
            "driver_id": str(driver["_id"]),
            "driver_name": driver.get("name"),
            "truck_id": str(truck["_id"]),
            "unit_number": truck.get("unit_number"),
            "vehicle_id": str(samsara_vehicle_id),
            "date": (request.args.get("date") or None),
            "start_time_utc": start_iso,   # начало окна (без pad)
            "end_time_utc": end_iso,       # конец окна
            "meters": breakdown[best_key]["meters"],
            "miles":  breakdown[best_key]["miles"],
            "source": best_key,
            "breakdown": breakdown
        }
        if request.args.get("debug") == "1":
            resp["debug"] = {
                "pages": pages,
                "tz": tz_name,
                "pad_minutes": pad_min,
                "queried_types": TYPES,
                "vehicle_name": names.get("vehicle"),
                "start_local": str(start_local),
                "end_local": str(end_local),
                "start_iso_padded": start_iso_padded
            }
        return jsonify(resp)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500