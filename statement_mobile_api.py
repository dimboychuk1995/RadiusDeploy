# statement_mobile_api.py
from __future__ import annotations

from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from datetime import datetime
from tools.jwt_auth import jwt_required
from tools.db import db

# Блюпринт
statement_mobile_bp = Blueprint("statement_mobile_api", __name__)

# Коллекции (имена как в проекте)
drivers_collection = db["drivers"]
statement_collection = db["statement"]  # ВАЖНО: единичное имя коллекции

# ----------------- helpers (минимум) -----------------

def _to_oid(v) -> ObjectId | None:
    try:
        return ObjectId(v) if v and ObjectId.is_valid(v) else None
    except Exception:
        return None

def _jsonify_value(v):
    """Минимальная безопасная сериализация для деталей:
    - ObjectId -> str
    - datetime -> ISO (без TZ-конвертаций)
    - list/dict -> рекурсивно
    Остальное отдаём как есть.
    """
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, datetime):
        try:
            return v.isoformat()
        except Exception:
            return str(v)
    if isinstance(v, list):
        return [_jsonify_value(x) for x in v]
    if isinstance(v, dict):
        return {k: _jsonify_value(x) for k, x in v.items()}
    return v

def _item_from_doc(doc: dict) -> dict:
    """Короткая форма для списка — только хранимые поля, без вычислений."""
    return {
        "id": str(doc.get("_id")),
        "company": doc.get("company"),
        "week_range": doc.get("week_range"),
        "driver_id": str(doc.get("driver_id")) if doc.get("driver_id") else None,
        "driver_name": doc.get("driver_name"),
        "hiring_company": str(doc.get("hiring_company")) if doc.get("hiring_company") else None,
        "truck_number": doc.get("truck_number"),

        "salary": doc.get("salary", 0) or 0,
        "commission": doc.get("commission", 0) or 0,
        "miles": doc.get("miles", 0) or 0,
        "scheme_type": doc.get("scheme_type"),
        "per_mile_rate": doc.get("per_mile_rate", 0) or 0,

        "monday_loads": doc.get("monday_loads", 0) or 0,
        "invoices_num": doc.get("invoices_num", 0) or 0,
        "inspections_num": doc.get("inspections_num", 0) or 0,
        "extra_stops_total": doc.get("extra_stops_total", 0) or 0,

        "approved": bool(doc.get("approved", False)),
        "confirmed": bool(doc.get("confirmed", False)),

        # даты — как есть, просто в ISO-строку
        "created_at": (doc.get("created_at").isoformat() if isinstance(doc.get("created_at"), datetime) else None),
        "updated_at": (doc.get("updated_at").isoformat() if isinstance(doc.get("updated_at"), datetime) else None),

        # week_start_utc/week_end_utc — тоже без конвертаций
        "week_start_utc": (doc.get("week_start_utc").isoformat() if isinstance(doc.get("week_start_utc"), datetime) else None),
        "week_end_utc": (doc.get("week_end_utc").isoformat() if isinstance(doc.get("week_end_utc"), datetime) else None),
    }

# ----------------- API: только два метода -----------------

@statement_mobile_bp.route('/api/mobile/statements', methods=['GET'])
@jwt_required
def mobile_get_statements():
    """
    Список стейтментов текущего водителя (как /api/mobile/inspections).
    Параметры:
      - page: int (>=1), по умолчанию 1
      - per_page: int (1..50), по умолчанию 10
    Ответ:
      {
        success: True,
        items: [ ... ],
        page, per_page, total, has_more
      }
    """
    try:
        # --- авторизация и привязка к водителю ---
        company = getattr(g, "company", None)
        driver_oid = _to_oid(getattr(g, "driver_id", None))
        if not driver_oid:
            return jsonify({"success": False, "error": "Driver not found"}), 404

        driver_doc = drivers_collection.find_one({"_id": driver_oid})
        if not driver_doc:
            return jsonify({"success": False, "error": "Driver not found"}), 404

        if company and driver_doc.get("company") and driver_doc["company"] != company:
            return jsonify({"success": False, "error": "Access denied (company mismatch)"}), 403

        # --- пагинация ---
        try:
            page = int(request.args.get("page", 1))
            per_page = int(request.args.get("per_page", 10))
        except Exception:
            return jsonify({"success": False, "error": "Invalid pagination params"}), 400

        page = max(1, page)
        per_page = max(1, min(per_page, 50))
        skip = (page - 1) * per_page

        # --- запрос ---
        query = {"driver_id": driver_doc["_id"]}
        total = statement_collection.count_documents(query)
        cursor = (
            statement_collection
            .find(query)
            .sort([("created_at", -1), ("_id", -1)])
            .skip(skip)
            .limit(per_page)
        )

        items = [_item_from_doc(doc) for doc in cursor]
        has_more = (page * per_page) < total

        return jsonify({
            "success": True,
            "items": items,
            "page": page,
            "per_page": per_page,
            "total": total,
            "has_more": has_more,
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@statement_mobile_bp.route("/api/mobile/statements/details", methods=["GET"])
@jwt_required
def mobile_statement_details():
    """
    Детали одного стейтмента.
    Параметры:
      - id: обязательный (_id стейтмента)
    Ответ:
      { success: True, statement: { ...весь документ... } }
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

    # Минимальная сериализация всего документа
    sanitized = _jsonify_value(doc)
    # Приведём поле id для удобства на фронте
    if isinstance(sanitized, dict):
        sanitized["id"] = sanitized.pop("_id", None)

    return jsonify({"success": True, "statement": sanitized})
