from flask import Blueprint, jsonify, request
from flask_login import login_required
import logging
import requests
from urllib.parse import urlencode
from datetime import datetime, timedelta
from tools.db import db

super_dispatch_bp = Blueprint('super_dispatch', __name__)
integrations_settings_collection = db['integrations_settings']


def fetch_and_save_token(integration_name="Super Dispatch SKF"):
    integration = integrations_settings_collection.find_one({"name": integration_name})
    if not integration:
        return {"success": False, "error": "Интеграция не найдена в базе"}, 400

    client_id = integration.get("login")
    client_secret = integration.get("password")

    if not client_id or not client_secret:
        return {"success": False, "error": "Отсутствуют login/password"}, 400

    env = integration.get("environment", "production").lower()
    if env == "staging":
        oauth_url = "https://staging.carrier.superdispatch.org/oauth/token/"
    else:
        oauth_url = "https://carrier.superdispatch.com/oauth/token/"

    payload = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }

    try:
        response = requests.post(oauth_url, data=urlencode(payload), headers=headers)
    except Exception as e:
        logging.error(f"Ошибка подключения к Super Dispatch: {e}")
        return {"success": False, "error": f"Ошибка подключения: {str(e)}"}, 500

    if response.status_code != 200:
        return {
            "success": False,
            "error": f"Ошибка {response.status_code}",
            "raw": response.text
        }, 400

    data = response.json()
    access_token = data.get("access_token")
    expires_in = data.get("expires_in", 0)
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

    integrations_settings_collection.update_one(
        {"_id": integration["_id"]},
        {"$set": {
            "access_token": access_token,
            "expires_at": expires_at
        }}
    )

    return {
        "success": True,
        "access_token": access_token,
        "expires_at": expires_at.isoformat()
    }, 200


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

        base_url = "https://carrier.superdispatch.com/v1"
        if integration.get("environment", "").lower() == "staging":
            base_url = "https://staging.carrier.superdispatch.org/v1"

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
                return jsonify({
                    "success": False,
                    "error": f"Ошибка {response.status_code}",
                    "raw": response.text
                }), 400

            data = response.json()
            all_drivers.extend(data.get("data", []))
            url = data.get("pagination", {}).get("next")

        return jsonify({
            "success": True,
            "drivers": all_drivers,
            "count": len(all_drivers)
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@super_dispatch_bp.route('/test/super_dispatch_orders', methods=['GET'])
@login_required
def get_super_dispatch_orders():
    try:
        integration = integrations_settings_collection.find_one({"name": "Super Dispatch SKF"})
        if not integration:
            return jsonify({"success": False, "error": "Интеграция не найдена"}), 400

        carrier_id = integration.get("carrier_id")
        if not carrier_id:
            return jsonify({"success": False, "error": "Отсутствует carrier_id"}), 400

        # Получаем валидный access_token
        access_token = get_valid_token("Super Dispatch SKF")

        # Базовый URL
        base_url = "https://carrier.superdispatch.com/v1"
        if integration.get("environment", "").lower() == "staging":
            base_url = "https://staging.carrier.superdispatch.org/v1"

        # Собираем query параметры из request.args
        query_params = {}
        status = request.args.get('status')
        if status:
            query_params['status'] = status

        # Фильтры по дате
        for op in ['lt', 'lte', 'gt', 'gte']:
            key = f"delivery_completed_at[{op}]"
            val = request.args.get(key)
            if val:
                query_params[key] = val

        url = f"{base_url}/orders/"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }

        print(f"📡 GET {url} с params {query_params}")
        response = requests.get(url, headers=headers, params=query_params)
        print(f"📡 Статус: {response.status_code}")
        print(f"📡 Ответ: {response.text}")

        if response.status_code != 200:
            return jsonify({
                "success": False,
                "error": f"Ошибка {response.status_code}",
                "raw": response.text
            }), 400

        return jsonify(response.json())

    except Exception as e:
        logging.exception("Ошибка при получении заказов:")
        return jsonify({"success": False, "error": str(e)}), 500
