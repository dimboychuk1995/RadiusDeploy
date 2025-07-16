from flask import Blueprint, jsonify
from flask_login import login_required
import logging
import requests
from urllib.parse import urlencode
from datetime import datetime, timedelta, timezone
from tools.db import db
from dateutil.parser import parse as parse_date
from tools.socketio_instance import socketio
from flask import request
import threading
import pytz
from flask import Response
import json

super_dispatch_bp = Blueprint('super_dispatch', __name__)
integrations_settings_collection = db['integrations_settings']
loads_collection = db['loads']

def parse_date(date_str):
    if not date_str or not date_str.strip():
        return None
    try:
        # Super Dispatch обычно отдаёт даты в ISO формате
        dt = datetime.fromisoformat(date_str.rstrip("Z"))  # без Z для совместимости
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=pytz.utc)
        return dt.astimezone(pytz.utc)
    except Exception as e:
        logging.warning(f"⚠️ parse_date('{date_str}') failed: {e}")
        return None

def format_date_mmddyyyy(date_str):
    if not date_str:
        return ""
    try:
        dt = parse_date(date_str)
        return dt.strftime("%m/%d/%Y")
    except Exception:
        return date_str  # fallback — если не распарсилось

def fetch_and_save_token(integration_name="Super Dispatch SKF"):
    integration = integrations_settings_collection.find_one({"name": integration_name})
    if not integration:
        return {"success": False, "error": "Интеграция не найдена в базе"}, 400

    client_id = integration.get("login")
    client_secret = integration.get("password")

    if not client_id or not client_secret:
        return {"success": False, "error": "Отсутствуют login/password"}, 400

    env = integration.get("environment", "production").lower()
    oauth_url = "https://staging.carrier.superdispatch.org/oauth/token/" if env == "staging" \
        else "https://carrier.superdispatch.com/oauth/token/"

    payload = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret
    }

    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    try:
        response = requests.post(oauth_url, data=urlencode(payload), headers=headers)
    except Exception as e:
        logging.error(f"Ошибка подключения к Super Dispatch: {e}")
        return {"success": False, "error": f"Ошибка подключения: {str(e)}"}, 500

    if response.status_code != 200:
        return {"success": False, "error": f"Ошибка {response.status_code}", "raw": response.text}, 400

    data = response.json()
    access_token = data.get("access_token")
    expires_in = data.get("expires_in", 0)
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

    integrations_settings_collection.update_one(
        {"_id": integration["_id"]},
        {"$set": {"access_token": access_token, "expires_at": expires_at}}
    )

    return {"success": True, "access_token": access_token, "expires_at": expires_at.isoformat()}, 200

@super_dispatch_bp.route('/test/super_dispatch_token', methods=['POST'])
@login_required
def post_token():
    result, status = fetch_and_save_token()
    return jsonify(result), status


@super_dispatch_bp.route('/test/super_dispatch_token_safe', methods=['GET'])
@login_required
def get_token_safe():
    result, status = fetch_and_save_token()
    return jsonify(result), status


def get_valid_token(integration_name="Super Dispatch SKF"):
    integration = integrations_settings_collection.find_one({"name": integration_name})
    if not integration:
        raise Exception("❌ Интеграция не найдена")

    access_token = integration.get("access_token")
    expires_at = integration.get("expires_at")

    if access_token and expires_at:
        try:
            expires_at_dt = datetime.fromisoformat(str(expires_at))
            if expires_at_dt > datetime.utcnow():
                return access_token
        except Exception:
            pass

    token_response, status = fetch_and_save_token(integration_name)
    if status != 200:
        raise Exception(f"❌ Не удалось получить токен: {token_response.get('error')}")
    return token_response["access_token"]


@super_dispatch_bp.route('/test/super_dispatch_drivers', methods=['GET'])
@login_required
def get_super_dispatch_drivers():
    try:
        integration = integrations_settings_collection.find_one({"name": "Super Dispatch SKF"})
        if not integration:
            return jsonify({"success": False, "error": "Интеграция не найдена"}), 400

        carrier_id = integration.get("carrier_id")
        if not carrier_id:
            return jsonify({"success": False, "error": "Отсутствует carrier_id в базе"}), 400

        access_token = get_valid_token("Super Dispatch SKF")

        base_url = "https://staging.carrier.superdispatch.org/v1" if integration.get("environment", "").lower() == "staging" \
            else "https://carrier.superdispatch.com/v1"

        url = f"{base_url}/carriers/{carrier_id}/drivers/"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }

        all_drivers = []
        while url:
            print(f"📡 GET: {url}")
            response = requests.get(url, headers=headers)
            if response.status_code != 200:
                return jsonify({"success": False, "error": f"Ошибка {response.status_code}", "raw": response.text}), 400

            data = response.json()
            all_drivers.extend(data.get("data", []))
            url = data.get("pagination", {}).get("next")

        return Response(
            json.dumps({
                "success": True,
                "drivers": all_drivers,
                "count": len(all_drivers)
            }, indent=2, ensure_ascii=False),
            mimetype="application/json"
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@socketio.on('fetch_super_dispatch_orders')
def handle_fetch_super_dispatch_orders_socket(data=None):
    def run():
        try:
            response = import_super_dispatch_orders()
        except Exception as e:
            logging.exception("Ошибка в WebSocket импорте Super Dispatch")
            socketio.emit("super_dispatch_done", {
                "success": False,
                "message": str(e)
            })

    threading.Thread(target=run).start()

@super_dispatch_bp.route('/test/super_dispatch_orders_insert', methods=['GET'])
def import_super_dispatch_orders():
    try:
        integration = integrations_settings_collection.find_one({"name": "Super Dispatch SKF"})
        if not integration:
            result = {"success": False, "message": "Интеграция не найдена"}
            socketio.emit("super_dispatch_done", result)
            print(result["message"])
            return result, 400

        access_token = get_valid_token("Super Dispatch SKF")

        base_url = "https://staging.carrier.superdispatch.org/v1" if integration.get("environment", "").lower() == "staging" \
            else "https://carrier.superdispatch.com/v1"

        url = f"{base_url}/orders/"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }

        print(f"📡 GET {url}")
        response = requests.get(url, headers=headers)
        print(f"📡 Статус: {response.status_code}")

        if response.status_code != 200:
            result = {"success": False, "message": f"Ошибка {response.status_code}", "raw": response.text}
            socketio.emit("super_dispatch_done", result)
            print(result["message"])
            return result, 400

        data = response.json()
        orders = data.get('data', [])

        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=7)
        print(f"🕓 Фильтр: {start_date.isoformat()} — {end_date.isoformat()}")

        filtered_orders = []
        for order in orders:
            completed_str = order.get('delivery', {}).get('completed_at')

            if not completed_str:
                filtered_orders.append(order)
                continue

            try:
                completed_at = parse_date(completed_str)
                if completed_at.tzinfo is None:
                    completed_at = completed_at.replace(tzinfo=timezone.utc)

                if start_date <= completed_at <= end_date:
                    filtered_orders.append(order)
            except Exception as dt_err:
                print(f"⚠️ Ошибка даты у Order {order.get('id')}: {dt_err}")

        gmaps_settings = integrations_settings_collection.find_one({"name": "Google Maps API"})
        gmaps_api_key = gmaps_settings.get("api_key") if gmaps_settings else None
        driver_cache = {}

        def get_driver_name(driver_id):
            if not driver_id:
                return None
            if driver_id in driver_cache:
                return driver_cache[driver_id]
            try:
                driver_url = f"{base_url}/drivers/{driver_id}/"
                resp = requests.get(driver_url, headers=headers)
                if resp.status_code == 200:
                    driver_data = resp.json().get("data", {})
                    name = driver_data.get("name")
                    driver_cache[driver_id] = name
                    return name
            except Exception as ex:
                print(f"❌ Исключение при получении водителя {driver_id}: {ex}")
            return None

        for order in filtered_orders:
            carrier_name_str = order.get("carrier_name", "").strip()
            company = db.companies.find_one({"name": {"$regex": f"^{carrier_name_str}$", "$options": "i"}})
            company_sign_id = company["_id"] if company else None

            driver_id = order.get("driver_id")
            driver_name = get_driver_name(driver_id)
            assigned_driver_obj = None
            assigned_dispatch_obj = None
            assigned_power_unit_obj = None

            if driver_name:
                matched_driver = db.drivers.find_one({"name": {"$regex": f"^{driver_name}$", "$options": "i"}})
                if matched_driver:
                    assigned_driver_obj = matched_driver["_id"]
                    assigned_dispatch_obj = matched_driver.get("dispatcher")
                    assigned_power_unit_obj = matched_driver.get("truck")

            try:
                price = float(order.get("price", 0))
            except:
                price = None

            load_doc = {
                "is_super_dispatch_order": True,
                "load_id": str(order["number"]),
                "company_sign": company_sign_id,
                "broker_load_id": order.get("customer", {}).get("name"),
                "broker_customer_type": "broker",
                "broker_email": order.get("customer", {}).get("contact", {}).get("email", ""),
                "broker_phone_number": order.get("customer", {}).get("contact", {}).get("phone", ""),
                "type": "Vehicle",
                "weight": None,
                "price": price,
                "load_description": order.get("instructions"),
                "vehicles": order.get("vehicles", []),
                "assigned_driver": assigned_driver_obj,
                "assigned_dispatch": assigned_dispatch_obj,
                "assigned_power_unit": assigned_power_unit_obj,
                "pickup": {
                    "company": order.get("pickup", {}).get("venue", {}).get("name"),
                    "address": ", ".join(filter(None, [
                        order.get("pickup", {}).get("venue", {}).get("address"),
                        order.get("pickup", {}).get("venue", {}).get("city"),
                        order.get("pickup", {}).get("venue", {}).get("state"),
                        order.get("pickup", {}).get("venue", {}).get("zip")
                    ])),
                    "date": parse_date(
                        order.get("pickup", {}).get("completed_at") or
                        order.get("pickup", {}).get("scheduled_at")
                    ),
                    "instructions": order.get("pickup", {}).get("notes", ""),
                    "contact_person": order.get("pickup", {}).get("venue", {}).get("contact", {}).get("name", ""),
                    "contact_phone_number": order.get("pickup", {}).get("venue", {}).get("contact", {}).get("phone", ""),
                    "contact_email": order.get("pickup", {}).get("venue", {}).get("contact", {}).get("email", "")
                },
                "delivery": {
                    "company": order.get("delivery", {}).get("venue", {}).get("name"),
                    "address": ", ".join(filter(None, [
                        order.get("delivery", {}).get("venue", {}).get("address"),
                        order.get("delivery", {}).get("venue", {}).get("city"),
                        order.get("delivery", {}).get("venue", {}).get("state"),
                        order.get("delivery", {}).get("venue", {}).get("zip")
                    ])),
                    "date": parse_date(
                        order.get("delivery", {}).get("completed_at") or
                        order.get("delivery", {}).get("scheduled_at")
                    ),
                    "instructions": order.get("delivery", {}).get("notes", ""),
                    "contact_person": order.get("delivery", {}).get("venue", {}).get("contact", {}).get("name", ""),
                    "contact_phone_number": order.get("delivery", {}).get("venue", {}).get("contact", {}).get("phone", ""),
                    "contact_email": order.get("delivery", {}).get("venue", {}).get("contact", {}).get("email", "")
                },
                "extra_pickup": None,
                "extra_delivery": None,
                "extra_stops": 0,
                "status": order.get("status", "New"),
                "payment_status": "Не оплачен",
                "rate_con": None,
                "bol": order.get("pdf_bol_url"),
                "company": "UWC",
                "was_added_to_statement": False
            }

            pickup_address = load_doc['pickup']['address']
            delivery_address = load_doc['delivery']['address']
            total_miles = None
            rpm = None

            if gmaps_api_key and pickup_address and delivery_address:
                try:
                    params = {
                        "origin": pickup_address,
                        "destination": delivery_address,
                        "key": gmaps_api_key
                    }
                    gmaps_url = "https://maps.googleapis.com/maps/api/directions/json"
                    gmaps_response = requests.get(gmaps_url, params=params)
                    if gmaps_response.status_code == 200:
                        gmaps_data = gmaps_response.json()
                        if gmaps_data.get("routes"):
                            meters = gmaps_data["routes"][0]["legs"][0]["distance"]["value"]
                            total_miles = round(meters / 1609.34, 2)
                            if price and total_miles > 0:
                                rpm = round(price / total_miles, 2)
                except Exception as e:
                    logging.warning(f"❗ Ошибка Google Maps для load {load_doc['load_id']}: {e}")

            if total_miles:
                load_doc["total_miles"] = total_miles
            if rpm:
                load_doc["RPM"] = rpm

            now = datetime.now(timezone.utc)
            load_doc["updated_at"] = now

            result = loads_collection.update_one(
                {"load_id": load_doc["load_id"]},
                {
                    "$set": load_doc,
                    "$setOnInsert": {"created_at": now}
                },
                upsert=True
            )

            if result.matched_count:
                print(f"🔁 Обновлён груз {load_doc['load_id']}")
            else:
                print(f"➕ Добавлен новый груз {load_doc['load_id']}")

        result = {"success": True, "message": f"Импорт завершён. Загружено: {len(filtered_orders)} заказов."}
        socketio.emit("super_dispatch_done", result)
        print(result["message"])
        return result, 200

    except Exception as e:
        logging.exception("Ошибка при импорте Super Dispatch:")
        result = {"success": False, "message": f"Ошибка: {str(e)}"}
        socketio.emit("super_dispatch_done", result)
        print(result["message"])
        return result, 500


@super_dispatch_bp.route('/test/super_dispatch_orders_list', methods=['GET'])
@login_required
def get_super_dispatch_orders_list():
    try:
        integration = integrations_settings_collection.find_one({"name": "Super Dispatch SKF"})
        if not integration:
            return jsonify({"success": False, "error": "Интеграция не найдена"}), 400

        access_token = get_valid_token("Super Dispatch SKF")

        base_url = "https://carrier.superdispatch.com/v1"
        if integration.get("environment", "").lower() == "staging":
            base_url = "https://staging.carrier.superdispatch.org/v1"

        query_params = {}
        status = request.args.get('status')
        if status:
            query_params['status'] = status

        url = f"{base_url}/orders/"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }

        print(f"📡 GET {url} с params {query_params}")
        response = requests.get(url, headers=headers, params=query_params)
        print(f"📡 Статус: {response.status_code}")

        if response.status_code != 200:
            return jsonify({
                "success": False,
                "error": f"Ошибка {response.status_code}",
                "raw": response.text
            }), 400

        data = response.json()
        orders = data.get('data', [])

        # Фильтрация по дате завершения (включая ордера без completed_at)
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=4)
        print(f"🕓 Фильтр: {start_date.isoformat()} — {end_date.isoformat()}")

        filtered_orders = []
        for order in orders:
            completed_str = order.get('delivery', {}).get('completed_at')

            if not completed_str:
                # Включаем ордера без completed_at
                print(f"➕ Order {order.get('id')} — БЕЗ completed_at (включён)")
                filtered_orders.append(order)
                continue

            try:
                completed_at = parse_date(completed_str)
                if completed_at.tzinfo is None:
                    completed_at = completed_at.replace(tzinfo=timezone.utc)

                if start_date <= completed_at <= end_date:
                    print(f"✅ Order {order.get('id')} ✅ {completed_at.isoformat()}")
                    filtered_orders.append(order)
                else:
                    print(f"⏭️ Order {order.get('id')} не попадает: {completed_at.isoformat()}")
            except Exception as dt_err:
                print(f"⚠️ Ошибка даты у Order {order.get('id')}: {dt_err}")

        return Response(
            json.dumps({
                "success": True,
                "count": len(filtered_orders),
                "orders": filtered_orders
            }, indent=2, ensure_ascii=False),
            mimetype="application/json"
        )

    except Exception as e:
        logging.exception("Ошибка при получении заказов:")
        return jsonify({"success": False, "error": str(e)}), 500

