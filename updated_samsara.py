# updated_samsara.py
from flask import Blueprint, jsonify, request, abort
from flask_login import login_required, current_user
from bson import ObjectId
import requests

from tools.db import db

"""
Костяк интеграции TMS ↔ Samsara для линковки юнитов:
- GET  /api/samsara/vehicles                — список машин из Samsara (для ручной привязки/инспекции)
- POST /api/samsara/link_vehicle            — связать один юнит TMS с машиной Samsara (обновляет externalIds в Samsara)
- POST /api/samsara/auto_match_by_vin       — автоматический матч всех юнитов по VIN
- GET  /api/samsara/reconcile_links         — ревизия связок (показывает проблемы/несоответствия)
"""

samsara_bp = Blueprint("samsara_updated", __name__)

BASE_URL = "https://api.samsara.com"
integrations_collection = db["integrations_settings"]
trucks_collection = db["trucks"]


def get_samsara_headers():
    """
    Достаёт API-ключ из integrations_settings: { name: "samsara", api_key: "..." }.
    """
    integration = integrations_collection.find_one({"name": "samsara"})
    if not integration or not integration.get("api_key"):
        abort(500, description="Samsara API key not configured")
    return {
        "Authorization": f"Bearer {integration['api_key']}",
        "accept": "application/json",
        "content-type": "application/json",
    }


# 1) Список машин из Samsara (VIN, plate, id) — пригодится для ручной привязки
@samsara_bp.route("/api/samsara/vehicles", methods=["GET"])
@login_required
def samsara_list_vehicles():
    try:
        headers = get_samsara_headers()
        # при необходимости увеличь limit/пагинируй (Samsara поддерживает nextPageToken)
        r = requests.get(f"{BASE_URL}/fleet/vehicles?limit=1000", headers=headers, timeout=20)
        if not r.ok:
            return jsonify({"error": "Samsara vehicles fetch failed", "details": r.text}), r.status_code
        return jsonify(r.json().get("data", []))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# 2) Ручная связка: TMS unit ↔ Samsara vehicle (и запись externalIds в Samsara)
@samsara_bp.route("/api/samsara/link_vehicle", methods=["POST"])
@login_required
def link_vehicle():
    """
    Body: { "unit_id": "<trucks._id>", "samsara_vehicle_id": "<Samsara Vehicle id>" }
    Действия:
      - обновляет trucks.samsara_vehicle_id в нашей БД
      - пишет в Samsara externalIds.tmsVehicleId = <наш _id>
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

        # локально: фиксируем связку только в рамках компании пользователя
        upd = trucks_collection.update_one(
            {"_id": unit_oid, "company": current_user.company},
            {"$set": {"samsara_vehicle_id": samsara_vehicle_id}},
        )
        if upd.matched_count == 0:
            return jsonify({"error": "Unit not found"}), 404

        # в Samsara: проставляем наш внешний идентификатор
        headers = get_samsara_headers()
        patch_url = f"{BASE_URL}/fleet/vehicles/{samsara_vehicle_id}"
        payload = {"externalIds": {"tmsVehicleId": str(unit_oid)}}
        resp = requests.patch(patch_url, headers=headers, json=payload, timeout=20)
        if not resp.ok:
            return jsonify({"error": "Failed to update externalIds in Samsara", "details": resp.text}), resp.status_code

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



# 🔽 вставь в тот же файл, где уже объявлен samsara_bp = Blueprint('samsara', __name__)
@samsara_bp.route("/api/samsara/link_vehicle_qs", methods=["GET"])
@login_required
def link_vehicle_qs():
    from bson import ObjectId

    unit_id = request.args.get("unit_id")
    samsara_vehicle_id = request.args.get("samsara_vehicle_id")
    if not unit_id or not samsara_vehicle_id:
        return jsonify({"error": "unit_id and samsara_vehicle_id are required"}), 400

    # локально сохраняем samsara_vehicle_id в нашем юните
    try:
        unit_oid = ObjectId(unit_id)
    except Exception:
        return jsonify({"error": "Invalid unit_id"}), 400

    upd = db["trucks"].update_one(
        {"_id": unit_oid, "company": current_user.company},
        {"$set": {"samsara_vehicle_id": samsara_vehicle_id}},
    )
    if upd.matched_count == 0:
        return jsonify({"error": "Unit not found"}), 404

    # в Samsara прописываем externalIds.tmsVehicleId
    headers = get_samsara_headers()
    patch_url = f"{BASE_URL}/fleet/vehicles/{samsara_vehicle_id}"
    payload = {"externalIds": {"tmsVehicleId": str(unit_oid)}}
    resp = requests.patch(patch_url, headers=headers, json=payload, timeout=20)
    if not resp.ok:
        return jsonify({"error": "Failed to update externalIds in Samsara", "details": resp.text}), resp.status_code

    return jsonify({"success": True, "linked": {"unit_id": str(unit_oid), "samsara_vehicle_id": samsara_vehicle_id}})



# 3) Автосопоставление по VIN (разовое массовое проставление связок)
@samsara_bp.route("/api/samsara/auto_match_by_vin", methods=["POST"])
@login_required
def auto_match_by_vin():
    """
    Проходит по всем нашим юнитам (в рамках company) с VIN и ищет соответствие среди машин Samsara.
    При совпадении VIN:
      - ставит trucks.samsara_vehicle_id
      - пишет externalIds.tmsVehicleId в Samsara
    Возвращает количество сопоставлений.
    """
    try:
        headers = get_samsara_headers()

        # наши юниты с VIN
        my_trucks = list(
            trucks_collection.find(
                {"company": current_user.company, "vin": {"$exists": True, "$ne": ""}},
                {"_id": 1, "vin": 1},
            )
        )
        if not my_trucks:
            return jsonify({"matched": 0, "processed": 0})

        # машины из Samsara
        r = requests.get(f"{BASE_URL}/fleet/vehicles?limit=1000", headers=headers, timeout=20)
        if not r.ok:
            return jsonify({"error": "Failed to fetch vehicles from Samsara", "details": r.text}), r.status_code
        samsara_list = r.json().get("data", [])

        # карта VIN -> vehicle
        samsara_by_vin = {}
        for v in samsara_list:
            vin = (v.get("vin") or "").strip().upper()
            if vin:
                samsara_by_vin[vin] = v

        matched = 0
        for t in my_trucks:
            vin = (t.get("vin") or "").strip().upper()
            sv = samsara_by_vin.get(vin)
            if not sv:
                continue

            samsara_vehicle_id = sv.get("id")
            if not samsara_vehicle_id:
                continue

            # локально сохраняем связку
            trucks_collection.update_one(
                {"_id": t["_id"]},
                {"$set": {"samsara_vehicle_id": samsara_vehicle_id}},
            )

            # внешние ID в Samsara
            patch_url = f"{BASE_URL}/fleet/vehicles/{samsara_vehicle_id}"
            payload = {"externalIds": {"tmsVehicleId": str(t["_id"])}}
            resp = requests.patch(patch_url, headers=headers, json=payload, timeout=20)
            if resp.ok:
                matched += 1

        return jsonify({"matched": matched, "processed": len(my_trucks)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# 4) Ревизия связок (покажет, что надо починить)
@samsara_bp.route("/api/samsara/reconcile_links", methods=["GET"])
@login_required
def reconcile_links():
    """
    Проверяет согласованность связок:
      - локально: юниты без samsara_vehicle_id
      - в Samsara: машины без externalIds.tmsVehicleId
      - mismatch: когда локальный samsara_vehicle_id != фактическому id у машины, где externalIds.tmsVehicleId указывает на этот юнит
    """
    try:
        headers = get_samsara_headers()

        # локальные записи
        my_trucks = list(
            trucks_collection.find(
                {"company": current_user.company},
                {"_id": 1, "unit_number": 1, "vin": 1, "samsara_vehicle_id": 1},
            )
        )
        by_local_id = {str(t["_id"]): t for t in my_trucks}

        # машины из Samsara
        r = requests.get(f"{BASE_URL}/fleet/vehicles?limit=1000", headers=headers, timeout=20)
        if not r.ok:
            return jsonify({"error": "Failed to fetch vehicles from Samsara", "details": r.text}), r.status_code
        samsara_list = r.json().get("data", [])

        issues = []

        # 4.1: локальные без привязки
        for t in my_trucks:
            if not t.get("samsara_vehicle_id"):
                issues.append(
                    {
                        "type": "missing_local_link",
                        "truck_id": str(t["_id"]),
                        "unit_number": t.get("unit_number"),
                        "vin": t.get("vin"),
                    }
                )

        # 4.2: в Samsara нет externalIds.tmsVehicleId или не совпадает обратная связка
        for v in samsara_list:
            eid = (v.get("externalIds") or {}).get("tmsVehicleId")
            samsara_id = v.get("id")
            if eid and eid in by_local_id:
                # есть связь — проверим соответствие локальной ссылке
                if by_local_id[eid].get("samsara_vehicle_id") != samsara_id:
                    issues.append(
                        {
                            "type": "mismatch",
                            "truck_id": eid,
                            "expected_samsara_id": by_local_id[eid].get("samsara_vehicle_id"),
                            "actual_samsara_id": samsara_id,
                            "vin": v.get("vin"),
                        }
                    )
            else:
                # в самсаре не указан наш внешний ID
                issues.append(
                    {
                        "type": "missing_external_id",
                        "samsara_id": samsara_id,
                        "vin": v.get("vin"),
                        "name": v.get("name"),
                        "licensePlate": v.get("licensePlate"),
                    }
                )

        return jsonify({"issues": issues})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
