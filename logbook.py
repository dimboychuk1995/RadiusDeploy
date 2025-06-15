from flask import Blueprint, render_template, current_app
from flask_login import login_required
import requests

from tools.db import db  # ✅ Используем твоё подключение

logbook = Blueprint("logbook", __name__)

@logbook.route("/fragment/logbook")
@login_required
def fragment_logbook():
    # Получаем API-ключ из коллекции
    integration = db.integrations_settings.find_one({"name": "Alpha ELD Globeks"})
    if not integration or not integration.get("api_key"):
        return render_template("fragments/logbook_fragment.html", trucks=[], error="API ключ не найден")

    token = integration["api_key"]
    url = f"https://alfaeld.com/extapi/hos-status/?by=truck&ids=3428&token={token}"

    try:
        response = requests.get(url)
        response.raise_for_status()
        trucks = response.json()
    except Exception as e:
        current_app.logger.error(f"Ошибка при запросе к Alpha ELD: {e}")
        return render_template("fragments/logbook_fragment.html", trucks=[], error="Ошибка при получении данных")

    return render_template("fragments/logbook_fragment.html", trucks=trucks, error=None)
