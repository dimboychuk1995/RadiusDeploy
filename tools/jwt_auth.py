# tools/jwt_auth.py

import jwt
from functools import wraps
from flask import request, jsonify, current_app, g
from jwt import ExpiredSignatureError, InvalidTokenError


def decode_token(token):
    try:
        jwt_secret = current_app.config["JWT_SECRET"]
        payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])
        return {
            "user_id": payload["user_id"],
            "driver_id": payload.get("driver_id"),
            "role": payload["role"],
            "username": payload.get("username", "")
        }
    except ExpiredSignatureError:
        print("❌ JWT: Token expired")
    except InvalidTokenError:
        print("❌ JWT: Invalid token")
    except Exception as e:
        print("❌ JWT: Unexpected error:", e)
    return None


def jwt_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)

        auth_header = request.headers.get('Authorization', '')

        if not auth_header.startswith('Bearer '):
            return jsonify({'success': False, 'error': 'Missing or invalid token'}), 401

        token = auth_header.split(' ')[1]
        try:
            jwt_secret = current_app.config["JWT_SECRET"]
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])

            g.user_id = payload['user_id']                    # _id пользователя
            g.driver_id = payload.get('driver_id', None)      # driver_id, если есть
            g.role = payload['role']
            g.username = payload.get('username', '')
        except Exception as e:
            return jsonify({'success': False, 'error': 'Invalid token'}), 401

        return f(*args, **kwargs)
    return decorated_function