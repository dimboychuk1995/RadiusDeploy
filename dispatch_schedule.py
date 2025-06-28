from flask import Blueprint, render_template, request
from flask_login import login_required
from tools.db import db  # путь подстрой под свой
from bson import ObjectId
from collections import defaultdict
dispatch_schedule_bp = Blueprint("dispatch_schedule", __name__)

from datetime import datetime, timedelta


@dispatch_schedule_bp.route("/fragment/dispatch_schedule")
@login_required
def dispatch_schedule_fragment():
    start_str = request.args.get("start")
    end_str = request.args.get("end")

    if start_str and end_str:
        start_of_week = datetime.strptime(start_str, "%Y-%m-%d").date()
        end_of_week = datetime.strptime(end_str, "%Y-%m-%d").date()
    else:
        today = datetime.utcnow().date()
        start_of_week = today - timedelta(days=today.weekday())
        end_of_week = start_of_week + timedelta(days=6)

    current_week_dates = [start_of_week + timedelta(days=i) for i in range(7)]

    # Диспетчеры
    dispatchers = list(db.users.find({"role": "dispatch"}, {
        "_id": 1,
        "username": 1
    }))
    for dispatcher in dispatchers:
        dispatcher["id"] = str(dispatcher.pop("_id"))

    # Водители
    drivers = list(db.drivers.find({}, {
        "_id": 1,
        "name": 1,
        "contact_number": 1,
        "email": 1,
        "truck": 1,
        "dispatcher": 1
    }))

    # Траки
    trucks = list(db.trucks.find({}, {
        "_id": 1,
        "unit_number": 1
    }))
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

    # Грузы и deliveries
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

    for load in all_loads:
        delivery_points = []

        if isinstance(load.get("extra_delivery"), list):
            delivery_points.extend(load["extra_delivery"])
        if load.get("delivery"):
            delivery_points.append(load["delivery"])

        for delivery_info in delivery_points:
            date_str = delivery_info.get("date", "").strip()
            try:
                delivery_date = datetime.strptime(date_str, "%m/%d/%Y").date()
                if not (start_of_week <= delivery_date <= end_of_week):
                    continue
            except Exception as e:
                print(f"Invalid delivery date '{date_str}' in load {load.get('_id')}: {e}")
                continue

            driver_id = str(load.get("assigned_driver"))
            address = delivery_info.get("address", "")
            city, state = parse_city_state(address)
            location_str = f"{city}, {state}" if city and state else address

            driver_delivery_map[(driver_id, date_str)].append({
                "address": address,
                "city": city,
                "state": state,
                "location": location_str,
                "load_id": str(load.get("_id")),
                "description": load.get("description", "Delivery")
            })

            loads.append(load)

    return render_template("fragments/dispatch_schedule_fragment.html",
                           page_id="dispatch-table",
                           dispatchers=dispatchers,
                           drivers=drivers,
                           trucks=trucks,
                           loads=loads,
                           current_week_dates=current_week_dates,
                           driver_delivery_map=driver_delivery_map)