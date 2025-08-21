# utils/notifications.py

import logging
import requests
from typing import Any, Dict, Optional, Sequence

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

def _build_payload(
    token: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
    sound: str = "default",
    priority: str = "high",
    channel_id: Optional[str] = "default",  # Android notification channel
    ttl: Optional[int] = None,              # seconds to live (optional)
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "to": token,
        "title": title,
        "body": body,
        "sound": sound,
        "priority": priority,  # влияет на доставку на Android
        "data": data or {},    # <-- сюда кладём полезную нагрузку (например, load_id)
    }
    if channel_id:
        payload["channelId"] = channel_id   # Android канал (должен совпадать с тем, что создали в RN)
    if ttl is not None:
        payload["ttl"] = ttl
    return payload


def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
    sound: str = "default",
    priority: str = "high",
    channel_id: Optional[str] = "default",
    ttl: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Отправка одиночного push-уведомления через Expo.

    :param token: Expo push token, например 'ExponentPushToken[xxxxx]'
    :param title: Заголовок
    :param body: Текст
    :param data: Полезная нагрузка (пойдёт в notification.request.content.data на клиенте)
    :param sound: 'default' | None
    :param priority: 'default' | 'normal' | 'high'
    :param channel_id: Android notification channel id (например, 'default')
    :param ttl: Время жизни сообщения в секундах (опционально)
    :return: JSON-ответ Expo (ticket)
    """
    logging.info("📲 Отправка PUSH…")
    logging.info("🔑 Token: %s", token)
    logging.info("📝 Title: %s", title)
    logging.info("📝 Body: %s", body)
    if data:
        logging.info("📦 Data: %s", data)

    if not token or not token.startswith("ExponentPushToken"):
        raise ValueError("Invalid Expo push token")

    payload = _build_payload(token, title, body, data, sound, priority, channel_id, ttl)

    try:
        resp = requests.post(EXPO_PUSH_URL, json=payload, timeout=15)
        resp.raise_for_status()
        out = resp.json()
        logging.info("✅ Push sent: %s | %s", resp.status_code, out)
        # Expo может вернуть ошибки уровня ticket, их тоже логируем:
        if isinstance(out, dict) and "data" in out:
            items = out.get("data")
            # для одиночной отправки это обычно dict
            if isinstance(items, dict) and items.get("status") != "ok":
                logging.warning("⚠️ Expo ticket not OK: %s", items)
        return out
    except requests.RequestException as e:
        logging.exception("❌ Ошибка отправки push: %s", e)
        raise


def send_push_notifications(
    tokens: Sequence[str],
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
    sound: str = "default",
    priority: str = "high",
    channel_id: Optional[str] = "default",
    ttl: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Батч-отправка (несколько токенов одним запросом).
    Удобно, если надо слать одному водителю на несколько устройств или группе.

    :return: JSON-ответ Expo (tickets list)
    """
    payload = [
        _build_payload(t, title, body, data, sound, priority, channel_id, ttl)
        for t in tokens
        if t and t.startswith("ExponentPushToken")
    ]
    if not payload:
        raise ValueError("No valid Expo tokens provided")

    try:
        resp = requests.post(EXPO_PUSH_URL, json=payload, timeout=20)
        resp.raise_for_status()
        out = resp.json()
        logging.info("✅ Batch push sent: %s | %s", resp.status_code, out)
        return out
    except requests.RequestException as e:
        logging.exception("❌ Ошибка батч-отправки push: %s", e)
        raise