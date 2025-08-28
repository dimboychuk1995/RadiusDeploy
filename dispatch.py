

import requests
from flask import Blueprint, render_template
from flask_login import login_required, current_user
import logging
from flask import request, jsonify
from bson import ObjectId
from flask_login import login_required
from datetime import datetime, time
from zoneinfo import ZoneInfo
from auth import users_collection
from tools.db import db
from dateutil import parser
dispatch_bp = Blueprint('dispatch', __name__)

drivers_collection = db['drivers']
trucks_collection = db['trucks']
loads_collection = db['loads']
consolidated_loads_collection =db['consolidated_loads']
integrations_settings_collection = db['integrations_settings']
drivers_brakes_collection = db['drivers_brakes']

def convert_object_ids(obj):
    if isinstance(obj, list):
        return [convert_object_ids(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_object_ids(value) for key, value in obj.items()}
    elif isinstance(obj, ObjectId):
        return str(obj)
    else:
        return obj


@dispatch_bp.route('/fragment/dispatch_fragment', methods=['GET'])
@login_required
def dispatch_fragment():
    import time
    from datetime import datetime, timedelta, timezone
    from bson import ObjectId

    t0 = time.time()

    try:
        log = []

        # === Drivers ===
        t1 = time.time()
        drivers = list(drivers_collection.find(
            {'company': current_user.company},
            {'_id': 1, 'name': 1, 'truck': 1, 'dispatcher': 1}
        ))
        log.append(f"✅ Drivers: {time.time() - t1:.3f} сек")

        # === Trucks ===
        t2 = time.time()
        trucks = list(trucks_collection.find(
            {'company': current_user.company},
            {'_id': 1, 'unit_number': 1}
        ))
        log.append(f"✅ Trucks: {time.time() - t2:.3f} сек")

        # === Dispatchers ===
        t3 = time.time()
        dispatchers = list(users_collection.find(
            {'company': current_user.company, 'role': 'dispatch'},
            {'_id': 1, 'username': 1}
        ))
        log.append(f"✅ Dispatchers: {time.time() - t3:.3f} сек")

        # === Loads ===
        t4 = time.time()
        loads = list(loads_collection.find(
            {'company': current_user.company},
            {
                '_id': 1,
                'assigned_driver': 1,
                'pickup.date': 1,
                'pickup.address': 1,
                'delivery.date': 1,
                'delivery.address': 1,
                'status': 1,
                'load_id': 1,
                'extra_delivery': 1,
                'price': 1,
                'total_price': 1,
                'RPM': 1,
                'consolidated': 1,
                'consolidateId': 1
            }
        ))
        log.append(f"✅ Loads: {time.time() - t4:.3f} сек")

        # === Consolidated Loads ===
        t5 = time.time()
        consolidated_loads = list(consolidated_loads_collection.find({}, {
            '_id': 1,
            'load_ids': 1,
            'route_points': 1,
            'total_miles': 1,
            'total_price': 1,
            'rpm': 1
        }))
        log.append(f"✅ Consolidated Loads: {time.time() - t5:.3f} сек")

        # === Driver Breaks ===
        t6 = time.time()
        driver_breaks = list(db['drivers_breaks'].find({}, {
            '_id': 1,
            'driver_id': 1,
            'reason': 1,
            'start_date': 1,
            'end_date': 1
        }))
        log.append(f"✅ Driver Breaks: {time.time() - t6:.3f} сек")

        # === Очистка ===
        def clean_for_json(obj):
            if isinstance(obj, dict):
                return {
                    k: clean_for_json(v)
                    for k, v in obj.items()
                    if not isinstance(v, bytes)
                }
            elif isinstance(obj, list):
                return [clean_for_json(item) for item in obj]
            elif isinstance(obj, ObjectId):
                return str(obj)
            return obj

        drivers = clean_for_json(drivers)
        trucks = clean_for_json(trucks)
        dispatchers = clean_for_json(dispatchers)
        loads = clean_for_json(loads)
        consolidated_loads = clean_for_json(consolidated_loads)
        driver_breaks = clean_for_json(driver_breaks)

        # === Группировка водителей ===
        truck_map = {t['_id']: t for t in trucks}
        dispatcher_map = {d['_id']: d for d in dispatchers}

        grouped_drivers = {}
        for driver in drivers:
            dispatcher_id = driver.get('dispatcher') or "unassigned"
            driver['dispatcher'] = dispatcher_map.get(dispatcher_id)
            driver['truck'] = truck_map.get(driver.get('truck'))
            grouped_drivers.setdefault(dispatcher_id, []).append(driver)

        # === Рендеринг ===
        render_start = time.time()
        rendered = render_template(
            'fragments/dispatch_fragment.html',
            dispatchers=dispatchers,
            grouped_drivers=grouped_drivers,
            all_loads=loads,
            consolidated_loads=consolidated_loads,
            driver_breaks=driver_breaks
        )
        log.append(f"✅ Render: {time.time() - render_start:.3f} сек")

        total_time = time.time() - t0
        log.append(f"⏱️ Всего: {total_time:.3f} сек")
        for line in log:
            print(line)
        print(f"📊 Breaks count: {len(driver_breaks)}")
        return rendered

    except Exception as e:
        logging.error(f"Ошибка в dispatch_fragment: {e}")
        return render_template('error.html', message="Не удалось загрузить данные диспетчеров.")


@dispatch_bp.route('/api/integrations/mapbox_token', methods=['GET'])
@login_required
def get_mapbox_token():
    try:
        doc = db.integrations_settings.find_one({"name": "MapBox"}) or {}
        token = str(doc.get("api_key", "")).strip()
        if not token:
            return jsonify({"success": False, "error": "Mapbox token is not configured"}), 404
        return jsonify({"success": True, "token": token})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# we called this method from different places
# we called this method from different places
@dispatch_bp.route('/api/consolidation/prep', methods=['POST'])
@login_required
def prep_consolidation():
    """
    Готовит данные для консолидации.

    Источники времени на точке (любые могут быть null):
      - date (datetime/ISO/строка)
      - date_to (datetime/ISO/строка)
      - time_from (str)
      - time_to   (str)

    На каждый point возвращаем:
      type, address, load_id (OID строки в БД), price,
      date_from_iso, date_to_iso, time_from, time_to,
      date_text, time_text,
      lng, lat,
      order (после сортировки).

    Также возвращаем loads (с load_id для отображения в UI).
    """
    try:
        import os, urllib.parse, requests
        from bson import ObjectId
        from flask import jsonify, request
        from datetime import datetime, time
        from zoneinfo import ZoneInfo

        # ---------- TZ компании (аналогично dispatch_schedule.py) ----------
        def get_company_timezone():
            doc = db.company_timezone.find_one({}) or {}
            name = doc.get("timezone", "America/Chicago")
            try:
                return ZoneInfo(name)
            except Exception:
                return ZoneInfo("America/Chicago")

        tz = get_company_timezone()

        # ---------- Mapbox token из БД (fallback: env) ----------
        def get_mapbox_token():
            doc = db.integrations_settings.find_one({"name": "MapBox"}) or {}
            token = (doc.get("api_key") or "").strip()
            if not token:
                token = (os.getenv("MAPBOX_TOKEN") or "").strip()
            return token or None

        MAPBOX_TOKEN = get_mapbox_token()

        # ---------- простой кэш геокода в Mongo ----------
        geo_cache = db.geocode_cache

        def geocode_address(addr: str):
            """Возвращает (lng, lat) или (None, None). Кэширует результат."""
            if not addr or not MAPBOX_TOKEN:
                return None, None
            key = addr.strip()
            cached = geo_cache.find_one({"q": key})
            if cached and "lng" in cached and "lat" in cached:
                return cached["lng"], cached["lat"]
            url = (
                "https://api.mapbox.com/geocoding/v5/mapbox.places/"
                f"{urllib.parse.quote(key)}.json?limit=1&access_token={MAPBOX_TOKEN}"
            )
            try:
                r = requests.get(url, timeout=8)
                r.raise_for_status()
                j = r.json()
                feat = (j.get("features") or [None])[0]
                if feat and "center" in feat and len(feat["center"]) == 2:
                    lng, lat = float(feat["center"][0]), float(feat["center"][1])
                    geo_cache.update_one({"q": key}, {"$set": {"lng": lng, "lat": lat}}, upsert=True)
                    return lng, lat
            except Exception:
                pass
            return None, None

        # ---------- входные данные ----------
        data = request.get_json(silent=True) or {}
        raw_ids = data.get('load_ids', [])
        if not raw_ids:
            return jsonify({"success": False, "error": "No load_ids provided"}), 400

        object_ids = [ObjectId(s) for s in raw_ids]

        # ---------- выбираем грузы ----------
        loads = list(loads_collection.find(
            {'_id': {'$in': object_ids}},
            {
                '_id': 1, 'load_id': 1,
                'pickup': 1, 'delivery': 1,
                'extra_pickup': 1, 'extra_delivery': 1,
                'price': 1, 'total_price': 1,
                'miles': 1, 'total_miles': 1,
                'broker': 1, 'broker_id': 1, 'broker_load_id': 1,
                'RPM': 1, 'company_sign': 1,
                'assigned_driver': 1, 'assigned_dispatch': 1, 'assigned_power_unit': 1,
            }
        ))

        # ---------- helpers ----------
        def _to_local_dt(dt_val):
            """Любой datetime/ISO/'MM/DD/YYYY[ HH:MM]' → локальная TZ компании; naive трактуем как локальную."""
            if not dt_val:
                return None
            if isinstance(dt_val, str):
                s = dt_val.strip()
                # ISO
                try:
                    s_iso = s.replace('Z', '+00:00')
                    dt = datetime.fromisoformat(s_iso)
                except Exception:
                    dt = None
                # MM/DD/YYYY[ HH:MM]
                if dt is None:
                    for fmt in ("%m/%d/%Y %H:%M", "%m/%d/%Y"):
                        try:
                            dt = datetime.strptime(s, fmt)
                            break
                        except Exception:
                            continue
                if dt is None:
                    return None
            else:
                dt = dt_val

            if dt.tzinfo is None:
                return dt.replace(tzinfo=tz)
            return dt.astimezone(tz)

        def _parse_time(s):
            """Строка времени → time или None. Поддержка 'HH:MM', 'H:MM', 'HH', 'h:mm AM/PM'."""
            if not s or not isinstance(s, str):
                return None
            s0 = s.strip().upper()
            for fmt in ("%H:%M", "%I:%M %p", "%I %p"):
                try:
                    return datetime.strptime(s0, fmt).time()
                except Exception:
                    continue
            # допускаем просто 'HH'
            try:
                hh = int(s0)
                if 0 <= hh <= 23:
                    return time(hh, 0)
            except Exception:
                pass
            return None

        def _mk_text_date(d1, d2):
            if d1 and d2 and d2.date() != d1.date():
                return f"{d1.strftime('%m/%d/%Y')} – {d2.strftime('%m/%d/%Y')}"
            if d1:
                return d1.strftime("%m/%d/%Y")
            if d2:
                return d2.strftime("%m/%d/%Y")
            return "—"

        def _mk_text_time(t1, t2):
            def f(t): return t.strftime("%H:%M")
            if t1 and t2 and (t1 != t2):
                return f"{f(t1)} – {f(t2)}"
            if t1:
                return f(t1)
            if t2:
                return f(t2)
            return ""

        def _extract_point(pt_type, node, load_oid, price):
            """
            Универсальный экстрактор полей из pickup/delivery/extra_*:
              date | scheduled_at,
              date_to | scheduled_to,
              time_from, time_to
            """
            date_from_raw = node.get("date", node.get("scheduled_at"))
            date_to_raw   = node.get("date_to", node.get("scheduled_to"))
            time_from_str = (node.get("time_from") or "").strip()
            time_to_str   = (node.get("time_to") or "").strip()

            d1_local = _to_local_dt(date_from_raw)
            d2_local = _to_local_dt(date_to_raw)
            t_from = _parse_time(time_from_str)
            t_to   = _parse_time(time_to_str)

            # sort_dt = начало окна (дата + time_from, если есть)
            sort_dt = d1_local
            if d1_local and t_from:
                sort_dt = d1_local.replace(hour=t_from.hour, minute=t_from.minute, second=0, microsecond=0)

            addr = (node.get("address") or "").strip()
            lng, lat = geocode_address(addr)

            point = {
                "type": pt_type,
                "address": addr,
                "load_id": str(load_oid),                     # OID строки груза
                "price": float(price),
                "date_from_iso": d1_local.isoformat() if d1_local else "",
                "date_to_iso":   d2_local.isoformat() if d2_local else "",
                "time_from": time_from_str,
                "time_to":   time_to_str,
                "date_text": _mk_text_date(d1_local, d2_local),
                "time_text": _mk_text_time(t_from, t_to),
                "scheduled_at": d1_local.isoformat() if d1_local else "",  # для обратной совместимости
                "lng": lng, "lat": lat,
            }
            return point, sort_dt

        # ---------- собираем точки ----------
        pickup_points, delivery_points, sortable = [], [], []
        result_loads = []

        for load in loads:
            oid = load["_id"]
            price = float(load.get("total_price", load.get("price", 0)) or 0)

            for ep in (load.get("extra_pickup") or []):
                p, sdt = _extract_point("pickup", ep, oid, price)
                pickup_points.append(p); sortable.append((p, sdt))

            if load.get("pickup"):
                p, sdt = _extract_point("pickup", load["pickup"], oid, price)
                pickup_points.append(p); sortable.append((p, sdt))

            if load.get("delivery"):
                p, sdt = _extract_point("delivery", load["delivery"], oid, price)
                delivery_points.append(p); sortable.append((p, sdt))

            for ed in (load.get("extra_delivery") or []):
                p, sdt = _extract_point("delivery", ed, oid, price)
                delivery_points.append(p); sortable.append((p, sdt))

            # Информация о грузе (для таблицы). В UI показываем load_id, не _id.
            result_loads.append({
                "_id": str(oid),                        # для backend операций
                "load_id": str(load.get("load_id", "")),# номер груза для UI
                "broker_id": str(load.get("broker_id")) if load.get("broker_id") else "",
                "company_sign": str(load.get("company_sign")) if load.get("company_sign") else "",
                "assigned_driver": str(load.get("assigned_driver")) if load.get("assigned_driver") else "",
                "assigned_dispatch": str(load.get("assigned_dispatch")) if load.get("assigned_dispatch") else "",
                "assigned_power_unit": str(load.get("assigned_power_unit")) if load.get("assigned_power_unit") else "",
                "broker_load_id": load.get("broker_load_id", ""),
                "broker": load.get("broker", {}),
                "pickup": load.get("pickup") or {},
                "extra_pickup": load.get("extra_pickup") or [],
                "delivery": load.get("delivery") or {},
                "extra_delivery": load.get("extra_delivery") or [],
                "price": load.get("price"),
                "total_price": load.get("total_price"),
                "RPM": load.get("RPM"),
                "miles": load.get("total_miles"),
            })

        # ---------- сортировка и order ----------
        # Сначала точки с валидным sort_dt (по возрастанию), затем без (в исходном порядке)
        sortable.sort(key=lambda x: (0, x[1]) if x[1] is not None else (1, None))

        route_points = []
        for idx, (p, _) in enumerate(sortable, start=1):
            route_points.append({**p, "order": idx})

        # order обратно в pickup_points/delivery_points
        idx_map = {(p["type"], p["load_id"], p["address"], p["date_from_iso"], p["date_to_iso"], p["time_from"], p["time_to"]): p["order"]
                   for p in route_points}
        for arr in (pickup_points, delivery_points):
            for pt in arr:
                key = (pt["type"], pt["load_id"], pt["address"], pt["date_from_iso"], pt["date_to_iso"], pt["time_from"], pt["time_to"])
                pt["order"] = idx_map.get(key)

        return jsonify({
            "success": True,
            "pickup_points": pickup_points,
            "delivery_points": delivery_points,
            "route_points": route_points,
            "loads": result_loads
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500



@dispatch_bp.route('/api/consolidation/save', methods=['POST'])
@login_required
def save_consolidation():
    """
    Принимает уже посчитанные на фронте значения и сохраняет их
    БЕЗ повторных расчётов расстояния/цены.

    Ожидаемый payload:
    {
      "load_ids": ["...oid1...", "...oid2...", ...],
      "route_points": [
        {
          "order": 1,                       # не обязателен, если нет — будет проставлен по порядку
          "type": "pickup" | "delivery",    # опционально
          "address": "str",
          "date_from_iso": "2025-08-27T08:00:00-05:00",  # опционально
          "date_to_iso":   "2025-08-27T12:00:00-05:00",  # опционально
          "time_from": "08:00",             # опционально
          "time_to":   "12:00",             # опционально
          "lng": -87.65,                    # опционально
          "lat": 41.88,                     # опционально
          "scheduled_at": "ISO",            # опционально (для обратной совместимости)
          "load_id": "...oid..."
        },
        ...
      ],
      "total_miles": 1667.81,              # присылает фронт
      "total_price": 1250.00,              # присылает фронт (сумма цен уникальных грузов)
      "rpm": 0.75                          # опционально; если не пришёл, посчитаем price/miles
    }
    """
    try:
        from bson import ObjectId
        from datetime import datetime
        from flask import jsonify, request

        data = request.get_json(silent=True) or {}

        raw_load_ids = data.get('load_ids') or []
        route_points = data.get('route_points') or []

        # --- Валидация ID грузов ---
        object_ids = []
        for lid in raw_load_ids:
            try:
                object_ids.append(ObjectId(lid))
            except Exception:
                # пропускаем невалидные
                pass

        if not object_ids:
            return jsonify({"success": False, "error": "Missing load_ids"}), 400
        if not route_points:
            return jsonify({"success": False, "error": "Missing route_points"}), 400

        # --- Берём готовые итоги от фронта ---
        total_miles = float(data.get("total_miles") or data.get("miles") or 0) or 0.0
        total_price = float(data.get("total_price") or data.get("price_total") or 0) or 0.0
        rpm = data.get("rpm")

        # Если total_price не прислали — fallback: суммируем по БД (total_price > price)
        if not total_price:
            loads = list(loads_collection.find(
                {'_id': {'$in': object_ids}},
                {'price': 1, 'total_price': 1}
            ))
            total_price = sum(float(l.get('total_price') if l.get('total_price') is not None else l.get('price') or 0) for l in loads)

        # Если rpm не прислали, а мили есть — считаем простым делением
        if rpm is None and total_miles > 0:
            rpm = round(total_price / total_miles, 2)
        else:
            try:
                rpm = round(float(rpm), 2)
            except Exception:
                rpm = 0.0

        # --- Нормализуем точки маршрута и сохраняем все поля ---
        normalized_points = []
        for idx, p in enumerate(route_points, start=1):
            lid = p.get("load_id")
            lid_oid = ObjectId(lid) if lid and ObjectId.is_valid(lid) else None
            if not lid_oid:
                continue

            normalized_points.append({
                "order": int(p.get("order") or idx),
                "type": (p.get("type") or "").strip(),
                "address": (p.get("address") or "").strip(),
                "load_id": lid_oid,

                # временные окна, если пришли
                "date_from_iso": p.get("date_from_iso") or "",
                "date_to_iso":   p.get("date_to_iso") or "",
                "time_from":     p.get("time_from") or "",
                "time_to":       p.get("time_to") or "",

                # координаты, если пришли
                "lng": p.get("lng", None),
                "lat": p.get("lat", None),

                # обратная совместимость со старым полем
                "scheduled_at": p.get("scheduled_at") or p.get("date_from_iso") or ""
            })

        if not normalized_points:
            return jsonify({"success": False, "error": "No valid points after normalization"}), 400

        consolidated_doc = {
            "load_ids": object_ids,
            "route_points": normalized_points,
            "total_miles": round(float(total_miles), 2),
            "total_price": round(float(total_price), 2),
            "rpm": float(rpm),
            "created_at": datetime.utcnow(),
            "created_by": ObjectId(current_user.id)
        }

        res = consolidated_loads_collection.insert_one(consolidated_doc)
        consolidate_id = res.inserted_id

        # помечаем грузы
        loads_collection.update_many(
            {'_id': {'$in': object_ids}},
            {'$set': {'consolidated': True, 'consolidateId': consolidate_id}}
        )

        return jsonify({
            "success": True,
            "miles": consolidated_doc["total_miles"],
            "rpm": consolidated_doc["rpm"]
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@dispatch_bp.route('/api/loads/consolidation_status', methods=['POST'])
@login_required
def consolidation_status_for_loads():
    """
    Вход:
      {
        "load_ids": ["<oid>", "<oid>", ...],
        "include_docs": true|false
      }

    Ответ:
      {
        "success": true,
        "items": [
          {"load_id": "<oid>", "consolidated": true/false, "consolidateId": "<oid>|null"}
        ],
        "groups": [           # если include_docs = true
          {
            "_id": "<oid>",
            "load_ids": ["<oid>", ...],
            "route_points": [ { ... , "load_id": "<oid>", ... } ],
            "total_miles": 0.0,
            "total_price": 0.0,
            "rpm": 0.0
          }
        ]
      }
    """
    try:
        from flask import request, jsonify
        from bson import ObjectId
        import traceback

        payload = request.get_json(silent=True) or {}
        raw_ids = payload.get("load_ids") or []
        include_docs = bool(payload.get("include_docs"))

        # --- нормализация входных id ---
        obj_ids = []
        for s in raw_ids:
            try:
                obj_ids.append(ObjectId(s))
            except Exception:
                pass

        items = []
        consolidate_ids = set()

        if obj_ids:
            cursor = loads_collection.find(
                {"_id": {"$in": obj_ids}},
                {"_id": 1, "consolidated": 1, "consolidateId": 1}
            )
            for doc in cursor:
                cid = doc.get("consolidateId")
                # собрать id групп для догрузки
                if cid:
                    if isinstance(cid, ObjectId):
                        consolidate_ids.add(cid)
                    else:
                        try:
                            consolidate_ids.add(ObjectId(cid))
                        except Exception:
                            pass

                items.append({
                    "load_id": str(doc["_id"]),
                    "consolidated": bool(doc.get("consolidated", False)),
                    "consolidateId": str(cid) if cid else None
                })

        result = {"success": True, "items": items}

        # --- по запросу подтягиваем сами документы консолидаций ---
        if include_docs and consolidate_ids:
            groups = []
            for g in consolidated_loads_collection.find({"_id": {"$in": list(consolidate_ids)}}):
                # сериализуем вложенные load_id в route_points
                norm_points = []
                for p in (g.get("route_points") or []):
                    q = dict(p)  # неглубокая копия
                    lid = q.get("load_id")
                    if isinstance(lid, ObjectId):
                        q["load_id"] = str(lid)
                    elif lid is not None:
                        # иногда мог сохраниться как строка — оставим как есть
                        q["load_id"] = str(lid)
                    # привести order к int, lng/lat к float (если есть)
                    if "order" in q:
                        try: q["order"] = int(q["order"])
                        except Exception: pass
                    if "lng" in q:
                        try: q["lng"] = float(q["lng"])
                        except Exception: pass
                    if "lat" in q:
                        try: q["lat"] = float(q["lat"])
                        except Exception: pass
                    norm_points.append(q)

                groups.append({
                    "_id": str(g["_id"]),
                    "load_ids": [str(x) for x in (g.get("load_ids") or [])],
                    "route_points": norm_points,
                    "total_miles": float(g.get("total_miles") or 0),
                    "total_price": float(g.get("total_price") or 0),
                    "rpm": float(g.get("rpm") or 0)
                })
            result["groups"] = groups

        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500



@dispatch_bp.route('/api/drivers/break', methods=['POST'])
@login_required
def save_driver_break():
    try:
        data = request.get_json()
        driver_id = data.get("driver_id")
        reason = data.get("reason")
        start_date_str = data.get("start_date")  # ISO: "2025-06-24T00:00:00.000Z"
        end_date_str = data.get("end_date")

        if not driver_id or not reason or not start_date_str or not end_date_str:
            return jsonify({"success": False, "error": "Missing fields"}), 400

        # Получаем таймзону из базы
        tz_doc = db.company_timezone.find_one({}) or {}
        tz_name = tz_doc.get("timezone", "America/Chicago")
        tz = ZoneInfo(tz_name)

        # Парсим ISO-формат и конвертируем в локальную таймзону
        start_utc = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
        end_utc = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))

        # Переводим в локальное время
        start_local = start_utc.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        end_local = end_utc.astimezone(tz).replace(hour=23, minute=59, second=59, microsecond=999999)

        # Сохраняем в UTC (Mongo предпочитает UTC)
        doc = {
            "driver_id": ObjectId(driver_id),
            "reason": reason,
            "start_date": start_local.astimezone(ZoneInfo("UTC")),
            "end_date": end_local.astimezone(ZoneInfo("UTC")),
            "created_at": datetime.utcnow(),
            "created_by": ObjectId(current_user.id)
        }

        db.drivers_brakes.insert_one(doc)
        return jsonify({"success": True})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@dispatch_bp.route('/api/driver/location/<driver_id>')
@login_required
def get_driver_location(driver_id):
    try:
        from datetime import datetime

        print(f"🔍 Получение местоположения для водителя: {driver_id}")

        driver = drivers_collection.find_one({'_id': ObjectId(driver_id)})
        if not driver:
            print("❌ Водитель не найден")
            return jsonify({'success': False, 'error': 'Driver not found'}), 404

        truck_id = driver.get('truck')
        if not truck_id:
            print("❌ У водителя нет привязанного трака")
            return jsonify({'success': False, 'error': 'Driver has no assigned truck'}), 400

        truck = trucks_collection.find_one({'_id': ObjectId(truck_id)})
        if not truck:
            print("❌ Трак не найден")
            return jsonify({'success': False, 'error': 'Truck not found'}), 404

        vin = truck.get('vin')
        print(f"✅ VIN трака: {vin}")
        if not vin:
            print("❌ VIN отсутствует")
            return jsonify({'success': False, 'error': 'Truck missing VIN number'}), 400

        samsara_integration = integrations_settings_collection.find_one({'name': 'samsara'})
        mapbox_integration = integrations_settings_collection.find_one({'name': 'MapBox'})

        samsara_token = samsara_integration.get('api_key') if samsara_integration else None
        mapbox_token = mapbox_integration.get('api_key') if mapbox_integration else None
        print(f"🗺️ Mapbox token: {mapbox_token}")
        print(f"🔐 Samsara token: {samsara_token}")

        if not samsara_token:
            print("❌ Нет токена Samsara")
            return jsonify({'success': False, 'error': 'Samsara token missing'}), 500

        # === Получаем местоположение от Samsara ===
        print("🌐 Запрос к Samsara API...")
        url = "https://api.samsara.com/fleet/vehicles/stats?types=gps"
        headers = {
            "accept": "application/json",
            "authorization": f"Bearer {samsara_token}"
        }

        response = requests.get(url, headers=headers)
        print(f"📡 Ответ Samsara статус: {response.status_code}")
        if response.status_code != 200:
            print("❌ Ошибка при запросе к Samsara")
            return jsonify({'success': False, 'error': 'Samsara API error'}), 500

        data = response.json()
        vehicles = data.get("data", [])
        print(f"🔢 Найдено {len(vehicles)} vehicles")

        matched = None
        for vehicle in vehicles:
            ext_ids = vehicle.get("externalIds", {})
            if ext_ids.get("samsara.vin") == vin:
                matched = vehicle
                break

        if not matched:
            print("❌ Совпадение по VIN не найдено")
            return jsonify({'success': False, 'error': 'VIN not found in Samsara'}), 404

        gps = matched.get("gps")
        if not gps:
            print("❌ Нет данных GPS в найденном vehicle")
            return jsonify({'success': False, 'error': 'Location not found'}), 404

        lat = gps.get("latitude")
        lng = gps.get("longitude")
        print(f"📍 Координаты: {lat}, {lng}")

        # === Поиск грузов на сегодня ===
        today_str = datetime.utcnow().strftime("%m/%d/%Y")
        loads_cursor = loads_collection.find({
            'assigned_driver': ObjectId(driver_id),
            '$or': [
                {'pickup.date': today_str},
                {'delivery.date': today_str}
            ]
        })

        today_loads = []
        for load in loads_cursor:
            today_loads.append({
                'pickup': load.get('pickup', {}),
                'delivery': load.get('delivery', {}),
                'load_id': str(load.get('_id'))
            })

        print(f"📦 Найдено грузов на сегодня: {len(today_loads)}")

        return jsonify({
            'success': True,
            'lat': lat,
            'lng': lng,
            'driver_name': driver.get('name'),
            'mapbox_token': mapbox_token,
            'location_text': gps.get("reverseGeo", {}).get("formattedLocation", ""),
            'loads': today_loads
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500




@dispatch_bp.route('/api/drivers/break/delete', methods=['POST'])
@login_required
def delete_driver_break():
    """
    Вход:  { "break_id": "<oid>" }
    Выход: { "success": true } | { "success": false, "error": "..." }
    """
    try:
        from flask import request, jsonify
        from bson import ObjectId

        payload = request.get_json(silent=True) or {}
        bid = payload.get("break_id")

        if not bid:
            return jsonify({"success": False, "error": "Missing break_id"}), 400
        if not ObjectId.is_valid(bid):
            return jsonify({"success": False, "error": "Invalid break_id"}), 400

        # Используем ТУ ЖЕ коллекцию, что и в get_driver_break_map:
        # db.drivers_brakes.find(...)
        res = db.drivers_brakes.delete_one({"_id": ObjectId(bid)})

        if res.deleted_count == 0:
            return jsonify({"success": False, "error": "Not found"}), 404

        return jsonify({"success": True})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@dispatch_bp.route('/api/consolidation/delete', methods=['POST'])
@login_required
def delete_consolidation():
    """
    Удаляет консолидацию и снимает флаги у связанных грузов.

    Вход:
      { "consolidate_id": "<oid>" }
      # опционально вместо этого:
      { "load_id": "<oid>" }  -> найдём его consolidateId и удалим соответствующую группу

    Ответ:
      { "success": true, "cleared_load_ids": ["..."] }
    """
    try:
        from flask import request, jsonify
        from bson import ObjectId

        payload = request.get_json(silent=True) or {}
        consolidate_id_raw = payload.get("consolidate_id") or payload.get("id")
        load_id_raw = payload.get("load_id")

        consolidate_oid = None

        # 1) если нам передали consolidate_id — используем его
        if consolidate_id_raw and ObjectId.is_valid(consolidate_id_raw):
            consolidate_oid = ObjectId(consolidate_id_raw)

        # 2) иначе если передали load_id — найдём его группу
        if not consolidate_oid and load_id_raw and ObjectId.is_valid(load_id_raw):
            doc = loads_collection.find_one(
                {"_id": ObjectId(load_id_raw)},
                {"consolidateId": 1}
            )
            cid = (doc or {}).get("consolidateId")
            if cid and ObjectId.is_valid(str(cid)):
                consolidate_oid = ObjectId(str(cid))

        if not consolidate_oid:
            return jsonify({"success": False, "error": "Invalid or missing consolidate_id"}), 400

        # найдём сам документ группы, чтобы знать её состав
        group = consolidated_loads_collection.find_one(
            {"_id": consolidate_oid},
            {"_id": 1, "load_ids": 1}
        )
        if not group:
            return jsonify({"success": False, "error": "Consolidation not found"}), 404

        load_ids = group.get("load_ids") or []

        # 1) снимаем флаг и ссылку на группу у всех грузов из группы
        loads_collection.update_many(
            {
                "$or": [
                    {"consolidateId": consolidate_oid},
                    {"_id": {"$in": load_ids}}
                ]
            },
            {
                "$unset": {"consolidateId": ""},
                "$set": {"consolidated": False}
            }
        )

        # 2) удаляем сам документ группы
        consolidated_loads_collection.delete_one({"_id": consolidate_oid})

        return jsonify({
            "success": True,
            "cleared_load_ids": [str(i) for i in load_ids]
        })
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
    



@dispatch_bp.route('/api/driver/location_updated', methods=['POST'])
@login_required
def get_driver_current_location():
    """
    Вход (JSON):
      { "driver_id": "<oid>" }

    Логика:
      drivers[_id] -> truck(ObjectId)
      trucks[_id=truck] -> samsara_vehicle_id
      integrations_settings[name='samsara'] -> api_key
      -> Samsara: GET https://api.samsara.com/fleet/vehicles/stats?types=gps&ids=<samsara_vehicle_id>

    Выход (JSON):
      {
        "success": true,
        "driver": { "_id": "...", "name": "..." },
        "truck": { "_id": "...", "number": "...", "samsara_vehicle_id": "..." },
        "location": {
          "lat": 41.88, "lng": -87.62,
          "speed": 53.2, "heading": 180,
          "address": "Chicago, IL",
          "time": "2025-08-27T21:12:03Z"
        }
      }
    """
    try:
        import requests
        from flask import request, jsonify
        from bson import ObjectId
        from datetime import datetime, timezone

        payload = request.get_json(silent=True) or {}
        driver_id_raw = (payload.get("driver_id") or "").strip()

        # --- validate driver id
        if not driver_id_raw or not ObjectId.is_valid(driver_id_raw):
            return jsonify({"success": False, "error": "Invalid driver_id"}), 400
        driver_oid = ObjectId(driver_id_raw)

        # --- find driver -> truck
        driver = db.drivers.find_one({"_id": driver_oid}, {"first_name": 1, "last_name": 1, "name": 1, "truck": 1})
        if not driver:
            return jsonify({"success": False, "error": "Driver not found"}), 404

        truck_ref = driver.get("truck")
        if not truck_ref:
            return jsonify({"success": False, "error": "Driver has no assigned truck"}), 404

        # truck_ref может быть OID или строка
        if isinstance(truck_ref, str) and ObjectId.is_valid(truck_ref):
            truck_oid = ObjectId(truck_ref)
        elif isinstance(truck_ref, ObjectId):
            truck_oid = truck_ref
        else:
            return jsonify({"success": False, "error": "Invalid truck reference on driver"}), 400

        # --- find truck -> samsara_vehicle_id
        truck = db.trucks.find_one({"_id": truck_oid}, {"number": 1, "samsara_vehicle_id": 1})
        if not truck:
            return jsonify({"success": False, "error": "Truck not found"}), 404

        samsara_vehicle_id = truck.get("samsara_vehicle_id")
        if not samsara_vehicle_id:
            return jsonify({"success": False, "error": "Truck has no samsara_vehicle_id"}), 404

        # --- get samsara api token from integrations_settings
        integ = db.integrations_settings.find_one({"name": {"$regex": r"^samsara$", "$options": "i"}}) or {}
        api_key = (integ.get("api_key") or "").strip()
        if not api_key:
            return jsonify({"success": False, "error": "Samsara API token not found"}), 500

        # --- call Samsara Vehicle Stats snapshot (types=gps), filtered by ids
        # Docs: /fleet/vehicles/stats with types=gps (snapshot of last known GPS) and filtering by ids.
        # https://api.samsara.com/fleet/vehicles/stats?types=gps&ids=<ID>
        url = "https://api.samsara.com/fleet/vehicles/stats"
        params = {
            "types": "gps",
            "ids": str(samsara_vehicle_id)
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json"
        }

        try:
            resp = requests.get(url, headers=headers, params=params, timeout=10)
        except Exception as ex:
            return jsonify({"success": False, "error": f"Samsara request failed: {ex}"}), 502

        if resp.status_code == 401:
            return jsonify({"success": False, "error": "Samsara unauthorized (check API key/permissions)"}), 502
        if resp.status_code == 404:
            return jsonify({"success": False, "error": "Samsara vehicle not found"}), 404
        if resp.status_code >= 400:
            return jsonify({"success": False, "error": f"Samsara error: HTTP {resp.status_code}"}), 502

        data = {}
        try:
            data = resp.json() or {}
        except Exception:
            return jsonify({"success": False, "error": "Invalid JSON from Samsara"}), 502

        # --- parse result
        # ожидаем структуру вида: { "data": [ { "id": "...", "gps": [ { latitude, longitude, time, heading, speed, reverseGeo{formattedLocation} } ] } ], "pagination": ... }
        found = None
        for entry in (data.get("data") or []):
            # подстрахуемся по id совпадению
            if str(entry.get("id")) == str(samsara_vehicle_id):
                found = entry
                break
        if not found and (data.get("data") or []):
            # если единственный элемент — берём его
            if len(data["data"]) == 1:
                found = data["data"][0]

        if not found:
            return jsonify({"success": False, "error": "No GPS data for this vehicle"}), 404

        gps_arr = found.get("gps") or []
        # иногда API может вернуть объект; приведём к списку
        if isinstance(gps_arr, dict):
            gps_arr = [gps_arr]
        last = gps_arr[-1] if gps_arr else {}

        # вытащим координаты/адрес/скорость/heading/время
        lat = last.get("latitude") or last.get("lat")
        lng = last.get("longitude") or last.get("lon") or last.get("lng")
        heading = last.get("heading")
        speed = last.get("speed") or last.get("speedMph") or last.get("speedKph")
        ts = last.get("time") or last.get("timestamp") or last.get("reportedAtTime")
        address = None
        rev = last.get("reverseGeo") or {}
        if isinstance(rev, dict):
            address = rev.get("formattedLocation") or rev.get("name") or None

        # нормализуем время в ISO
        time_iso = None
        if ts:
            try:
                # 'Z' -> +00:00
                time_iso = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
            except Exception:
                time_iso = str(ts)

        result = {
            "success": True,
            "driver": {
                "_id": str(driver["_id"]),
                "name": (driver.get("name")
                         or f"{driver.get('first_name','').strip()} {driver.get('last_name','').strip()}").strip()
            },
            "truck": {
                "_id": str(truck["_id"]),
                "number": truck.get("number", ""),
                "samsara_vehicle_id": str(samsara_vehicle_id)
            },
            "location": {
                "lat": float(lat) if lat is not None else None,
                "lng": float(lng) if lng is not None else None,
                "heading": float(heading) if heading is not None else None,
                "speed": float(speed) if speed is not None else None,
                "address": address,
                "time": time_iso
            }
        }

        # если координат нет — отдаём понятную ошибку
        if result["location"]["lat"] is None or result["location"]["lng"] is None:
            return jsonify({"success": False, "error": "GPS location not available for this vehicle"}), 404

        return jsonify(result)

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500