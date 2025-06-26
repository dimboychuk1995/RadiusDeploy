from flask import Blueprint, render_template
from flask_login import login_required
from tools.db import db  # путь подстрой под свой
from bson import ObjectId

dispatch_schedule_bp = Blueprint("dispatch_schedule", __name__)

@dispatch_schedule_bp.route("/fragment/dispatch_schedule")
@login_required
def dispatch_schedule_fragment():
    # Получаем диспетчеров
    dispatchers = list(db.users.find({"role": "dispatch"}, {
        "_id": 1,
        "username": 1
    }))

    # Получаем водителей
    drivers = list(db.drivers.find({}, {
        "_id": 1,
        "name": 1,
        "contact_number": 1,
        "email": 1,
        "truck": 1,
        "dispatcher": 1
    }))

    # Получаем траки
    trucks = list(db.trucks.find({}, {
        "_id": 1,
        "unit_number": 1
    }))

    # Преобразуем ObjectId → str
    for dispatcher in dispatchers:
        dispatcher["id"] = str(dispatcher.pop("_id"))

    for truck in trucks:
        truck["id"] = str(truck.pop("_id"))

    # Мапа: truck_id (str) → truck объект
    truck_map = {truck["id"]: truck for truck in trucks}

    # Привязка трака к водителю
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

    # Отладка
    print("\n=== TRUCK MAP ===")
    for k, v in truck_map.items():
        print(f"Truck ID: {k} → Unit: {v.get('unit_number')}")

    print("\n=== DRIVERS ===")
    for d in drivers:
        unit = d["truck_info"].get("unit_number", "—")
        print(f"{d['name']} → truck: {d.get('truck')} → Unit: {unit}")

    # Грузы пока игнорируем
    loads = []

    return render_template("fragments/dispatch_schedule_fragment.html",
                           page_id="dispatch-table",
                           dispatchers=dispatchers,
                           drivers=drivers,
                           trucks=trucks,
                           loads=loads)
