# tools/jwt_auth.py

import jwt
from functools import wraps
from flask import request, jsonify, current_app, g


def jwt_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)

        print("🛡️ JWT декоратор сработал")
        print("📩 Все заголовки запроса:", dict(request.headers))

        auth_header = request.headers.get('Authorization', '')
        print("🔑 Authorization header:", auth_header)

        if not auth_header.startswith('Bearer '):
            print("❌ Нет Bearer токена")
            return jsonify({'success': False, 'error': 'Missing or invalid token'}), 401

        token = auth_header.split(' ')[1]
        try:
            jwt_secret = current_app.config["JWT_SECRET"]
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])

            g.user_id = payload['user_id']
            g.role = payload['role']
            g.username = payload.get('username', '')
            print("✅ Токен валиден, g.user_id =", g.user_id)
        except Exception as e:
            print("❌ Ошибка декодирования токена:", e)
            return jsonify({'success': False, 'error': 'Invalid token'}), 401

        return f(*args, **kwargs)
    return decorated_function