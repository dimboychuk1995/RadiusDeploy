from datetime import datetime, timedelta

from bson import ObjectId
from flask import Blueprint, render_template, request, jsonify
from tools.db import db

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

        print("\n=== [Driver Statement Debug] ===")
        print(f"driver_id: {driver_id}")
        print(f"week_range: {week_range}")
        print(f"start_date (inclusive): {start_date.isoformat()}")
        print(f"end_date (exclusive): {end_date.isoformat()}")
        print("Mongo query:", query)

        loads = list(loads_collection.find(query))
        print(f"Found loads: {len(loads)}")

        # Печатаем даты delivery и extra_delivery найденных грузов
        for i, load in enumerate(loads[:10]):  # максимум 10 для отладки
            d = load.get("delivery", {}).get("date")
            ed = load.get("extra_delivery", {}).get("date")
            print(f"Load {i+1}:")
            print("  delivery.date:       ", d.isoformat() if d else None)
            print("  extra_delivery.date: ", ed.isoformat() if ed else None)

        print("=== End Debug ===\n")

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
        print("Exception in /api/driver_statement_loads:")
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

        print("\n=== [Fuel Summary Debug] ===")
        print(f"driver_id: {driver_id}")
        print(f"week_range: {week_range}")
        print(f"start_date (inclusive): {start_date.isoformat()}")
        print(f"end_date (exclusive): {end_date.isoformat()}")

        fuel_cards = list(fuel_cards_collection.find({
            "assigned_driver": ObjectId(driver_id)
        }))

        card_numbers = [c.get("card_number") for c in fuel_cards if c.get("card_number")]
        print(f"Assigned card numbers: {card_numbers}")

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
        print("Mongo query for transactions:", query)

        transactions = list(fuel_cards_transactions_collection.find(query))
        print(f"Found transactions: {len(transactions)}")
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

        print("Total fuel summary:", fuel)
        print("=== End Debug ===\n")

        return jsonify({"success": True, "fuel": fuel})

    except Exception as e:
        import traceback
        print("Exception in /api/driver_fuel_summary:")
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
        driver_id = request.args.get("driver_id")
        start_str = request.args.get("start_date")
        end_str = request.args.get("end_date")

        if not driver_id or not start_str or not end_str:
            return jsonify({"success": False, "error": "Missing parameters"}), 400

        start_date = datetime.strptime(start_str, "%m/%d/%Y")
        end_date = datetime.strptime(end_str, "%m/%d/%Y") + timedelta(days=1)

        print("\n=== [Inspection Debug] ===")
        print(f"driver_id: {driver_id}")
        print(f"start_date (inclusive): {start_date.isoformat()}")
        print(f"end_date (exclusive): {end_date.isoformat()}")

        query = {
            "driver": ObjectId(driver_id),
            "created_at": {"$gte": start_date, "$lt": end_date}
        }
        print("Mongo query:", query)

        inspections = list(db["inspections"].find(query))
        print(f"Found inspections: {len(inspections)}")
        for i, insp in enumerate(inspections[:10]):
            print(f"  Inspection {i+1}: clean={insp.get('clean_inspection')} | created_at={insp.get('created_at')}")

        print("=== End Debug ===\n")

        result = []
        for i in inspections:
            result.append({
                "_id": str(i["_id"]),
                "date": i.get("date", ""),
                "start_time": i.get("start_time", ""),
                "end_time": i.get("end_time", ""),
                "state": i.get("state", ""),
                "address": i.get("address", ""),
                "clean_inspection": i.get("clean_inspection", False),
                "created_at": i["created_at"].strftime("%m/%d/%Y %H:%M:%S") if i.get("created_at") else None
            })

        return jsonify({
            "success": True,
            "inspections": result,
            "count": len(result)
        })

    except Exception as e:
        import traceback
        print("Exception in /api/driver_inspections_by_range:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})
    


@statement_bp.route("/api/driver_expenses_by_range", methods=["GET"])
def get_driver_expenses_by_range():
    try:
        driver_id = request.args.get("driver_id")
        start_str = request.args.get("start_date")
        end_str = request.args.get("end_date")

        if not driver_id or not start_str or not end_str:
            return jsonify({"success": False, "error": "Missing parameters"}), 400

        start_date = datetime.strptime(start_str, "%m/%d/%Y")
        end_date = datetime.strptime(end_str, "%m/%d/%Y") + timedelta(days=1)

        print("\n=== [Driver Expenses Debug] ===")
        print(f"driver_id: {driver_id}")
        print(f"start_date (inclusive): {start_date.isoformat()}")
        print(f"end_date (exclusive): {end_date.isoformat()}")

        query = {
            "driver_id": ObjectId(driver_id),
            "created_at": {"$gte": start_date, "$lt": end_date}
        }
        print("Mongo query:", query)

        expenses = list(db["driver_expenses"].find(query))
        print(f"Found expenses: {len(expenses)}")
        for i, e in enumerate(expenses[:10]):
            print(f"  Expense {i+1}: ${e.get('amount')} | category={e.get('category')} | created_at={e.get('created_at')}")

        print("=== End Debug ===\n")

        result = []
        for e in expenses:
            result.append({
                "_id": str(e["_id"]),
                "amount": e.get("amount", 0),
                "category": e.get("category", ""),
                "note": e.get("note", ""),
                "date": e.get("date").strftime("%m/%d/%Y") if e.get("date") else "",
                "created_at": e["created_at"].strftime("%m/%d/%Y %H:%M:%S") if e.get("created_at") else None,
                "photo_id": str(e["photo_id"]) if e.get("photo_id") else None
            })

        return jsonify({
            "success": True,
            "expenses": result,
            "count": len(result)
        })

    except Exception as e:
        import traceback
        print("Exception in /api/driver_expenses_by_range:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     