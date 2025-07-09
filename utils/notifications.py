# utils/notifications.py

import requests
import logging

def send_push_notification(token, title, body):
    logging.info("📲 Отправка PUSH уведомления...")
    logging.info(f"🔑 Token: {token}")
    logging.info(f"📝 Title: {title}")
    logging.info(f"📝 Body: {body}")

    payload = {
        "to": token,
        "sound": "default",
        "title": title,
        "body": body
    }

    try:
        response = requests.post("https://exp.host/--/api/v2/push/send", json=payload)
        logging.info(f"✅ Push sent: {response.status_code} | Response: {response.text}")
    except Exception as e:
        logging.warning(f"❌ Ошибка отправки push: {str(e)}")