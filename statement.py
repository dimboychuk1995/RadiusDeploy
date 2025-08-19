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

        def str_oid(val):
            return str(val) if isinstance(val, ObjectId) else val

        serialized = []
        extra_stops_total = 0  # ← копим только за базовый диапазон (out_of_diap == False)

        for load in loads:
            eff_date = load.get("effective_date")
            out_of_diap = False
            if eff_date and isinstance(eff_date, datetime):
                naive_eff = eff_date if eff_date.tzinfo is None else eff_date.astimezone(utc_tz).replace(tzinfo=None)
                if not (start_bound_naive <= naive_eff < base_end_bound_naive):
                    out_of_diap = True

            # аккуратно считаем экстра-стопы:
            # 1) если в документе есть поле extra_stops — используем его
            # 2) иначе считаем по extra_arr / extra_delivery
            extra_count = 0
            if isinstance(load.get("extra_stops"), (int, float)):
                try:
                    extra_count = int(load.get("extra_stops") or 0)
                except Exception:
                    extra_count = 0
            else:
                extras = load.get("extra_arr")
                if isinstance(extras, list):
                    extra_count = len(extras)
                else:
                    raw_extra = load.get("extra_delivery")
                    if isinstance(raw_extra, list):
                        extra_count = len(raw_extra)
                    elif isinstance(raw_extra, dict):
                        extra_count = 1
                    else:
                        extra_count = 0

            if not out_of_diap:
                extra_stops_total += max(0, extra_count)

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
                "extra_stops": extra_count,  # ← нормализованное число
                "pickup_date": (load.get("pickup") or {}).get("date") if isinstance(load.get("pickup"), dict) else None,
                "delivery_date": eff_date or (load.get("delivery") or {}).get("date"),
                "out_of_diap": out_of_diap
            })

        return jsonify({
            "success": True,
            "loads": serialized,
            "count": len(serialized),
            "extra_stops_total": int(extra_stops_total)  # ← новое поле
        })

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

        # 1) тип схемы: сначала явное поле, затем из net_commission_table.type, иначе "percent"
        raw_net = (driver.get("net_commission_table") or {})
        scheme_type = (driver.get("scheme_type") or raw_net.get("type") or "percent")

        # 2) таблица комиссий (для percent)
        commission_table = driver.get("commission_table", []) or []

        # 3) per-mile ставка (для per_mile)
        per_mile_rate = float(driver.get("per_mile_rate", 0) or 0)

        # 4) постоянные удержания (additional_charges) — без изменений
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

        # 6) 🆕 бонус за экстра-стопы (берём из карточки водителя)
        enable_extra_stop_bonus = bool(driver.get("enable_extra_stop_bonus", False))
        try:
            extra_stop_bonus_amount = float(driver.get("extra_stop_bonus_amount", 0) or 0)
        except Exception:
            extra_stop_bonus_amount = 0.0

        return jsonify({
            "success": True,
            "scheme_type": scheme_type,
            "commission_table": commission_table,
            "per_mile_rate": per_mile_rate,

            "deductions": deductions,

            "enable_inspection_bonus": enable_bonus,
            "bonus_level_1": bonus_level_1,
            "bonus_level_2": bonus_level_2,
            "bonus_level_3": bonus_level_3,

            # ↓ новые поля для фронта
            "enable_extra_stop_bonus": enable_extra_stop_bonus,
            "extra_stop_bonus_amount": extra_stop_bonus_amount
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
    


# --- Массовое сохранение стейтментов (insert / replace / ignore approved) ---
@statement_bp.route("/api/statements/bulk_save", methods=["POST"])
@login_required
def bulk_save_statements():
    """
    Массовое сохранение стейтментов.
    ДОБАВЛЕНО: глубокая нормализация типов внутри raw/loads/inspections/expenses/fuel/mileage/scheme:
      - *_id и ряд известных id-полей → ObjectId
      - поля с датами → datetime (naive, UTC)
      - числовые поля → float/int, где уместно
    """
    from flask import request, jsonify
    from bson import ObjectId
    from datetime import datetime

    # ---- Хелперы приведения типов ------------------------------------------
    OID_KEYS = {
        "_id", "id",
        "driver_id", "driver", "dispatcher", "user_id",
        "assigned_driver", "assigned_dispatch", "assigned_power_unit",
        "company_sign", "hiring_company",
        "truck", "truck_id",
        "photo_id", "fuel_card_id",
        "samsara_vehicle_id", "vehicle_id",
        "expense_id", "inspection_id",
    }

    DATE_KEYS = {
        # обобщённые дата-поля
        "date", "date_to", "pickup_date", "delivery_date",
        "picked_up", "delivered_at",
        # служебные
        "created_at", "updated_at",
    }

    # набор форматов, встречающихся в проекте
    _DT_FORMATS = (
        "%a, %d %b %Y %H:%M:%S GMT",   # Fri, 08 Aug 2025 20:22:36 GMT
        "%m/%d/%Y %H:%M:%S",           # 08/06/2025 14:18:57
        "%m/%d/%Y %H:%M",              # 08/06/2025 14:18
        "%m/%d/%Y",                    # 08/06/2025
        "%Y-%m-%dT%H:%M:%S.%fZ",       # ISO с миллисекундами
        "%Y-%m-%dT%H:%M:%SZ",          # ISO
        "%Y-%m-%d %H:%M:%S",           # 2025-08-06 14:18:57
        "%Y-%m-%d",                    # 2025-08-06
    )

    def _is_hex24(s: str) -> bool:
        return isinstance(s, str) and len(s) == 24 and all(c in "0123456789abcdefABCDEF" for c in s)

    def _to_oid(val):
        if isinstance(val, ObjectId):
            return val
        if isinstance(val, str) and _is_hex24(val):
            try:
                return ObjectId(val)
            except Exception:
                return val
        return val

    def _try_parse_datetime(s):
        if not isinstance(s, str) or not s.strip():
            return s
        # быстрая эвристика: если это чисто время (HH:MM/HH:MM:SS) — оставляем строкой
        if s.count(":") in (1, 2) and ("/" not in s and "," not in s and "T" not in s and "-" not in s):
            return s
        for fmt in _DT_FORMATS:
            try:
                dt = datetime.strptime(s, fmt)
                # трактуем как UTC-naive
                return dt.replace(tzinfo=None)
            except Exception:
                pass
        # last resort: ISO-8601 произвольный
        try:
            # без dateutil — пробуем избыточно откусить 'Z'
            if s.endswith("Z"):
                s2 = s[:-1]
                dt = datetime.fromisoformat(s2)
                return dt.replace(tzinfo=None)
            dt = datetime.fromisoformat(s)
            return dt.replace(tzinfo=None)
        except Exception:
            return s

    # Опциональное приведение чисел
    def _to_int(val):
        try:
            return int(val)
        except Exception:
            return val

    def _to_float(val):
        try:
            return float(val)
        except Exception:
            return val

    # Глубокая нормализация документов
    def _coerce(obj, parent_key=None):
        # списки
        if isinstance(obj, list):
            return [_coerce(x, parent_key) for x in obj]

        # словари
        if isinstance(obj, dict):
            out = {}
            for k, v in obj.items():
                kv = k.lower() if isinstance(k, str) else k

                # рекурсивно нормализуем вложенное
                v_norm = _coerce(v, kv)

                # 1) ObjectId по ключам
                if kv in OID_KEYS or kv.endswith("_id"):
                    out[k] = _to_oid(v_norm)
                    continue

                # 2) Даты по известным ключам
                if kv in DATE_KEYS:
                    out[k] = _try_parse_datetime(v_norm)
                    continue

                # 3) Отдельные числовые поля (где встречается текст)
                if kv in {"price", "rpm", "miles", "meters", "per_mile_rate",
                          "bonus_level_1", "bonus_level_2", "bonus_level_3",
                          "extra_stop_bonus_amount"}:
                    out[k] = _to_float(v_norm)
                    continue

                if kv in {"extra_stops", "stop_number", "monday_loads",
                          "invoices_num", "inspections_num"}:
                    out[k] = _to_int(v_norm)
                    continue

                out[k] = v_norm

            # Спец-нормализация известных структур:
            # pickup/delivery/extra_delivery.date → datetime
            for node in ("pickup", "delivery"):
                if isinstance(out.get(node), dict) and "date" in out[node]:
                    out[node]["date"] = _try_parse_datetime(out[node]["date"])
            if isinstance(out.get("extra_delivery"), dict) and "date" in out["extra_delivery"]:
                out["extra_delivery"]["date"] = _try_parse_datetime(out["extra_delivery"]["date"])
            if isinstance(out.get("extra_delivery"), list):
                for ed in out["extra_delivery"]:
                    if isinstance(ed, dict) and "date" in ed:
                        ed["date"] = _try_parse_datetime(ed["date"])

            return out

        # простые типы
        return obj

    # ---- Основная логика сохранения -----------------------------------------
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        payload = {}

    week_range = payload.get("week_range") or ""
    items = payload.get("items") or []
    if not week_range or not isinstance(items, list):
        return jsonify({"success": False, "error": "week_range and items[] required"}), 400

    col = db["statement"]
    drivers_col = db["drivers"]
    trucks_col = db["trucks"]

    added = replaced = ignored = failed = 0
    details = []
    now = datetime.utcnow()

    def _count_extra_stops(load):
        try:
            if isinstance(load.get("extra_stops"), (int, float, str)):
                return max(0, int(load.get("extra_stops") or 0))
        except Exception:
            pass
        raw = load.get("extra_delivery")
        if isinstance(raw, list):
            return len(raw)
        if isinstance(raw, dict):
            return 1
        return 0

    for raw in items:
        try:
            driver_id_str = (raw.get("driver_id") or "").strip()
            if not driver_id_str:
                failed += 1
                details.append({"driver_id": None, "status": "failed", "reason": "missing driver_id"})
                continue

            try:
                driver_oid = ObjectId(driver_id_str)
            except Exception:
                failed += 1
                details.append({"driver_id": driver_id_str, "status": "failed", "reason": "bad driver_id"})
                continue

            # водитель в рамках компании
            driver = drivers_col.find_one(
                {"_id": driver_oid, "company": current_user.company},
                {"name": 1, "truck": 1, "hiring_company": 1}
            )
            if not driver:
                failed += 1
                details.append({"driver_id": driver_id_str, "status": "failed", "reason": "driver not in company"})
                continue

            # номер трака
            truck_num = None
            tr_id = driver.get("truck")
            if tr_id:
                tr = trucks_col.find_one({"_id": tr_id, "company": current_user.company}, {"unit_number": 1})
                if tr:
                    truck_num = tr.get("unit_number")

            # исходные блоки
            loads_in = raw.get("loads") or []
            inspections_in = raw.get("inspections") or []
            expenses_in = raw.get("expenses") or []
            scheme_in = raw.get("scheme") or {}
            mileage_in = raw.get("mileage") or {}
            fuel_in = raw.get("fuel") or {}
            calc_in = raw.get("calc") or {}

            # Глубокая нормализация
            loads = _coerce(loads_in)
            inspections = _coerce(inspections_in)
            expenses = _coerce(expenses_in)
            scheme = _coerce(scheme_in)
            mileage = _coerce(mileage_in)
            fuel = _coerce(fuel_in)
            calc = _coerce(calc_in)

            # агрегаты
            monday_loads = sum(1 for ld in loads if not ld.get("out_of_diap"))
            invoices_num = sum(1 for e in expenses if not e.get("removed"))
            inspections_num = len(inspections)
            extra_stops_total = sum(_count_extra_stops(ld) for ld in loads if not ld.get("out_of_diap"))

            miles = float(mileage.get("miles") or 0.0)
            salary = float(calc.get("final_salary") or 0.0)
            commission = float(calc.get("commission") or 0.0)

            doc = {
                "company": current_user.company,
                "week_range": week_range,
                "driver_id": driver_oid,
                "driver_name": driver.get("name"),
                "hiring_company": driver.get("hiring_company"),

                "truck_number": truck_num,

                "salary": round(salary, 2),
                "commission": round(commission, 2),
                "miles": round(miles, 2),

                "scheme_type": scheme.get("scheme_type"),
                "per_mile_rate": scheme.get("per_mile_rate"),

                "monday_loads": int(monday_loads),
                "invoices_num": int(invoices_num),
                "inspections_num": int(inspections_num),
                "extra_stops_total": int(extra_stops_total),

                "raw": {
                    "loads": loads,
                    "fuel": fuel,
                    "expenses": expenses,
                    "inspections": inspections,
                    "scheme": scheme,
                    "mileage": mileage,
                    "calc": calc
                },

                "approved": False,
                "updated_at": now
            }

            flt = {"company": current_user.company, "driver_id": driver_oid, "week_range": week_range}
            existing = col.find_one(flt, {"approved": 1, "created_at": 1})

            if existing:
                if existing.get("approved"):
                    ignored += 1
                    details.append({"driver_id": driver_id_str, "status": "ignored-approved"})
                    continue

                # replace (сохраняем created_at)
                doc["created_at"] = existing.get("created_at") or now
                col.replace_one({"_id": existing["_id"]}, doc, upsert=False)
                replaced += 1
                details.append({"driver_id": driver_id_str, "status": "replaced"})
            else:
                # insert
                doc["created_at"] = now
                ins = col.insert_one(doc)
                added += 1
                details.append({"driver_id": driver_id_str, "status": "added", "_id": str(ins.inserted_id)})

        except Exception as e:
            failed += 1
            details.append({"driver_id": raw.get("driver_id"), "status": "failed", "reason": str(e)})

    return jsonify({
        "success": True,
        "week_range": week_range,
        "added": added,
        "replaced": replaced,
        "ignored": ignored,
        "failed": failed,
        "details": details
    })


@statement_bp.route("/api/statements/list", methods=["GET"])
@login_required
def list_statements():
    from flask import request, jsonify
    from bson import ObjectId
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo

    try:
        wr = (request.args.get("week_range") or "").strip()

        # --- коллекции ---
        col = db["statement"]          # читаем из правильной коллекции
        drivers_col = db["drivers"]
        trucks_col  = db["trucks"]
        companies_col = db["companies"]

        # --- базовый фильтр (БЕЗ company) ---
        query = {}

        # --- фильтр по неделе: нормализованные поля ИЛИ строка week_range ---
        if wr:
            try:
                tz_name = (request.args.get("tz") or "America/Chicago")
                local_tz = ZoneInfo(tz_name)
                utc_tz   = timezone.utc

                s_str, e_str = [x.strip() for x in wr.split("-")]
                s_local = datetime.strptime(s_str, "%m/%d/%Y").replace(tzinfo=local_tz)
                e_local_excl = (datetime.strptime(e_str, "%m/%d/%Y") + timedelta(days=1)).replace(tzinfo=local_tz)
                s_utc = s_local.astimezone(utc_tz).replace(tzinfo=None)
                e_utc = e_local_excl.astimezone(utc_tz).replace(tzinfo=None)

                query.update({
                    "$or": [
                        {"week_start_utc": s_utc, "week_end_utc": e_utc},
                        {"week_range": wr}
                    ]
                })
            except Exception:
                query["week_range"] = wr

        # --- проекция полей ---
        projection = {
            "driver_id": 1, "week_range": 1,
            "monday_loads": 1, "invoices_num": 1, "inspections_num": 1,
            "approved": 1, "created_at": 1,

            # агрегаты/поля для списка
            "salary": 1, "commission": 1, "miles": 1,
            "truck_number": 1, "hiring_company": 1,

            # сырьё на случай пересчёта
            "raw.loads": 1,
            "raw.expenses": 1,
            "raw.scheme": 1,
            "raw.calc.final_salary": 1,
        }

        docs = list(col.find(query, projection).sort([("created_at", -1)]))

        # --- справочники driver -> {name, truck, hiring_company} (БЕЗ company-фильтров) ---
        driver_ids = list({d["driver_id"] for d in docs if isinstance(d.get("driver_id"), ObjectId)})
        drivers_map, trucks_map, companies_map = {}, {}, {}

        if driver_ids:
            for drv in drivers_col.find(
                {"_id": {"$in": driver_ids}},
                {"name": 1, "truck": 1, "hiring_company": 1}
            ):
                drivers_map[drv["_id"]] = {
                    "name": drv.get("name") or "—",
                    "truck": drv.get("truck"),
                    "hiring_company": drv.get("hiring_company")
                }

            truck_ids = [v["truck"] for v in drivers_map.values() if isinstance(v.get("truck"), ObjectId)]
            if truck_ids:
                for t in trucks_col.find({"_id": {"$in": truck_ids}}, {"unit_number": 1}):
                    trucks_map[t["_id"]] = t.get("unit_number") or ""

            company_ids = [v["hiring_company"] for v in drivers_map.values() if isinstance(v.get("hiring_company"), ObjectId)]
            if company_ids:
                for c in companies_col.find({"_id": {"$in": company_ids}}, {"name": 1}):
                    companies_map[c["_id"]] = c.get("name") or "—"

        # --- утилиты пересчёта (если нет salary и нет raw.calc.final_salary) ---
        def to_float(val, default=0.0):
            try:
                return float(val)
            except Exception:
                return float(default)

        def compute_final_salary_from_raw(raw: dict) -> float:
            if not isinstance(raw, dict):
                return 0.0
            loads    = raw.get("loads") or []
            scheme   = raw.get("scheme") or {}
            expenses = raw.get("expenses") or []

            loads_gross = sum(to_float((ld or {}).get("price"), 0.0) for ld in loads)

            gross_add = gross_deduct = salary_add = salary_deduct = 0.0
            for e in expenses:
                if (e or {}).get("removed", False):
                    continue
                amt = to_float((e or {}).get("amount"), 0.0)
                action = (e or {}).get("action") or "keep"
                if action == "add_gross": gross_add += amt
                elif action == "deduct_gross": gross_deduct += amt
                elif action == "add_salary": salary_add += amt
                elif action == "deduct_salary": salary_deduct += amt

            gross_for_commission = loads_gross + gross_add - gross_deduct

            commission = 0.0
            scheme_type = scheme.get("scheme_type") or scheme.get("type") or "percent"
            if scheme_type == "percent":
                table = scheme.get("commission_table") or []
                table = [{"from_sum": to_float(r.get("from_sum"), 0.0),
                          "percent": to_float(r.get("percent"), 0.0)} for r in table]
                if len(table) == 1:
                    commission = gross_for_commission * (table[0]["percent"] / 100.0)
                elif len(table) > 1:
                    table.sort(key=lambda r: r["from_sum"], reverse=True)
                    m = next((r for r in table if gross_for_commission >= r["from_sum"]), None)
                    if m:
                        commission = gross_for_commission * (m["percent"] / 100.0)

            scheme_deductions_total = sum(to_float(d.get("amount"), 0.0) for d in (scheme.get("deductions") or []))
            final_salary = commission - scheme_deductions_total - salary_deduct + salary_add
            return round(final_salary, 2)

        # --- сборка ответа ---
        items = []
        for d in docs:
            drv = drivers_map.get(d.get("driver_id"), {})
            truck_oid = drv.get("truck") if isinstance(drv.get("truck"), ObjectId) else None
            hiring_company_oid = drv.get("hiring_company") if isinstance(drv.get("hiring_company"), ObjectId) else None
            hiring_company_name = companies_map.get(hiring_company_oid, "—") if hiring_company_oid else "—"

            # salary: приоритет — явное поле; затем raw.calc.final_salary; затем быстрый пересчёт
            if isinstance(d.get("salary"), (int, float)):
                final_salary = float(d["salary"])
            else:
                raw = d.get("raw") or {}
                calc = (raw.get("calc") or {})
                if isinstance(calc.get("final_salary"), (int, float)):
                    final_salary = float(calc.get("final_salary"))
                else:
                    final_salary = compute_final_salary_from_raw(raw)

            items.append({
                "_id": str(d["_id"]),
                "week_range": d.get("week_range", ""),
                "driver_id": str(d["driver_id"]) if isinstance(d.get("driver_id"), ObjectId) else (d.get("driver_id") or ""),
                "driver_name": drv.get("name", "—"),

                "truck_id": str(truck_oid) if isinstance(truck_oid, ObjectId) else "",
                "truck_number": d.get("truck_number") or (trucks_map.get(truck_oid, "") if truck_oid else ""),

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



@statement_bp.route("/api/statement/driver_mileage", methods=["GET"])
@login_required
def api_samsara_driver_mileage():
    """
    Считает пробег за интервал ДЛЯ ВОДИТЕЛЯ:
      - по driver_id → находим drivers.truck
      - по truck → trucks.samsara_vehicle_id
      - дальше считаем пробег по Samsara (stats/history)

    Если у водителя нет трака или у трака нет samsara_vehicle_id — возвращает нули без обращения в Самсару.
    """
    import requests
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo
    from bson import ObjectId
    from flask import request, jsonify
    from samsara import get_samsara_headers, BASE_URL

    MILES_PER_METER = 0.000621371
    TYPES = ["obdOdometerMeters", "gpsDistanceMeters", "gpsOdometerMeters"]

    def _looks_like_date_only(s: str) -> bool:
        if not s:
            return False
        s = s.strip()
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            return True
        if len(s) >= 10 and s[2] == "/" and s[5] == "/":
            return True
        return False

    def _parse_any_ts_localfirst(s: str, local_tz: ZoneInfo):
        if not s:
            return None
        s = s.strip()
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=local_tz)
        if len(s) >= 10 and s[2] == "/" and s[5] == "/":
            return datetime.strptime(s[:10], "%m/%d/%Y").replace(tzinfo=local_tz)
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
        return datetime.fromisoformat(s.replace("Z", "+00:00"))

    def _pick_window_delta(arr, start_local: datetime, end_local: datetime):
        samples = [x for x in arr if x and x.get("time") and (x.get("value") is not None)]
        if not samples:
            return 0.0, 0.0, 0, None, None
        samples.sort(key=lambda x: x["time"])
        start_idx = None
        end_idx = None
        for i in range(len(samples) - 1, -1, -1):
            t = _parse_time(samples[i]["time"]).astimezone(start_local.tzinfo)
            if t <= end_local:
                end_idx = i
                break
        if end_idx is None:
            return 0.0, 0.0, len(samples), None, None
        for i in range(end_idx, -1, -1):
            t = _parse_time(samples[i]["time"]).astimezone(start_local.tzinfo)
            if t <= start_local:
                start_idx = i
                break
        if start_idx is None:
            for i in range(0, end_idx + 1):
                t = _parse_time(samples[i]["time"]).astimezone(start_local.tzinfo)
                if t >= start_local:
                    start_idx = i
                    break
        if start_idx is None:
            return 0.0, 0.0, len(samples), None, None
        v0 = float(samples[start_idx]["value"])
        v1 = float(samples[end_idx]["value"])
        delta_m = max(v1 - v0, 0.0)
        meters = round(delta_m, 3)
        miles = round(meters * MILES_PER_METER, 3)
        return meters, miles, len(samples), samples[start_idx]["time"], samples[end_idx]["time"]

    try:
        driver_id_str = request.args.get("driver_id")
        if not driver_id_str:
            return jsonify({"success": False, "error": "Missing driver_id"}), 400
        try:
            driver_oid = ObjectId(driver_id_str)
        except Exception:
            return jsonify({"success": False, "error": "Invalid driver_id"}), 400

        drivers_collection = db["drivers"]
        trucks_collection = db["trucks"]

        driver = drivers_collection.find_one(
            {"_id": driver_oid, "company": current_user.company},
            {"_id": 1, "name": 1, "truck": 1}
        )
        if not driver:
            return jsonify({"success": False, "error": "Driver not found in your company"}), 404

        truck_oid = driver.get("truck")
        if not truck_oid:
            # Нет трака — сразу нули
            return jsonify({
                "success": True,
                "driver_id": str(driver["_id"]),
                "driver_name": driver.get("name"),
                "truck_id": None,
                "unit_number": None,
                "vehicle_id": None,
                "meters": 0.0,
                "miles": 0.0,
                "source": None,
                "breakdown": {}
            })

        truck = trucks_collection.find_one(
            {"_id": truck_oid, "company": current_user.company},
            {"_id": 1, "unit_number": 1, "samsara_vehicle_id": 1}
        )
        if not truck:
            return jsonify({"success": False, "error": "Truck not found in your company"}), 404

        samsara_vehicle_id = (truck.get("samsara_vehicle_id") or "").strip()
        if not samsara_vehicle_id:
            # Нет samsara_vehicle_id — сразу нули
            return jsonify({
                "success": True,
                "driver_id": str(driver["_id"]),
                "driver_name": driver.get("name"),
                "truck_id": str(truck["_id"]),
                "unit_number": truck.get("unit_number"),
                "vehicle_id": None,
                "meters": 0.0,
                "miles": 0.0,
                "source": None,
                "breakdown": {}
            })

        # Дальше идёт исходная логика запроса в Самсару
        tz_doc = db["company_timezone"].find_one({"company": current_user.company}) or {}
        tz_name = request.args.get("tz") or tz_doc.get("timezone") or "America/Chicago"
        local_tz = ZoneInfo(tz_name)

        date_str = request.args.get("date")
        start_str = request.args.get("start")
        end_str = request.args.get("end")

        if date_str and not (start_str or end_str):
            day_local = _parse_any_ts_localfirst(date_str, local_tz)
            if not day_local:
                return jsonify({"success": False, "error": "Invalid date format"}), 400
            start_local = day_local.replace(hour=0, minute=0, second=0, microsecond=0)
            end_local = day_local.replace(hour=23, minute=59, second=59, microsecond=0)
        else:
            if not (start_str and end_str):
                return jsonify({"success": False, "error": "Provide either date or start+end"}), 400
            if _looks_like_date_only(start_str) and _looks_like_date_only(end_str):
                s_local = _parse_any_ts_localfirst(start_str, local_tz)
                e_local = _parse_any_ts_localfirst(end_str, local_tz)
                start_local = s_local.replace(hour=0, minute=0, second=0, microsecond=0)
                end_local = e_local.replace(hour=23, minute=59, second=59, microsecond=0)
            else:
                start_local = _parse_any_ts_localfirst(start_str, local_tz)
                end_local = _parse_any_ts_localfirst(end_str, local_tz)
                if not (start_local and end_local):
                    return jsonify({"success": False, "error": "Bad start/end format"}), 400

        pad_min = int(request.args.get("pad") or 45)
        start_local_padded = start_local - timedelta(minutes=max(0, pad_min))
        start_iso = _to_utc_iso(start_local)
        end_iso = _to_utc_iso(end_local)
        start_iso_padded = _to_utc_iso(start_local_padded)

        headers = get_samsara_headers()
        url = f"{BASE_URL}/fleet/vehicles/stats/history"
        params = {
            "vehicleIds": samsara_vehicle_id,
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
                if str(veh.get("id")) != samsara_vehicle_id:
                    continue
                names["vehicle"] = veh.get("name")
                for t in TYPES:
                    accum[t].extend(_ensure_list(veh.get(t)))
            pag = (payload.get("pagination") or {})
            if pag.get("hasNextPage"):
                params["after"] = pag.get("endCursor")
            else:
                break

        breakdown = {}
        for t in TYPES:
            meters, miles, samples, firstTime, lastTime = _pick_window_delta(accum[t], start_local, end_local)
            breakdown[t] = {
                "meters": meters,
                "miles": miles,
                "samples": samples,
                "firstTime": firstTime,
                "lastTime": lastTime
            }

        best_key = None
        for key in TYPES:
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
            "vehicle_id": samsara_vehicle_id,
            "date": (request.args.get("date") or None),
            "start_time_utc": start_iso,
            "end_time_utc": end_iso,
            "meters": breakdown[best_key]["meters"],
            "miles": breakdown[best_key]["miles"],
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


@statement_bp.route("/api/statements/save_single", methods=["POST"])
@login_required
def save_single_statement():
    """
    Сохраняет стейтмент для ОДНОГО водителя:
      POST JSON: { "week_range": "MM/DD/YYYY - MM/DD/YYYY", "item": {...} }
    - approved всегда True
    - week_start_utc / week_end_utc считаются из week_range по таймзоне компании
    - все id -> ObjectId, все даты -> UTC naive
    - upsert по (company, driver_id, week_range)
    """
    from flask import request, jsonify
    from bson import ObjectId
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo
    import re
    from email.utils import parsedate_to_datetime as pdt

    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        payload = {}

    week_range = (payload.get("week_range") or "").strip()
    raw = payload.get("item") or {}
    if not week_range or not isinstance(raw, dict) or not raw.get("driver_id"):
        return jsonify({"success": False, "error": "week_range and item.driver_id required"}), 400

    # --- TZ из БД и преобразование week_range в UTC naive ---
    tz_doc  = db["company_timezone"].find_one({}) or {}
    tz_name = tz_doc.get("timezone") or "America/Chicago"
    local_tz = ZoneInfo(tz_name)
    utc_tz   = timezone.utc

    try:
        s_str, e_str = [x.strip() for x in week_range.split("-")]
        s_local = datetime.strptime(s_str, "%m/%d/%Y").replace(tzinfo=local_tz)
        e_local_excl = (datetime.strptime(e_str, "%m/%d/%Y") + timedelta(days=1)).replace(tzinfo=local_tz)
        week_start_utc = s_local.astimezone(utc_tz).replace(tzinfo=None)
        week_end_utc   = e_local_excl.astimezone(utc_tz).replace(tzinfo=None)
    except Exception:
        return jsonify({"success": False, "error": "Invalid week_range format"}), 400

    # --- локальные помощники (только внутри метода) ---
    HEX24 = re.compile(r"^[0-9a-f]{24}$", re.IGNORECASE)

    def to_oid(v):
        if isinstance(v, ObjectId) or v is None:
            return v
        if isinstance(v, str) and HEX24.match(v):
            try:
                return ObjectId(v)
            except Exception:
                pass
        return None

    def to_utc_naive(val):
        """Принимает ISO/строку/RFC2822/aware-datetime, возвращает UTC naive (datetime) или None."""
        if not val:
            return None
        # уже datetime?
        if isinstance(val, datetime):
            if val.tzinfo:
                return val.astimezone(utc_tz).replace(tzinfo=None)
            return val  # считаем, что уже UTC naive
        # строка
        s = str(val).strip()
        # сначала пробуем email/HTTP формат (например: 'Mon, 11 Aug 2025 17:08:16 GMT')
        try:
            d = pdt(s)
            if d:
                return d.astimezone(utc_tz).replace(tzinfo=None) if d.tzinfo else d.replace(tzinfo=None)
        except Exception:
            pass
        # пробуем обычные шаблоны
        for fmt in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%m/%d/%Y"):
            try:
                d = datetime.strptime(s, fmt)
                return d  # трактуем как UTC naive
            except Exception:
                pass
        # как последний шанс — ISO 8601
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return d.astimezone(utc_tz).replace(tzinfo=None) if d.tzinfo else d.replace(tzinfo=None)
        except Exception:
            return None

    # --- коллекции ---
    col          = db["statement"]
    drivers_col  = db["drivers"]
    trucks_col   = db["trucks"]
    companies_col = db["companies"]

    # --- справочники водителя/грузовика/компании ---
    driver_oid = to_oid(raw.get("driver_id"))
    if not isinstance(driver_oid, ObjectId):
        return jsonify({"success": False, "error": "Invalid driver_id"}), 400

    drv = drivers_col.find_one({"_id": driver_oid}, {"name": 1, "truck": 1, "hiring_company": 1})
    if not drv:
        return jsonify({"success": False, "error": "Driver not found"}), 404

    truck_id = drv.get("truck") if isinstance(drv.get("truck"), ObjectId) else None
    truck_number = None
    if truck_id:
        t = trucks_col.find_one({"_id": truck_id}, {"unit_number": 1})
        truck_number = t.get("unit_number") if t else None

    # --- loads: нормализация + подсчёт extra_stops_total ---
    loads_in = list(raw.get("loads") or [])
    loads_out = []
    extra_stops_total = 0
    for ld in loads_in:
        extra_stops_total += int(ld.get("extra_stops") or 0)
        # нормализуем extra_delivery (может быть dict/list/None) + даты
        ex = ld.get("extra_delivery")
        if isinstance(ex, list):
            ex_out = [
                {
                    **e,
                    "date":    to_utc_naive(e.get("date")),
                    "date_to": to_utc_naive(e.get("date_to")),
                } for e in ex if isinstance(e, dict)
            ]
        elif isinstance(ex, dict):
            ex_out = {
                **ex,
                "date":    to_utc_naive(ex.get("date")),
                "date_to": to_utc_naive(ex.get("date_to")),
            }
        else:
            ex_out = None

        loads_out.append({
            "_id": to_oid(ld.get("_id")),
            "load_id": ld.get("load_id") or "",
            "company_sign": to_oid(ld.get("company_sign")),
            "assigned_driver": to_oid(ld.get("assigned_driver")),
            "assigned_dispatch": to_oid(ld.get("assigned_dispatch")),
            "assigned_power_unit": to_oid(ld.get("assigned_power_unit")),
            "price": float(ld.get("price") or 0),
            "RPM": ld.get("RPM"),
            "pickup": {
                **(ld.get("pickup") or {}),
                "date":      to_utc_naive((ld.get("pickup") or {}).get("date")),
                "date_to":   to_utc_naive((ld.get("pickup") or {}).get("date_to")),
                "picked_up": to_utc_naive((ld.get("pickup") or {}).get("picked_up")),
            },
            "delivery": {
                **(ld.get("delivery") or {}),
                "date":        to_utc_naive((ld.get("delivery") or {}).get("date")),
                "date_to":     to_utc_naive((ld.get("delivery") or {}).get("date_to")),
                "delivered_at":to_utc_naive((ld.get("delivery") or {}).get("delivered_at")),
            },
            "extra_delivery": ex_out,
            "extra_stops": int(ld.get("extra_stops") or 0),
            "pickup_date":   to_utc_naive(ld.get("pickup_date")),
            "delivery_date": to_utc_naive(ld.get("delivery_date")),
            "out_of_diap":   bool(ld.get("out_of_diap")),
        })

    # --- expenses ---
    expenses_in = list(raw.get("expenses") or [])
    expenses_out = []
    invoices_num = 0
    for e in expenses_in:
        removed = bool(e.get("removed"))
        if not removed:
            invoices_num += 1
        expenses_out.append({
            "_id": to_oid(e.get("_id")),
            "amount": float(e.get("amount") or 0),
            "category": e.get("category") or "",
            "note": e.get("note") or "",
            "date": to_utc_naive(e.get("date")),
            "photo_id": to_oid(e.get("photo_id")),
            "action": (e.get("action") or "keep"),
            "removed": removed,
        })

    # --- inspections ---
    inspections_out = []
    for i in list(raw.get("inspections") or []):
        inspections_out.append({
            "_id": to_oid(i.get("_id")),
            "address": i.get("address") or "",
            "state": i.get("state") or "",
            "clean_inspection": bool(i.get("clean_inspection")),
            "date":       to_utc_naive(i.get("date")),
            "created_at": to_utc_naive(i.get("created_at")),
            "start_time": i.get("start_time"),
            "end_time":   i.get("end_time"),
        })

    # --- топливо/схема/пробег/калькуляция ---
    fuel_in = raw.get("fuel") or {}
    fuel_out = {
        "qty": float(fuel_in.get("qty") or 0),
        "retail": float(fuel_in.get("retail") or 0),
        "invoice": float(fuel_in.get("invoice") or 0),
        "cards": list(fuel_in.get("cards") or []),
    }

    scheme_in = raw.get("scheme") or {}
    scheme_out = {
        "scheme_type": scheme_in.get("scheme_type") or "percent",
        "commission_table": list(scheme_in.get("commission_table") or []),
        "per_mile_rate": float(scheme_in.get("per_mile_rate") or 0),
        "deductions": list(scheme_in.get("deductions") or []),
        "enable_inspection_bonus": bool(scheme_in.get("enable_inspection_bonus", False)),
        "bonus_level_1": float(scheme_in.get("bonus_level_1") or 0),
        "bonus_level_2": float(scheme_in.get("bonus_level_2") or 0),
        "bonus_level_3": float(scheme_in.get("bonus_level_3") or 0),
        # поля для экстра-стопов
        "enable_extra_stop_bonus": bool(scheme_in.get("enable_extra_stop_bonus", False)),
        "extra_stop_bonus_amount": float(scheme_in.get("extra_stop_bonus_amount") or 0),
    }

    mileage_in = raw.get("mileage") or {}
    mileage_out = {
        "miles": float(mileage_in.get("miles") or 0),
        "meters": float(mileage_in.get("meters") or 0),
        "source": mileage_in.get("source"),
        "truck_id": to_oid(mileage_in.get("truck_id")),
        "samsara_vehicle_id": to_oid(mileage_in.get("samsara_vehicle_id")),
    }

    calc_in = raw.get("calc") or {}
    calc_out = {
        "loads_gross": float(calc_in.get("loads_gross") or 0),
        "gross_add_from_expenses": float(calc_in.get("gross_add_from_expenses") or 0),
        "gross_deduct_from_expenses": float(calc_in.get("gross_deduct_from_expenses") or 0),
        "gross_for_commission": float(calc_in.get("gross_for_commission") or 0),
        "commission": float(calc_in.get("commission") or 0),
        "scheme_deductions_total": float(calc_in.get("scheme_deductions_total") or 0),
        "salary_add_from_expenses": float(calc_in.get("salary_add_from_expenses") or 0),
        "salary_deduct_from_expenses": float(calc_in.get("salary_deduct_from_expenses") or 0),
        # Итог по экстра-стопам: берём из calc если уже посчитан на фронте, иначе — из подсчёта здесь
        "extra_stops_total": int(calc_in.get("extra_stops_total") or extra_stops_total),
        "extra_stop_bonus_total": float(calc_in.get("extra_stop_bonus_total") or 0),
        "final_salary": float(calc_in.get("final_salary") or 0),
    }

    now = datetime.utcnow()
    doc = {
        "company": current_user.company,
        "week_range": week_range,
        "week_start_utc": week_start_utc,
        "week_end_utc": week_end_utc,
        "driver_id": driver_oid,
        "driver_name": drv.get("name"),
        "hiring_company": drv.get("hiring_company"),
        "truck_id": truck_id,
        "truck_number": truck_number,

        "salary": calc_out["final_salary"],
        "commission": calc_out["commission"],
        "miles": mileage_out["miles"],
        "scheme_type": scheme_out["scheme_type"],
        "per_mile_rate": scheme_out["per_mile_rate"],

        "monday_loads": int(raw.get("monday_loads") or 0),
        "invoices_num": invoices_num,
        "inspections_num": len(inspections_out),
        "extra_stops_total": int(calc_out["extra_stops_total"]),

        "raw": {
            "loads": loads_out,
            "fuel": fuel_out,
            "expenses": expenses_out,
            "inspections": inspections_out,
            "scheme": scheme_out,
            "mileage": mileage_out,
            "calc": calc_out,
        },

        "approved": True,
        "created_at": now,
        "updated_at": now,
    }

    # upsert по (company, driver_id, week_range)
    flt = {"company": current_user.company, "driver_id": driver_oid, "week_range": week_range}
    existing = col.find_one(flt, {"_id": 1, "created_at": 1})
    if existing:
        doc["created_at"] = existing.get("created_at") or now
        col.replace_one({"_id": existing["_id"]}, doc, upsert=False)
        return jsonify({"success": True, "status": "replaced", "_id": str(existing["_id"])})
    else:
        ins = col.insert_one(doc)
        return jsonify({"success": True, "status": "added", "_id": str(ins.inserted_id)})
