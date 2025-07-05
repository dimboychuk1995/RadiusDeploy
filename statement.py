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
        print("Driver ID:", driver_id)
        print("Start:", start_date)
        print("End:", end_date)
        print("Query:", query)

        loads = list(loads_collection.find(query))
        print("Found loads:", len(loads))
        print("===============================\n")

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

        # 1. Find all cards assigned to driver
        fuel_cards = list(fuel_cards_collection.find({
            "assigned_driver": ObjectId(driver_id)
        }))

        card_numbers = [c.get("card_number") for c in fuel_cards if c.get("card_number")]

        if not card_numbers:
            return jsonify({
                "success": True,
                "fuel": {
                    "qty": 0.0,
                    "retail": 0.0,
                    "invoice": 0.0,
                    "cards": []
                }
            })

        # 2. Find transactions in range
        query = {
            "card_number": {"$in": card_numbers},
            "date": {"$gte": start_date, "$lt": end_date}
        }

        transactions = list(fuel_cards_transactions_collection.find(query))

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
        print("Exception in /api/driver_fuel_summary:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})


@statement_bp.route("/api/driver_commission_scheme", methods=["GET"])
def get_driver_commission_scheme():
    try:
        driver_id = request.args.get("driver_id")
        if not driver_id:
            return jsonify({"success": False, "error": "Missing driver_id"}), 400

        driver = drivers_collection.find_one({"_id": ObjectId(driver_id)})
        if not driver:
            return jsonify({"success": False, "error": "Driver not found"}), 404

        # Безопасно получить тип схемы
        scheme_info = driver.get("net_commission_table") or {}
        scheme_type = scheme_info.get("type", "percent")

        commission_table = driver.get("commission_table", [])

        return jsonify({
            "success": True,
            "scheme_type": scheme_type,
            "commission_table": commission_table
        })

    except Exception as e:
        import traceback
        print("Exception in /api/driver_commission_scheme:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})




