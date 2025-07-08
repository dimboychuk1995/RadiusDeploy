# tools/jwt_auth.py

import jwt
from functools import wraps
from flask import request, jsonify, current_app, g

def jwt_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"success": False, "message": "Missing or invalid token"}), 401

        token = auth_header.split(" ")[1]

        try:
            decoded = jwt.decode(token, current_app.secret_key, algorithms=["HS256"])
            g.user_id = decoded.get("user_id")
            g.role = decoded.get("role")
        except jwt.ExpiredSignatureError:
            return jsonify({"success": False, "message": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"success": False, "message": "Invalid token"}), 401

        return f(*args, **kwargs)

    return decorated_function
