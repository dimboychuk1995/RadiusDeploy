# samsara.py — минимальный файл только для линковки TMS ↔ Samsara
from flask import Blueprint, jsonify, request, abort, render_template
from flask_login import login_required, current_user
from bson import ObjectId
from tools.db import db
import requests
from tools.mapbox_api import get_mapbox_token

samsara_bp = Blueprint("samsara", __name__)

BASE_URL = "https://api.samsara.com"
integrations_collection = db["integrations_settings"]
trucks_collection = db["trucks"]

@samsara_bp.route("/fragment/samsara_fragment", methods=["GET"])
@login_required
def samsara_fragment():
    """
    Рендерит фрагмент для работы с Samsara.
    Добавляет Mapbox token в шаблон.
    """
    # Проверка, что интеграция Samsara включена
    samsara_integration = db["integrations_settings"].find_one({"name": "samsara"})
    if not samsara_integration or not samsara_integration.get("api_key"):
        abort(403)  # нет интеграции — нет доступа

    # Получаем токен Mapbox
    mapbox_token = get_mapbox_token() or ""

    return render_template("fragments/samsara_fragment.html", mapbox_token=mapbox_token)


# =========================
# Вспомогательная функция
# =========================
def get_samsara_headers():
    """
    Достаёт API-ключ Samsara из integrations_settings: { name: "samsara", api_key: "..." }.
    """
    integ = integrations_collection.find_one({"name": "samsara"})
    if not integ or not integ.get("api_key"):
        abort(500, description="Samsara API key not configured")
    return {
        "Authorization": f"Bearer {integ['api_key']}",
        "accept": "application/json",
        "content-type": "application/json",
    }


@samsara_bp.route("/api/units/<unit_id>", methods=["GET"])
@login_required
def api_get_unit(unit_id):
    """
    Возвращает минимум данных по юниту, чтобы фронт знал, связан ли он с Samsara.
    """
    try:
        oid = ObjectId(unit_id)
    except Exception:
        return jsonify({"error": "Invalid unit_id"}), 400

    unit = trucks_collection.find_one(
        {"_id": oid, "company": current_user.company},
        {"_id": 1, "unit_number": 1, "vin": 1, "samsara_vehicle_id": 1}
    )
    if not unit:
        return jsonify({"error": "Unit not found"}), 404

    return jsonify({
        "_id": str(unit["_id"]),
        "unit_number": unit.get("unit_number"),
        "vin": unit.get("vin"),
        "samsara_vehicle_id": unit.get("samsara_vehicle_id") or None
    })


# =========================================
# 1) Список машин Samsara (для выбора в UI)
# =========================================
@samsara_bp.route("/api/samsara/vehicles", methods=["GET"])
@login_required
def api_samsara_vehicles():
    """
    Возвращает список машин из Samsara.
    Важно: у Samsara max limit=512.
    """
    try:
        headers = get_samsara_headers()
        r = requests.get(f"{BASE_URL}/fleet/vehicles?limit=512", headers=headers, timeout=20)
        if not r.ok:
            return jsonify({"error": "Failed to fetch vehicles from Samsara", "details": r.text}), r.status_code
        return jsonify(r.json().get("data", []))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =====================================================
# 2) Привязка: TMS unit ↔ Samsara vehicle (двусторонняя)
# =====================================================
@samsara_bp.route("/api/samsara/link_vehicle", methods=["POST"])
@login_required
def link_vehicle():
    """
    Body: { "unit_id": "<trucks._id>", "samsara_vehicle_id": "<Samsara Vehicle id>" }

    Делает:
      - локально: trucks.samsara_vehicle_id = <id из Samsara>
      - в Samsara: PATCH /fleet/vehicles/{id} c externalIds.tmsVehicleId = <наш unit_id>
    """
    try:
        data = request.get_json(force=True) or {}
        unit_id = data.get("unit_id")
        samsara_vehicle_id = data.get("samsara_vehicle_id")

        if not unit_id or not samsara_vehicle_id:
            return jsonify({"error": "unit_id and samsara_vehicle_id are required"}), 400

        try:
            unit_oid = ObjectId(unit_id)
        except Exception:
            return jsonify({"error": "Invalid unit_id"}), 400

        # 1) Локально: записываем связку только в рамках компании текущего пользователя
        upd = trucks_collection.update_one(
            {"_id": unit_oid, "company": current_user.company},
            {"$set": {"samsara_vehicle_id": str(samsara_vehicle_id)}},
        )
        if upd.matched_count == 0:
            return jsonify({"error": "Unit not found"}), 404

        # 2) В Samsara: проставляем наш внешний идентификатор
        headers = get_samsara_headers()
        patch_url = f"{BASE_URL}/fleet/vehicles/{samsara_vehicle_id}"
        payload = {"externalIds": {"tmsVehicleId": str(unit_oid)}}
        resp = requests.patch(patch_url, headers=headers, json=payload, timeout=20)
        if not resp.ok:
            return jsonify({"error": "Failed to update externalIds in Samsara", "details": resp.text}), resp.status_code

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================
# 3) Отвязка (Unlink) юнита
# ==========================
@samsara_bp.route("/api/samsara/unlink_vehicle", methods=["POST"])
@login_required
def unlink_vehicle():
    """
    Body: { "unit_id": "<trucks._id>" }

    Делает:
      - локально: удаляет trucks.samsara_vehicle_id
      - в Samsara: убирает externalIds.tmsVehicleId (если была привязка)
    """
    try:
        data = request.get_json(force=True) or {}
        unit_id = data.get("unit_id")
        if not unit_id:
            return jsonify({"error": "unit_id is required"}), 400

        try:
            unit_oid = ObjectId(unit_id)
        except Exception:
            return jsonify({"error": "Invalid unit_id"}), 400

        unit = trucks_collection.find_one(
            {"_id": unit_oid, "company": current_user.company},
            {"samsara_vehicle_id": 1},
        )
        if not unit:
            return jsonify({"error": "Unit not found"}), 404

        samsara_id = unit.get("samsara_vehicle_id")

        # 1) локально — очищаем ссылку
        trucks_collection.update_one({"_id": unit_oid}, {"$unset": {"samsara_vehicle_id": ""}})

        # 2) в Samsara — удалим внешний ID (если знаем vehicle_id)
        if samsara_id:
            try:
                headers = get_samsara_headers()
                requests.patch(
                    f"{BASE_URL}/fleet/vehicles/{samsara_id}",
                    headers=headers,
                    json={"externalIds": {"tmsVehicleId": None}},
                    timeout=20,
                )
            except Exception:
                # Не критичная ошибка: локально уже отвязали, можно починить внешнюю часть позже
                pass

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
