from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
import requests
from urllib.parse import urlencode
from datetime import datetime, timedelta, timezone
from tools.db import db
from dateutil.parser import parse as parse_date
from bson import ObjectId

super_dispatch_bp = Blueprint('super_dispatch', __name__)
integrations_settings_collection = db['integrations_settings']
loads_collection = db['loads']


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

        return jsonify({"success": True, "drivers": all_drivers, "count": len(all_drivers)})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@super_dispatch_bp.route('/test/super_dispatch_orders', methods=['GET'])
@login_required
def get_super_dispatch_orders():
    try:
        integration = integrations_settings_collection.find_one({"name": "Super Dispatch SKF"})
        if not integration:
            return jsonify({"success": False, "error": "Интеграция не найдена"}), 400

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
            return jsonify({"success": False, "error": f"Ошибка {response.status_code}", "raw": response.text}), 400

        data = response.json()
        orders = data.get('data', [])

        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=1)
        print(f"🕓 Фильтр: {start_date.isoformat()} — {end_date.isoformat()}")

        filtered_orders = []
        for order in orders:
            completed_str = order.get('delivery', {}).get('completed_at')

            if not completed_str:
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

        for order in filtered_orders:
            # Поиск company_sign по имени без учёта регистра
            carrier_name_str = order.get("carrier_name", "").strip()
            company = db.companies.find_one({"name": {"$regex": f"^{carrier_name_str}$", "$options": "i"}})
            company_sign_id = company["_id"] if company else None
            if not company_sign_id:
                print(f"❌ Компания '{carrier_name_str}' не найдена в базе")

            load_doc = {
                "load_id": str(order["id"]),
                "company_sign": company_sign_id,
                "broker_load_id": order.get("customer", {}).get("name"),
                "broker_id": integration.get("broker_id", ObjectId()),
                "broker_customer_type": "customer",
                "broker_email": order.get("customer", {}).get("contact", {}).get("email", ""),
                "broker_phone_number": order.get("customer", {}).get("contact", {}).get("phone", ""),
                "type": "Vehicle",
                "weight": None,
                "RPM": None,
                "price": order.get("price"),
                "total_miles": None,
                "load_description": order.get("instructions"),
                "vehicles": order.get("vehicles", []),
                "assigned_driver": order.get("driver_id"),
                "assigned_dispatch": None,
                "assigned_power_unit": None,
                "pickup": {
                    "company": order.get("pickup", {}).get("venue", {}).get("name"),
                    "address": ", ".join(filter(None, [
                        order.get("pickup", {}).get("venue", {}).get("address"),
                        order.get("pickup", {}).get("venue", {}).get("city"),
                        order.get("pickup", {}).get("venue", {}).get("state"),
                        order.get("pickup", {}).get("venue", {}).get("zip")
                    ])),
                    "date": order.get("pickup", {}).get("completed_at"),
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
                    "date": order.get("delivery", {}).get("completed_at"),
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

            existing = loads_collection.find_one({
                "load_id": load_doc["load_id"],
                "broker_id": load_doc["broker_id"]
            })
            if not existing:
                loads_collection.insert_one(load_doc)

        return jsonify({"success": True, "count": len(filtered_orders)}), 200

    except Exception as e:
        logging.exception("Ошибка при получении заказов:")
        return jsonify({"success": False, "error": str(e)}), 500

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
        start_date = end_date - timedelta(days=2)
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

        return jsonify({
            "success": True,
            "count": len(filtered_orders),
            "orders": filtered_orders
        })

    except Exception as e:
        logging.exception("Ошибка при получении заказов:")
        return jsonify({"success": False, "error": str(e)}), 500

