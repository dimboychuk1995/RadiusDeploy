from zoneinfo import ZoneInfo
from flask import Blueprint
from tools.db import db
from flask import render_template, request
from flask_login import login_required
from datetime import datetime, timedelta, time, timezone
from collections import defaultdict

dispatch_schedule_bp = Blueprint("dispatch_schedule", __name__)


@dispatch_schedule_bp.route("/fragment/dispatch_schedule")
@login_required
def dispatch_schedule_fragment():
    tz_doc = db.company_timezone.find_one({})
    tz_name = tz_doc.get("timezone", "America/Chicago")
    tz = ZoneInfo(tz_name)

    start_str = request.args.get("start")
    end_str = request.args.get("end")

    if start_str and end_str:
        start_of_week = datetime.strptime(start_str, "%Y-%m-%d").date()
        end_of_week = datetime.strptime(end_str, "%Y-%m-%d").date()
    else:
        now_local = datetime.now(tz)
        today = now_local.date()
        start_of_week = today - timedelta(days=today.weekday())
        end_of_week = start_of_week + timedelta(days=6)

    current_week_dates = [start_of_week + timedelta(days=i) for i in range(7)]

    # Диспетчеры
    dispatchers = list(db.users.find({"role": "dispatch"}, {"_id": 1, "username": 1}))
    for dispatcher in dispatchers:
        dispatcher["id"] = str(dispatcher.pop("_id"))

    # Водители и траки
    drivers = list(db.drivers.find({}, {
        "_id": 1, "name": 1, "contact_number": 1, "email": 1, "truck": 1, "dispatcher": 1
    }))
    trucks = list(db.trucks.find({}, {"_id": 1, "unit_number": 1}))
    for truck in trucks:
        truck["id"] = str(truck.pop("_id"))
    truck_map = {truck["id"]: truck for truck in trucks}

    for driver in drivers:
        driver["id"] = str(driver.pop("_id"))
        if driver.get("dispatcher"):
            driver["dispatcher"] = str(driver["dispatcher"])
        raw_truck = driver.get("truck")
        if raw_truck:
            truck_id = str(raw_truck)
            driver["truck"] = truck_id
            driver["truck_info"] = truck_map.get(truck_id, {})
        else:
            driver["truck"] = None
            driver["truck_info"] = {}

    # Грузы
    all_loads = list(db.loads.find({}))
    loads = []
    driver_delivery_map = defaultdict(list)

    def parse_city_state(address):
        if not address:
            return None, None
        try:
            parts = address.split(',')
            city = parts[-2].strip() if len(parts) >= 2 else ''
            state_zip = parts[-1].strip()
            state = state_zip.split()[0] if state_zip else ''
            return city, state
        except Exception:
            return None, None

    def safe_float(value):
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    for load in all_loads:
        extra_delivery = load.get("extra_delivery", [])
        main_delivery = load.get("delivery")
        price = safe_float(load.get("price"))
        load_id = str(load.get("_id"))
        driver_id = str(load.get("assigned_driver"))
        all_deliveries = []

        if isinstance(extra_delivery, list) and extra_delivery:
            for i, delivery_info in enumerate(extra_delivery):
                all_deliveries.append({
                    "info": delivery_info,
                    "is_last": i == len(extra_delivery) - 1
                })
            if main_delivery:
                all_deliveries.append({"info": main_delivery, "is_last": False})
        else:
            if main_delivery:
                all_deliveries.append({"info": main_delivery, "is_last": True})

        for delivery in all_deliveries:
            delivery_info = delivery["info"]
            date_str = delivery_info.get("date", "").strip()
            try:
                delivery_date = datetime.strptime(date_str, "%m/%d/%Y").date()
                if not (start_of_week <= delivery_date <= end_of_week):
                    continue
            except Exception:
                continue

            address = delivery_info.get("address", "")
            city, state = parse_city_state(address)
            location_str = f"{city}, {state}" if city and state else address

            driver_delivery_map[(driver_id, date_str)].append({
                "address": address,
                "city": city,
                "state": state,
                "location": location_str,
                "load_id": load_id,
                "price": price,
                "description": load.get("description", "Delivery"),
                "is_last": delivery["is_last"]
            })

        loads.append(load)

    # Таймзона
    tz_doc = db.company_timezone.find_one({})
    tz_name = tz_doc.get("timezone", "America/Chicago")
    tz = ZoneInfo(tz_name)

    # Брейки
    breaks_cursor = db.drivers_brakes.find({
        "start_date": {"$lte": datetime.combine(end_of_week, datetime.max.time())},
        "end_date": {"$gte": datetime.combine(start_of_week, datetime.min.time())}
    })

    driver_breaks = []
    driver_break_map = defaultdict(list)

    for br in breaks_cursor:
        start_utc = br["start_date"]
        end_utc = br["end_date"]
        driver_id = str(br["driver_id"])
        reason = br.get("reason", "")

        print(f"\n=== DRIVER BREAK ===")
        print(f"Original UTC start: {start_utc} | end: {end_utc}")

        start_local = start_utc.replace(tzinfo=timezone.utc).astimezone(tz)
        end_local = end_utc.replace(tzinfo=timezone.utc).astimezone(tz)

        print(f"Chicago LOCAL start: {start_local} | end: {end_local}")
        print("====================\n")

        start_date_local = start_local.date()

        if end_local.time() == time(0, 0):
            end_date_local = (end_local - timedelta(seconds=1)).date()
        else:
            end_date_local = end_local.date()

        current = start_date_local
        while current <= end_date_local:
            date_str = current.strftime("%m/%d/%Y")
            driver_break_map[(driver_id, date_str)].append(reason)
            current += timedelta(days=1)

        driver_breaks.append({
            "id": str(br["_id"]),
            "driver_id": driver_id,
            "reason": reason,
            "start_date": start_date_local.strftime("%Y-%m-%d"),
            "end_date": end_date_local.strftime("%Y-%m-%d")
        })

    return render_template("fragments/dispatch_schedule_fragment.html",
                           page_id="dispatch-table",
                           dispatchers=dispatchers,
                           drivers=drivers,
                           trucks=trucks,
                           loads=loads,
                           current_week_dates=current_week_dates,
                           driver_delivery_map=driver_delivery_map,
                           driver_breaks=driver_breaks,
                           driver_break_map=driver_break_map)