from flask import Blueprint, render_template, jsonify, abort
import requests
from flask_login import login_required
from pymongo import MongoClient

samsara_bp = Blueprint('samsara', __name__)

BASE_URL = "https://api.samsara.com"
client = MongoClient("mongodb+srv://dimboychuk1995:Mercedes8878@trucks.5egoxb8.mongodb.net/trucks_db")
db = client["trucks_db"]
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
