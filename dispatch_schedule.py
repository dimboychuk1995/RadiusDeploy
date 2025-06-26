from flask import Blueprint, render_template
from flask_login import login_required
from tools.db import db  # путь подстрой под свой
from bson import ObjectId

dispatch_schedule_bp = Blueprint("dispatch_schedule", __name__)

@dispatch_schedule_bp.route("/fragment/dispatch_schedule")
@login_required
def dispatch_schedule_fragment():
    # Пользователи с ролью "dispatch"
    dispatchers = list(db.users.find({"role": "dispatch"}, {
        "_id": 1,
        "username": 1
    }))

    # Водители
    drivers = list(db.drivers.find({}, {
        "_id": 1,
        "name": 1,
        "contact_number": 1,
        "email": 1,
        "truck": 1,
        "dispatcher": 1,
        "hiring_company": 1
    }))

    # Траки
    trucks = list(db.trucks.find({}, {
        "_id": 1,
        "Unit_number": 1,
        "make": 1,
        "model": 1,
        "year": 1,
        "assigned_driver_id": 1,
        "owning_company": 1
    }))

    # Грузы
    loads = list(db.loads.find({}))  # все поля

    # Преобразование ObjectId → str
    for lst in [dispatchers, drivers, trucks, loads]:
        for doc in lst:
            doc["id"] = str(doc.pop("_id"))

    return render_template("fragments/dispatch_schedule_fragment.html", page_id="dispatch-table",
                           dispatchers=dispatchers,
                           drivers=drivers,
                           trucks=trucks,
                           loads=loads)
