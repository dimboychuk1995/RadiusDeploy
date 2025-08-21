# statement_mobile_api.py
from __future__ import annotations

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from bson import ObjectId
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from tools.db import db

# те же коллекции, что и в statement.py
drivers_collection = db["drivers"]
trucks_collection = db["trucks"]
statement_collection = db["statement"]
loads_collection = db["loads"]
expenses_collection = db["driver_expenses"]
inspections_collection = db["inspections"]

statement_mobile_bp = Blueprint("statement_mobile_api", __name__)

# ---------- helpers ----------

def _to_oid(v):
    if isinstance(v, ObjectId):
        return v
    if isinstance(v, str) and len(v) == 24:
        try:
            return ObjectId(v)
        except Exception:
            return None
    return None

def _soid(v):
    return str(v) if isinstance(v, ObjectId) else (str(v) if v and type(v).__name__ == "ObjectId" else (v if isinstance(v, str) else None))

def _iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    # в базе даты храним наивные UTC → считаем их UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()

def _loc_date(dt: datetime | None, tz_name: str) -> str | None:
    if not dt:
        return None
    tz = ZoneInfo(tz_name)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz).strftime("%m/%d/%Y")

def _company_tz() -> str:
    doc = db["company_timezone"].find_one({}) or {}
    return doc.get("timezone") or "America/Chicago"

def _final_salary(doc: dict) -> float:
    # стараемся отдать то, что уже посчитано при сохранении
    raw = doc.get("raw") or {}
    calc = raw.get("calc") or {}
    if isinstance(calc.get("final_salary"), (int, float)):
        return round(float(calc["final_salary"]), 2)
    if isinstance(doc.get("salary"), (int, float)):
        return round(float(doc["salary"]), 2)
    return 0.0

def _summary_json(doc: dict, tz_name: str) -> dict:
    return {
        "id": _soid(doc.get("_id")),
        "company": doc.get("company"),
        "driver_id": _soid(doc.get("driver_id")),
        "driver_name": doc.get("driver_name"),
        "hiring_company": _soid(doc.get("hiring_company")),
        "truck_id": _soid(doc.get("truck_id")),
        "truck_number": doc.get("truck_number"),
        "week_range": doc.get("week_range"),
        "week_start_utc": _iso(doc.get("week_start_utc")),
        "week_end_utc": _iso(doc.get("week_end_utc")),
        "created_at": _iso(doc.get("created_at")),
        "updated_at": _iso(doc.get("updated_at")),
        "created_local": _loc_date(doc.get("created_at"), tz_name),
        "approved": bool(doc.get("approved", False)),
        "confirmed": bool(doc.get("confirmed", False)),
        "monday_loads": int(doc.get("monday_loads") or 0),
        "invoices_num": int(doc.get("invoices_num") or 0),
        "inspections_num": int(doc.get("inspections_num") or 0),
        "extra_stops_total": int(doc.get("extra_stops_total") or 0),
        "miles": float(doc.get("miles") or 0),
        "scheme_type": doc.get("scheme_type"),
        "per_mile_rate": float(doc.get("per_mile_rate") or 0),
        "commission": float(doc.get("commission") or 0),
        "salary": _final_salary(doc),   # для мобильного показываем конечную зарплату
    }

def _load_item_for_mobile(load: dict, tz_name: str) -> dict:
    pickup = (load.get("pickup") or {})
    delivery = (load.get("delivery") or {})

    def _date_from(node):
        d = node.get("date")
        return _iso(d)

    def _date_local_from(node):
        d = node.get("date")
        return _loc_date(d, tz_name)

    # extra_delivery может быть dict | list | None
    extra = load.get("extra_delivery")
    if isinstance(extra, dict):
        extra_arr = [extra]
    elif isinstance(extra, list):
        extra_arr = extra
    else:
        extra_arr = []

    return {
        "_id": _soid(load.get("_id")),
        "load_id": load.get("load_id"),
        "price": float(load.get("price") or 0),
        "rpm": load.get("RPM"),
        "company_sign": _soid(load.get("company_sign")),
        "assigned_driver": _soid(load.get("assigned_driver")),
        "assigned_dispatch": _soid(load.get("assigned_dispatch")),
        "assigned_power_unit": _soid(load.get("assigned_power_unit")),
        "pickup": {
            "company": pickup.get("company"),
            "address": pickup.get("address"),
            "date_utc": _date_from(pickup),
            "date_local": _date_local_from(pickup),
            "time_from": pickup.get("time_from"),
            "time_to": pickup.get("time_to"),
        },
        "delivery": {
            "company": delivery.get("company"),
            "address": delivery.get("address"),
            "date_utc": _date_from(delivery),
            "date_local": _date_local_from(delivery),
            "time_from": delivery.get("time_from"),
            "time_to": delivery.get("time_to"),
        },
        "extra_delivery": [
            {
                "company": (ed or {}).get("company"),
                "address": (ed or {}).get("address"),
                "date_utc": _iso((ed or {}).get("date")),
                "date_local": _loc_date((ed or {}).get("date"), tz_name),
                "time_from": (ed or {}).get("time_from"),
                "time_to": (ed or {}).get("time_to"),
            }
            for ed in extra_arr
        ],
        "extra_stops": int(load.get("extra_stops") or 0),
        "out_of_diap": bool(load.get("out_of_diap", False)),
    }

def _expense_item_for_mobile(e: dict, tz_name: str) -> dict:
    return {
        "_id": _soid(e.get("_id")),
        "amount": float(e.get("amount") or 0),
        "category": e.get("category"),
        "note": e.get("note"),
        "date_utc": _iso(e.get("date")),
        "date_local": _loc_date(e.get("date"), tz_name),
        "photo_id": _soid(e.get("photo_id")),
        "action": e.get("action") or "keep",
        "removed": bool(e.get("removed", False)),
    }

def _inspection_item_for_mobile(i: dict, tz_name: str) -> dict:
    return {
        "_id": _soid(i.get("_id")),
        "clean_inspection": bool(i.get("clean_inspection", False)),
        "state": i.get("state"),
        "address": i.get("address"),
        "date_utc": _iso(i.get("date")),
        "date_local": _loc_date(i.get("date"), tz_name),
        "created_at": _iso(i.get("created_at")),
        "start_time": i.get("start_time"),
        "end_time": i.get("end_time"),
    }

def _details_json(doc: dict, tz_name: str) -> dict:
    out = _summary_json(doc, tz_name)

    raw = doc.get("raw") or {}
    loads = raw.get("loads") or []
    expenses = raw.get("expenses") or []
    inspections = raw.get("inspections") or []
    fuel = raw.get("fuel") or {}
    mileage = raw.get("mileage") or {}
    scheme = raw.get("scheme") or {}
    calc = raw.get("calc") or {}

    out["raw"] = {
        "loads": [_load_item_for_mobile(ld, tz_name) for ld in loads],
        "expenses": [_expense_item_for_mobile(e, tz_name) for e in expenses],
        "inspections": [_inspection_item_for_mobile(i, tz_name) for i in inspections],
        "fuel": {
            "qty": float(fuel.get("qty") or 0),
            "retail": float(fuel.get("retail") or 0),
            "invoice": float(fuel.get("invoice") or 0),
            "cards": fuel.get("cards") or [],
        },
        "mileage": {
            "miles": float(mileage.get("miles") or 0),
            "meters": float(mileage.get("meters") or 0),
            "source": mileage.get("source"),
            "truck_id": _soid(mileage.get("truck_id")),
            "samsara_vehicle_id": _soid(mileage.get("samsara_vehicle_id")),
        },
        "scheme": {
            "scheme_type": scheme.get("scheme_type") or doc.get("scheme_type"),
            "commission_table": scheme.get("commission_table") or [],
            "per_mile_rate": float(scheme.get("per_mile_rate") or 0),
            "deductions": scheme.get("deductions") or [],
            "enable_inspection_bonus": bool(scheme.get("enable_inspection_bonus", False)),
            "bonus_level_1": float(scheme.get("bonus_level_1") or 0),
            "bonus_level_2": float(scheme.get("bonus_level_2") or 0),
            "bonus_level_3": float(scheme.get("bonus_level_3") or 0),
            "enable_extra_stop_bonus": bool(scheme.get("enable_extra_stop_bonus", False)),
            "extra_stop_bonus_amount": float(scheme.get("extra_stop_bonus_amount") or 0),
        },
        "calc": {
            "loads_gross": float(calc.get("loads_gross") or 0),
            "gross_add_from_expenses": float(calc.get("gross_add_from_expenses") or 0),
            "gross_deduct_from_expenses": float(calc.get("gross_deduct_from_expenses") or 0),
            "gross_for_commission": float(calc.get("gross_for_commission") or 0),
            "commission": float(calc.get("commission") or 0),
            "scheme_deductions_total": float(calc.get("scheme_deductions_total") or 0),
            "salary_add_from_expenses": float(calc.get("salary_add_from_expenses") or 0),
            "salary_deduct_from_expenses": float(calc.get("salary_deduct_from_expenses") or 0),
            "extra_stops_total": int(calc.get("extra_stops_total") or 0),
            "extra_stop_bonus_total": float(calc.get("extra_stop_bonus_total") or 0),
            "final_salary": _final_salary(doc),
        },
    }
    return out

# ---------- API ----------

@statement_mobile_bp.route("/api/mobile/statements/driver_last5", methods=["GET"])
@login_required
def mobile_driver_last5():
    """
    Возвращает последние 5 стейтментов выбранного водителя.
    Параметры:
      - driver_id: обязательный
      - include_unapproved: 0/1 (по умолчанию 0 — только approved)
    """
    driver_id = request.args.get("driver_id", "").strip()
    if not driver_id:
        return jsonify({"success": False, "error": "driver_id is required"}), 400

    driver_oid = _to_oid(driver_id)
    if not driver_oid:
        return jsonify({"success": False, "error": "invalid driver_id"}), 400

    include_unapproved = str(request.args.get("include_unapproved", "0")).lower() in ("1", "true", "yes")
    query = {"driver_id": driver_oid}
    if not include_unapproved:
        query["approved"] = True

    tz_name = _company_tz()

    docs = list(
        statement_collection
        .find(query)
        .sort("created_at", -1)
        .limit(5)
    )

    items = [_summary_json(d, tz_name) for d in docs]
    return jsonify({"success": True, "count": len(items), "items": items})


@statement_mobile_bp.route("/api/mobile/statements/details", methods=["GET"])
@login_required
def mobile_statement_details():
    """
    Возвращает детализированный стейтмент для мобильного.
    Параметры:
      - id: обязательный (_id стейтмента)
    """
    sid = request.args.get("id", "").strip()
    if not sid:
        return jsonify({"success": False, "error": "id is required"}), 400

    stmt_oid = _to_oid(sid)
    if not stmt_oid:
        return jsonify({"success": False, "error": "invalid id"}), 400

    doc = statement_collection.find_one({"_id": stmt_oid})
    if not doc:
        return jsonify({"success": False, "error": "not found"}), 404

    tz_name = _company_tz()
    return jsonify({"success": True, "statement": _details_json(doc, tz_name)})
