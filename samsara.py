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


@samsara_bp.route("/api/samsara/vehicle_history", methods=["GET"])
@login_required
def api_samsara_vehicle_history():
    """
    GET:
      samsara_vehicle_id | vehicle_id (str, required)
      date (str, optional)  — YYYY-MM-DD или MM/DD/YYYY; по умолчанию сегодня (таймзона компании)
      force (str, optional) — 'stats' или 'locations' (принудительно выбрать источник)
      debug (int, optional) — 1 = добавить диагностику

    Ответ:
      {
        success, vehicle_id, date, start_time_utc, end_time_utc,
        points: [{lat, lon, time, speedMph, heading}],  # по времени ASC
        stops:  [{startTime, endTime, durationMinutes, lat, lon}],
        source: "stats/history" | "locations/history",
        debug?: {...}
      }
    """
    import requests
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo

    def _parse_iso_aware(ts: str):
        try:
            if ts.endswith("Z"):
                return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            return datetime.fromisoformat(ts).astimezone(timezone.utc)
        except Exception:
            return None

    def _bounds_for_date(tz_name: str, date_str: str | None):
        local_tz = ZoneInfo(tz_name or "America/Chicago")
        if date_str:
            try:
                if "-" in date_str:
                    d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=local_tz)
                else:
                    d = datetime.strptime(date_str, "%m/%d/%Y").replace(tzinfo=local_tz)
            except Exception:
                return None, None, "Invalid date format"
        else:
            now_local = datetime.now(local_tz)
            d = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        start_local = d.replace(hour=0, minute=0, second=0, microsecond=0)
        end_local = start_local + timedelta(days=1)
        return start_local, end_local, None

    def _fetch_stats_history_gps(headers, vehicle_id, start_iso, end_iso):
        url = f"{BASE_URL}/fleet/vehicles/stats/history"
        params = {"types": "gps", "startTime": start_iso, "endTime": end_iso, "vehicleIds": str(vehicle_id)}
        points, pages, errors = [], 0, None
        while True:
            pages += 1
            if pages > 60: break
            r = requests.get(url, headers=headers, params=params, timeout=30)
            if not r.ok:
                errors = {"where": "stats/history", "code": r.status_code, "body": r.text}; break
            payload = r.json() or {}
            for veh in payload.get("data", []):
                if str(veh.get("id")) != str(vehicle_id): continue
                gps_arr = veh.get("gps") or []
                if isinstance(gps_arr, dict):
                    gps_arr = [gps_arr]
                for g in gps_arr:
                    lat, lon, t = g.get("latitude"), g.get("longitude"), g.get("time")
                    if lat is None or lon is None or not t: continue
                    heading = g.get("headingDegrees") if "headingDegrees" in g else g.get("bearing")
                    speed = g.get("speedMilesPerHour") or g.get("speedMph")
                    points.append({
                        "lat": float(lat), "lon": float(lon), "time": t,
                        "speedMph": float(speed) if speed is not None else None,
                        "heading": float(heading) if heading is not None else None
                    })
            pag = (payload.get("pagination") or {})
            if pag.get("hasNextPage"):
                params["after"] = pag.get("endCursor")
            else:
                break
        return {"pages": pages, "count": len(points), "error": errors}, points

    def _fetch_locations_history(headers, vehicle_id, start_iso, end_iso):
        # Старый эндпоинт, часто отдаёт то, что не пришло из stats/history
        url = f"{BASE_URL}/fleet/vehicles/locations/history"
        params = {"startTime": start_iso, "endTime": end_iso, "vehicleIds": str(vehicle_id)}
        points, pages, errors = [], 0, None
        while True:
            pages += 1
            if pages > 60: break
            r = requests.get(url, headers=headers, params=params, timeout=30)
            if not r.ok:
                errors = {"where": "locations/history", "code": r.status_code, "body": r.text}; break
            payload = r.json() or {}
            for veh in payload.get("data", []):
                if str(veh.get("id")) != str(vehicle_id): continue
                for g in veh.get("locations") or []:
                    lat, lon, t = g.get("latitude"), g.get("longitude"), g.get("time")
                    if lat is None or lon is None or not t: continue
                    points.append({"lat": float(lat), "lon": float(lon), "time": t, "speedMph": None, "heading": None})
            pag = (payload.get("pagination") or {})
            if pag.get("hasNextPage"):
                params["after"] = pag.get("endCursor")
            else:
                break
        return {"pages": pages, "count": len(points), "error": errors}, points

    try:
        samsara_vehicle_id = request.args.get("samsara_vehicle_id") or request.args.get("vehicle_id")
        if not samsara_vehicle_id:
            return jsonify({"success": False, "error": "Missing samsara_vehicle_id"}), 400

        # Валидируем принадлежность компании
        unit = trucks_collection.find_one(
            {"company": current_user.company, "samsara_vehicle_id": str(samsara_vehicle_id)},
            {"_id": 1, "unit_number": 1}
        )
        if not unit:
            return jsonify({"success": False, "error": "Vehicle is not linked to your company"}), 403

        # Таймзона компании
        tz_doc = db["company_timezone"].find_one({"company": current_user.company}) or {}
        tz_name = tz_doc.get("timezone") or "America/Chicago"
        start_local, end_local, err = _bounds_for_date(tz_name, request.args.get("date"))
        if err:
            return jsonify({"success": False, "error": err}), 400

        start_utc = start_local.astimezone(timezone.utc)
        end_utc = end_local.astimezone(timezone.utc)
        start_iso = start_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_iso   = end_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

        headers = get_samsara_headers()
        force = (request.args.get("force") or "").lower().strip()

        debug_meta = {}
        used = None
        points = []

        if force in ("stats", "s"):
            used = "stats/history"
            meta, points = _fetch_stats_history_gps(headers, samsara_vehicle_id, start_iso, end_iso)
            debug_meta["stats"] = meta
        elif force in ("locations", "l"):
            used = "locations/history"
            meta, points = _fetch_locations_history(headers, samsara_vehicle_id, start_iso, end_iso)
            debug_meta["locations"] = meta
        else:
            # 1) основной путь
            meta_stats, points = _fetch_stats_history_gps(headers, samsara_vehicle_id, start_iso, end_iso)
            debug_meta["stats"] = meta_stats
            used = "stats/history"
            # 2) фоллбэк
            if not points:
                meta_loc, points = _fetch_locations_history(headers, samsara_vehicle_id, start_iso, end_iso)
                debug_meta["locations"] = meta_loc
                if points:
                    used = "locations/history"

        # сортировка + фильтр по валидным timestamp
        points = [p for p in points if _parse_iso_aware(p["time"]) is not None]
        points.sort(key=lambda p: _parse_iso_aware(p["time"]))

        # Детекция «стопов»: ≤1 mph, ≥5 минут
        STOP_SPEED_MPH = 1.0
        STOP_MIN_SECONDS = 5 * 60
        stops, in_stop, i0 = [], False, None
        for i, p in enumerate(points):
            spd = p["speedMph"] if p["speedMph"] is not None else 0.0
            idle = spd <= STOP_SPEED_MPH
            if idle and not in_stop:
                in_stop, i0 = True, i
            elif (not idle) and in_stop:
                t0 = _parse_iso_aware(points[i0]["time"]); t1 = _parse_iso_aware(points[i-1]["time"])
                dur = (t1 - t0).total_seconds() if (t0 and t1) else 0
                if dur >= STOP_MIN_SECONDS:
                    chunk = points[i0:i]
                    avg_lat = sum(c["lat"] for c in chunk) / len(chunk)
                    avg_lon = sum(c["lon"] for c in chunk) / len(chunk)
                    stops.append({
                        "startTime": t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "endTime":   t1.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "durationMinutes": round(dur/60.0, 1),
                        "lat": round(avg_lat, 6), "lon": round(avg_lon, 6)
                    })
                in_stop, i0 = False, None
        if in_stop and i0 is not None and points:
            t0 = _parse_iso_aware(points[i0]["time"]); t1 = _parse_iso_aware(points[-1]["time"])
            dur = (t1 - t0).total_seconds() if (t0 and t1) else 0
            if dur >= STOP_MIN_SECONDS:
                chunk = points[i0:]
                avg_lat = sum(c["lat"] for c in chunk) / len(chunk)
                avg_lon = sum(c["lon"] for c in chunk) / len(chunk)
                stops.append({
                    "startTime": t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "endTime":   t1.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "durationMinutes": round(dur/60.0, 1),
                    "lat": round(avg_lat, 6), "lon": round(avg_lon, 6)
                })

        resp = {
            "success": True,
            "vehicle_id": str(samsara_vehicle_id),
            "date": start_local.strftime("%Y-%m-%d"),
            "start_time_utc": start_iso,
            "end_time_utc": end_iso,
            "points": points,
            "stops": stops,
            "source": used
        }
        if request.args.get("debug") == "1":
            resp["debug"] = debug_meta | {"tz": tz_name}
        return jsonify(resp)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500



@samsara_bp.route("/api/samsara/vehicle_mileage", methods=["GET"])
@login_required
def api_samsara_vehicle_mileage():
    """
    Считает, сколько миль проехал конкретный грузовик за интервал.

    GET-параметры:
      - samsara_vehicle_id | vehicle_id (str, required)
      - date (str, optional) — YYYY-MM-DD или MM/DD/YYYY; если указана, берём сутки компании [00:00, 24:00)
      - start (str, optional) — ISO 8601 или YYYY-MM-DD (тогда 00:00 локали компании)
      - end   (str, optional) — ISO 8601 или YYYY-MM-DD (тогда 00:00 следующего дня локали компании)
      - tz    (str, optional) — IANA timezone, по умолчанию таймзона компании
      - pad   (int, optional) — минут «запаса» ДО start (по умолчанию 45), чтобы вытянуть первое значение до начала окна
      - debug (int, optional) — 1 вернуть диагностику

    Приоритет источников:
      1) obdOdometerMeters (ECU)
      2) gpsDistanceMeters  (накапливаемая дистанция от установки VG)
      3) gpsOdometerMeters  (GPS-«одометр» с ручным оффсетом — как крайний случай)

    Ответ:
      {
        "success": true,
        "vehicle_id": "...",
        "start_time_utc": "....Z",
        "end_time_utc":   "....Z",
        "miles": 123.45,                  # выбранный лучший источник
        "meters": 198700.0,
        "source": "obdOdometerMeters|gpsDistanceMeters|gpsOdometerMeters",
        "breakdown": {                    # для прозрачности — все источники и их дельты
          "obdOdometerMeters": {"meters": ..., "miles": ..., "samples": 12, "firstTime": "...", "lastTime": "..."},
          "gpsDistanceMeters": {"meters": ..., "miles": ..., "samples": 20, "firstTime": "...", "lastTime": "..."},
          "gpsOdometerMeters": {"meters": ..., "miles": ..., "samples": 7,  "firstTime": "...", "lastTime": "..."}
        }
      }
    """
    import requests
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo
    from flask import request, jsonify

    MILES_PER_METER = 0.000621371
    TYPES = ["obdOdometerMeters", "gpsDistanceMeters", "gpsOdometerMeters"]

    def _parse_any_ts_localfirst(s: str, local_tz: ZoneInfo):
        """Поддержка ISO/offset/`YYYY-MM-DD`/`MM/DD/YYYY`."""
        if not s:
            return None
        s = s.strip()
        # Если просто дата — трактуем как 00:00 этой даты в local_tz
        try:
            if len(s) == 10 and s[4] == "-" and s[7] == "-":
                return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=local_tz)
        except Exception:
            pass
        try:
            if "/" in s and len(s) >= 10:
                return datetime.strptime(s[:10], "%m/%d/%Y").replace(tzinfo=local_tz)
        except Exception:
            pass
        # Иначе пусть парсит из ISO (aware -> переведём в UTC позже)
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    def _to_utc_iso(dt):
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _pick_first_last(arr):
        """Из массива [{time, value}] берём (first, last) по времени."""
        arr = [x for x in arr if x and x.get("time") and (x.get("value") is not None)]
        if not arr:
            return None, None
        arr.sort(key=lambda x: x["time"])
        return arr[0], arr[-1]

    def _ensure_list(obj):
        """Samsara иногда отдаёт объект, иногда массив; приводим к массиву."""
        if obj is None:
            return []
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            return [obj]  # одиночное значение
        return []

    try:
        samsara_vehicle_id = request.args.get("samsara_vehicle_id") or request.args.get("vehicle_id")
        if not samsara_vehicle_id:
            return jsonify({"success": False, "error": "Missing samsara_vehicle_id"}), 400

        # Валидация принадлежности компании
        unit = trucks_collection.find_one(
            {"company": current_user.company, "samsara_vehicle_id": str(samsara_vehicle_id)},
            {"_id": 1, "unit_number": 1}
        )
        if not unit:
            return jsonify({"success": False, "error": "Vehicle is not linked to your company"}), 403

        # Таймзона компании (fallback America/Chicago)
        tz_doc = db["company_timezone"].find_one({"company": current_user.company}) or {}
        tz_name = request.args.get("tz") or tz_doc.get("timezone") or "America/Chicago"
        local_tz = ZoneInfo(tz_name)

        # Вычислим окно
        date_str = request.args.get("date")
        start_str = request.args.get("start")
        end_str   = request.args.get("end")

        if date_str and not (start_str or end_str):
            # сутки компании
            day_local = _parse_any_ts_localfirst(date_str, local_tz)
            if not day_local:
                return jsonify({"success": False, "error": "Invalid date format"}), 400
            start_local = day_local.replace(hour=0, minute=0, second=0, microsecond=0)
            end_local   = start_local + timedelta(days=1)
        else:
            # произвольные start/end
            start_local = _parse_any_ts_localfirst(start_str, local_tz)
            end_local   = _parse_any_ts_localfirst(end_str,   local_tz)
            if not start_local:
                return jsonify({"success": False, "error": "Provide either date or start/end"}), 400
            if not end_local:
                # если дали только start с датой без времени — считаем сутки
                if len(start_str or "") == 10:
                    end_local = start_local + timedelta(days=1)
                else:
                    return jsonify({"success": False, "error": "Missing end"}), 400

        # Паддинг, чтобы захватить «первое» значение до начала окна
        pad_min = int(request.args.get("pad") or 45)
        start_local_padded = start_local - timedelta(minutes=max(0, pad_min))

        # UTC ISO
        start_iso = _to_utc_iso(start_local)
        end_iso   = _to_utc_iso(end_local)
        start_iso_padded = _to_utc_iso(start_local_padded)

        headers = get_samsara_headers()

        # История показаний за [start_pad, end]
        url = f"{BASE_URL}/fleet/vehicles/stats/history"
        params = {
            "vehicleIds": str(samsara_vehicle_id),
            "types": ",".join(TYPES),
            "startTime": start_iso_padded,
            "endTime": end_iso
        }

        # Пагинация
        pages = 0
        accum = {t: [] for t in TYPES}
        names = {}
        while True:
            pages += 1
            if pages > 60:
                break
            r = requests.get(url, headers=headers, params=params, timeout=30)
            if not r.ok:
                return jsonify({
                    "success": False,
                    "error": f"Failed to fetch stats history ({r.status_code})",
                    "details": r.text
                }), r.status_code
            payload = r.json() or {}

            for veh in payload.get("data", []):
                if str(veh.get("id")) != str(samsara_vehicle_id):
                    continue
                names["vehicle"] = veh.get("name")
                for t in TYPES:
                    accum[t].extend(_ensure_list(veh.get(t)))

            pag = (payload.get("pagination") or {})
            if pag.get("hasNextPage"):
                params["after"] = pag.get("endCursor")
            else:
                break

        # Вычислим дельты по каждому источнику
        breakdown = {}
        best = None

        for t in TYPES:
            first, last = _pick_first_last(accum[t])
            if not (first and last):
                breakdown[t] = {"meters": 0.0, "miles": 0.0, "samples": len(accum[t])}
                continue

            delta_m = (float(last.get("value", 0)) - float(first.get("value", 0)))
            # Защитимся от отрицательных скачков (смена VG/сброс одометра)
            if delta_m < 0:
                delta_m = 0.0

            meters = delta_m
            miles  = meters * MILES_PER_METER
            breakdown[t] = {
                "meters": round(meters, 3),
                "miles": round(miles, 3),
                "samples": len(accum[t]),
                "firstTime": first.get("time"),
                "lastTime": last.get("time")
            }

        # Выбираем лучший источник: obd → gpsDistance → gpsOdometer
        order = ["obdOdometerMeters", "gpsDistanceMeters", "gpsOdometerMeters"]
        for key in order:
            if breakdown.get(key, {}).get("meters", 0) > 0:
                best = (key, breakdown[key])
                break
        if not best:
            # если все нули — вернём нули, но с раскладкой, чтобы было понятно почему
            best = (order[0], breakdown.get(order[0], {"meters": 0.0, "miles": 0.0}))

        resp = {
            "success": True,
            "vehicle_id": str(samsara_vehicle_id),
            "date": (request.args.get("date") or None),
            "start_time_utc": _to_utc_iso(start_local),
            "end_time_utc": _to_utc_iso(end_local),
            "meters": best[1]["meters"],
            "miles": best[1]["miles"],
            "source": best[0],
            "breakdown": breakdown
        }
        if request.args.get("debug") == "1":
            resp["debug"] = {
                "pages": pages,
                "tz": tz_name,
                "pad_minutes": pad_min,
                "queried_types": TYPES,
                "vehicle_name": names.get("vehicle")
            }
        return jsonify(resp)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
