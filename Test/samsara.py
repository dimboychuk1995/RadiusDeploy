from flask import Blueprint, render_template, abort
import re
from flask_login import login_required
from Test.tools.db import db

samsara_bp = Blueprint('samsara', __name__)

BASE_URL = "https://api.samsara.com"
integrations_collection = db["integrations_settings"]

def get_samsara_headers():
    integration = integrations_collection.find_one({"name": "samsara"})
    if not integration or not integration.get("api_key"):
        abort(500, description="Samsara API key not configured")
    return {
        "Authorization": f"Bearer {integration['api_key']}"
    }

@samsara_bp.route("/fragment/samsara_fragment")
@login_required
def samsara_fragment():
    samsara_integration = integrations_collection.find_one({"name": "samsara"})
    mapbox_integration = integrations_collection.find_one({"name": "MapBox"})

    if not samsara_integration or not samsara_integration.get("enabled"):
        abort(403)

    mapbox_token = mapbox_integration.get("api_key") if mapbox_integration else ""
    return render_template("fragments/samsara_fragment.html", mapbox_token=mapbox_token)

@samsara_bp.route("/api/vehicles")
@login_required
def get_samsara_vehicles():
    vehicles = []
    gps_data = []

    try:
        headers = get_samsara_headers()

        response = requests.get(f"{BASE_URL}/fleet/vehicles", headers=headers)
        if response.ok:
            vehicles = response.json().get("data", [])

        gps_response = requests.get(f"{BASE_URL}/fleet/vehicles/stats?types=gps", headers=headers)
        if gps_response.ok:
            gps_data = gps_response.json().get("data", [])

        gps_map = {item["id"]: item.get("gps") for item in gps_data if item.get("gps")}

        for v in vehicles:
            v["gps"] = gps_map.get(v.get("id"))
            v["tag_names"] = [tag.get("name") for tag in v.get("tags", []) if "name" in tag]

    except Exception as e:
        print("Ошибка при получении данных Samsara:", e)

    return jsonify(vehicles)

@samsara_bp.route('/fragment/samsara_mileage_fragment')
@login_required
def samsara_mileage_fragment():
    return render_template('fragments/samsara_mileage_fragment.html')

@samsara_bp.route('/api/samsara/drivers')
@login_required
def api_samsara_drivers():
    try:
        headers = get_samsara_headers()
        response = requests.get(f"{BASE_URL}/fleet/drivers", headers=headers)

        if not response.ok:
            return jsonify({"error": "Failed to fetch drivers"}), 500

        drivers = response.json().get("data", [])
        return jsonify(drivers)

    except Exception as e:
        print("Ошибка при получении водителей Samsara:", e)
        return jsonify({"error": str(e)}), 500


@samsara_bp.route('/api/samsara/vehicles')
@login_required
def api_samsara_vehicles():
    try:
        headers = get_samsara_headers()
        response = requests.get(f"{BASE_URL}/fleet/vehicles?limit=512", headers=headers)

        if not response.ok:
            return jsonify({"error": "Failed to fetch vehicles from Samsara"}), 500

        data = response.json().get("data", [])
        return jsonify(data)

    except Exception as e:
        print("Ошибка при получении траков из Samsara:", e)
        return jsonify({"error": str(e)}), 500


@samsara_bp.route("/api/samsara/gateways")
@login_required
def get_samsara_gateways():
    try:
        headers = get_samsara_headers()
        response = requests.get(f"{BASE_URL}/gateways", headers=headers)
        if response.ok:
            return jsonify(response.json().get("data", []))
        else:
            return jsonify({"error": "Failed to fetch gateway data"}), 500
    except Exception as e:
        print("Ошибка при получении gateways:", e)
        return jsonify({"error": str(e)}), 500


@samsara_bp.route('/api/drivers_dropdown')
@login_required
def drivers_dropdown():
    drivers = db["drivers"].find({"company": current_user.company})
    return jsonify([{"_id": str(d["_id"]), "name": d["name"]} for d in drivers])


@samsara_bp.route("/api/driver/<driver_id>")
@login_required
def get_driver_details(driver_id):
    from bson import ObjectId
    driver = db["drivers"].find_one({"_id": ObjectId(driver_id), "company": current_user.company})
    if not driver:
        return jsonify({"error": "Driver not found"}), 404

    return jsonify({
        "name": driver.get("name"),
        "phone": driver.get("phone") or driver.get("contact_number"),
        "license": driver.get("license", {}).get("number")
    })

from flask import request, jsonify
from flask_login import login_required, current_user
import requests

@samsara_bp.route("/api/samsara/create_driver", methods=["POST"])
@login_required
def create_samsara_driver():
    try:
        data = request.json

        # Получаем API-ключ
        integration = integrations_collection.find_one({"name": "samsara"})
        if not integration or not integration.get("api_key"):
            return jsonify({"error": "Samsara API ключ не найден"}), 500

        # Приводим номер телефона к 10 цифрам
        raw_phone = data.get("phone", "")
        cleaned_phone = re.sub(r"\D", "", raw_phone)  # удалить все кроме цифр

        if len(cleaned_phone) == 11 and cleaned_phone.startswith("1"):
            cleaned_phone = cleaned_phone[1:]  # удалить ведущую "1"
        elif len(cleaned_phone) != 10:
            return jsonify({
                "error": "Неверный формат номера телефона",
                "details": f"Номер должен содержать 10 цифр. Сейчас: {cleaned_phone}"
            }), 400

        # Формируем payload
        payload = {
            "hosSetting": { "heavyHaulExemptionToggleEnabled": False },
            "usDriverRulesetOverride": {
                "cycle": "USA Property (8/70)",
                "restart": "34-hour Restart",
                "restbreak": "Property (off-duty/sleeper)",
                "usStateToOverride": ""
            },
            "licenseNumber": data.get("license"),
            "name": data.get("name"),
            "phone": cleaned_phone,
            "password": data.get("password"),
            "username": data.get("username")
        }

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {integration['api_key']}"
        }

        response = requests.post("https://api.samsara.com/fleet/drivers", json=payload, headers=headers)

        if response.status_code == 200:
            return jsonify({"success": True, "message": "Водитель успешно создан в Samsara"})
        else:
            return jsonify({"error": "Ошибка Samsara", "details": response.json()}), response.status_code

    except Exception as e:
        return jsonify({"error": "Ошибка при создании водителя", "details": str(e)}), 500
