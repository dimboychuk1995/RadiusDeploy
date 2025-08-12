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


@samsara_bp.route("/api/samsara/linked_vehicles", methods=["GET"])
@login_required
def api_samsara_linked_vehicles():
    """
    Возвращает ТОЛЬКО «наши» машины — те, чьи samsara_vehicle_id записаны в trucks.
    Плюс добавляет текущие координаты/скорость/курс из Samsara (gps).
    Ответ:
      { "vehicles": [
          {
            "id": "<samsara_vehicle_id>",
            "unit_id": "<mongo _id>",
            "unit_number": "...",
            "name": "<samsara name>",
            "licensePlate": "...",
            "vin": "...",
            "coords": {"lon": -97.1, "lat": 32.8} | null,
            "heading": 123.0 | null,
            "speedMph": 55.4 | null,
            "updatedAt": "2025-08-10T12:34:56Z" | null
          }, ...
        ] }
    """
    try:
        # 1) Берём все связанные юниты текущей компании
        linked = list(
            trucks_collection.find(
                {
                    "company": current_user.company,
                    "samsara_vehicle_id": {"$exists": True, "$ne": ""},
                },
                {"_id": 1, "unit_number": 1, "samsara_vehicle_id": 1},
            )
        )
        if not linked:
            return jsonify({"vehicles": []})

        samsara_ids = [str(t["samsara_vehicle_id"]) for t in linked]
        headers = get_samsara_headers()

        # 2) Подтягиваем карточки машин (имя, VIN, номер)
        #    (здесь простой вариант — тянем до 512 и фильтруем; при большом парке добавим пагинацию)
        r1 = requests.get(f"{BASE_URL}/fleet/vehicles?limit=512", headers=headers, timeout=20)
        vehicles_raw = r1.json().get("data", []) if r1.ok else []
        veh_by_id = {str(v.get("id")): v for v in vehicles_raw if str(v.get("id")) in samsara_ids}

        # 3) Подтягиваем GPS по этим машинам (одним запросом, если API принимает CSV-список)
        gps_by_id = {}
        try:
            r2 = requests.get(
                f"{BASE_URL}/fleet/vehicles/stats",
                headers=headers,
                params={"types": "gps", "vehicleIds": ",".join(samsara_ids)},
                timeout=20,
            )
            if r2.ok:
                data = r2.json().get("data", []) or []
                # ожидаем объекты вида {"id": ..., "gps": {...}}
                for item in data:
                    sid = str(item.get("id"))
                    gps = item.get("gps") or {}
                    gps_by_id[sid] = gps
        except Exception:
            # не критично — просто вернём без координат
            pass

        # 4) Склеиваем и отдаём
        result = []
        for t in linked:
            sid = str(t["samsara_vehicle_id"])
            v = veh_by_id.get(sid, {})
            gps = gps_by_id.get(sid) or {}

            lat = gps.get("latitude")
            lon = gps.get("longitude")
            coords = {"lat": lat, "lon": lon} if (lat is not None and lon is not None) else None

            result.append(
                {
                    "id": sid,
                    "unit_id": str(t["_id"]),
                    "unit_number": t.get("unit_number"),
                    "name": v.get("name"),
                    "licensePlate": v.get("licensePlate"),
                    "vin": v.get("vin"),
                    "coords": coords,
                    "heading": gps.get("bearing"),
                    "speedMph": gps.get("speedMilesPerHour") or gps.get("speedMph"),
                    "updatedAt": gps.get("time"),
                }
            )

        return jsonify({"vehicles": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@samsara_bp.route("/api/samsara/units_by_company", methods=["GET"])
@login_required
def api_units_by_company():
    """
    Возвращает юниты текущего тенанта, сгруппированные по owning_company,
    с driver_name (если assigned_driver_id есть и найден в drivers).
    """
    try:
        trucks_col = db["trucks"]
        drivers_col = db["drivers"]
        companies_col = db["companies"]

        # 1) Берём все юниты этой компании
        units = list(trucks_col.find(
            {"company": current_user.company},
            {
                "_id": 1, "unit_number": 1, "vin": 1,
                "make": 1, "model": 1, "year": 1,
                "samsara_vehicle_id": 1, "assigned_driver_id": 1,
                "owning_company": 1
            }
        ))

        if not units:
            return jsonify({"success": True, "companies": []})

        # helper: безопасно привести к ObjectId
        def to_oid(x):
            from bson import ObjectId
            if isinstance(x, ObjectId):
                return x
            if isinstance(x, str) and len(x) == 24:
                try:
                    return ObjectId(x)
                except Exception:
                    return None
            return None

        # 2) Собираем ID водителей (и как ObjectId, и как строки — приводим к OID)
        driver_oids = {to_oid(u.get("assigned_driver_id")) for u in units if u.get("assigned_driver_id")}
        driver_oids.discard(None)

        # 3) Готовим map: driver_id -> driver_name (поддержка разных схем полей)
        drivers_map = {}
        if driver_oids:
            for d in drivers_col.find(
                {"_id": {"$in": list(driver_oids)}},
                {"_id": 1, "name": 1, "first_name": 1, "last_name": 1}
            ):
                name = d.get("name")
                if not name:
                    fn = d.get("first_name", "") or ""
                    ln = d.get("last_name", "") or ""
                    full = f"{fn} {ln}".strip()
                    name = full or None
                drivers_map[d["_id"]] = name

        # 4) Названия компаний по owning_company
        from bson import ObjectId as _OID
        comp_oids = {
            oc for oc in (u.get("owning_company") for u in units)
            if isinstance(oc, _OID)
        }
        companies_map = {}
        if comp_oids:
            for c in companies_col.find({"_id": {"$in": list(comp_oids)}}, {"_id": 1, "name": 1, "owner_company": 1}):
                companies_map[str(c["_id"])] = c.get("name") or c.get("owner_company") or "Без компании"

        # 5) Группировка
        grouped = {}  # key: str(company_id) | "none"
        for u in units:
            oc = u.get("owning_company") if isinstance(u.get("owning_company"), _OID) else None
            key = str(oc) if oc else "none"
            company_name = companies_map.get(str(oc), "Без компании")

            if key not in grouped:
                grouped[key] = {
                    "company_id": str(oc) if oc else None,
                    "company_name": company_name,
                    "units": []
                }

            ad_oid = to_oid(u.get("assigned_driver_id"))
            driver_name = drivers_map.get(ad_oid)

            grouped[key]["units"].append({
                "_id": str(u["_id"]),
                "unit_number": u.get("unit_number", ""),
                "vin": u.get("vin", ""),
                "make": u.get("make", ""),
                "model": u.get("model", ""),
                "year": u.get("year", ""),
                "samsara_vehicle_id": u.get("samsara_vehicle_id") or None,
                "is_linked": bool(u.get("samsara_vehicle_id")),
                "driver_name": driver_name
            })

        # 6) Сортировки
        groups = list(grouped.values())
        for g in groups:
            g["units"].sort(key=lambda x: (x["unit_number"] or "").lower())
        groups.sort(key=lambda g: (g["company_name"] or "").lower())

        return jsonify({"success": True, "companies": groups})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500