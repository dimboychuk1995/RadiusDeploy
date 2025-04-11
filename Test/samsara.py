from flask import Blueprint, render_template, jsonify
import requests
from flask_login import login_required
from pymongo import MongoClient

samsara_bp = Blueprint('samsara', __name__)

SAMSARA_API_KEY = "samsara_api_zbYYGWZKhEizNujQwN72Kr9YrCejwO"
BASE_URL = "https://api.samsara.com"
HEADERS = {
    "Authorization": f"Bearer {SAMSARA_API_KEY}"
}

client = MongoClient("mongodb://localhost:27017/")
db = client["trucks_db"]
integrations_collection = db["integrations_settings"]

from flask import abort

@samsara_bp.route("/fragment/samsara_fragment")
@login_required
def samsara_fragment():
    integration = integrations_collection.find_one({"name": "samsara"})
    if not integration or not integration.get("enabled"):
        abort(403)  # можно 404, если хочешь "не существует"

    return render_template("fragments/samsara_fragment.html")


@samsara_bp.route("/api/vehicles")
@login_required
def get_samsara_vehicles():
    vehicles = []
    gps_data = []

    try:
        response = requests.get(f"{BASE_URL}/fleet/vehicles", headers=HEADERS)
        if response.ok:
            vehicles = response.json().get("data", [])

        gps_response = requests.get(f"{BASE_URL}/fleet/vehicles/stats?types=gps", headers=HEADERS)
        if gps_response.ok:
            gps_data = gps_response.json().get("data", [])

        gps_map = {item["id"]: item.get("gps") for item in gps_data if item.get("gps")}

        for v in vehicles:
            v["gps"] = gps_map.get(v.get("id"))
            v["tag_names"] = [tag.get("name") for tag in v.get("tags", []) if "name" in tag]

    except Exception as e:
        print("Ошибка при получении данных Samsara:", e)

    return jsonify(vehicles)

