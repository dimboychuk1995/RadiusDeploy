from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from datetime import datetime

from flask_cors import cross_origin

from tools.db import db
from tools.jwt_auth import jwt_required, decode_token
from flask_socketio import join_room, emit, disconnect
from tools.socketio_instance import socketio

mobile_chat_bp = Blueprint('mobile_chat', __name__)

# ======= SOCKET.IO =======

@socketio.on('mobile_join_room')
def mobile_join_room(data):
    token = data.get('token')
    user = decode_token(token)
    if not user:
        print("❌ Socket auth failed (join)")
        disconnect()
        return

    room_id = data.get("room_id")
    if not room_id:
        return

    join_room(room_id)

@socketio.on('mobile_send_message')
def mobile_send_message(data):
    from bson import ObjectId
    from datetime import datetime

    token = data.get('token')
    user = decode_token(token)
    if not user:
        disconnect()
        return

    room_id = data.get("room_id")
    content = data.get("content", "").strip()
    if not room_id or not content:
        return

    try:
        room_oid = ObjectId(room_id)
        sender_oid = ObjectId(user["user_id"])
    except Exception as e:
        return

    timestamp = datetime.utcnow()
    sender_name = user.get("username", "Unknown")

    # 💾 Сохраняем в MongoDB
    db_message = {
        'room_id': room_oid,
        'sender_id': sender_oid,
        'sender_name': sender_name,
        'content': content,
        'timestamp': timestamp
    }
    db.chat_messages.insert_one(db_message)

    # 📤 Отправляем сериализуемый JSON клиентам
    emit_message = {
        'room_id': str(room_oid),
        'sender_id': str(sender_oid),
        'sender_name': sender_name,
        'content': content,
        'timestamp': timestamp.isoformat()
    }
    emit("new_message", emit_message, room=room_id)

# ======= API ROUTES =======

@mobile_chat_bp.route('/api/mobile/chat/rooms', methods=['GET'])
@jwt_required
@cross_origin()
def mobile_get_rooms():
    try:
        user_oid = ObjectId(g.user_id)
    except Exception as e:
        return jsonify({'success': False, 'error': 'Invalid user ID'}), 400

    # 🧠 Находим только те комнаты, где пользователь — участник
    rooms = list(db.chat_rooms.find({'participants': user_oid}))
    result = []

    for room in rooms:
        room_id = str(room['_id'])
        participants = [str(p) for p in room.get('participants', [])]

        # 🕓 Последнее сообщение
        last_msg = db.chat_messages.find({'room_id': room['_id']}).sort('timestamp', -1).limit(1)
        last_msg = list(last_msg)
        last_message = None
        if last_msg:
            m = last_msg[0]
            last_message = {
                'sender_name': m.get('sender_name'),
                'content': m.get('content', ''),
                'has_files': bool(m.get('files')),
                'timestamp': str(m.get('timestamp'))
            }

        result.append({
            '_id': room_id,
            'name': room.get('name', ''),
            'created_by': str(room.get('created_by', '')),
            'participants': participants,
            'created_at': str(room.get('created_at', '')),
            'last_message': last_message
        })

    return jsonify({'success': True, 'rooms': result})

@mobile_chat_bp.route("/api/mobile/chat/messages/<room_id>", methods=["GET"])
@jwt_required
@cross_origin()
def mobile_get_messages(room_id):
    try:
        room_oid = ObjectId(room_id)
    except Exception:
        return jsonify({'success': False, 'error': 'Invalid room ID'}), 400

    # Проверка: участвует ли пользователь в этой комнате
    room = db.chat_rooms.find_one({'_id': room_oid, 'participants': ObjectId(g.user_id)})
    if not room:
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    messages = db.chat_messages.find({'room_id': room_oid}).sort('timestamp', 1)
    result = []
    for msg in messages:
        result.append({
            '_id': str(msg['_id']),
            'sender_name': msg.get('sender_name'),
            'sender_id': str(msg.get('sender_id')) if msg.get('sender_id') else None,  # 👈 ДОБАВЬ ЭТО
            'content': msg.get('content', ''),
            'timestamp': msg.get('timestamp').isoformat() if isinstance(msg.get('timestamp'), datetime) else str(
                msg.get('timestamp')),
            'has_files': bool(msg.get('files')),
            'files': msg.get('files', []),
            'reply_to': str(msg['reply_to']) if msg.get('reply_to') else None,
        })

    return jsonify({'success': True, 'messages': result})


@mobile_chat_bp.route('/api/mobile/chat/rooms/<room_id>/add_me', methods=['POST'])
@jwt_required
def mobile_add_user_to_room(room_id):
    user_id = str(g.user_id)
    db.chat_rooms.update_one(
        {'_id': ObjectId(room_id)},
        {'$addToSet': {'participants': user_id}}
    )
    return jsonify({'success': True})


@socketio.on("mobile_join")
def mobile_join_handler(data):
    token = data.get("token")
    room_id = data.get("room_id")

    if not token:
        print("❌ SOCKET: Токен не передан")
        return

    user_data = decode_token(token)
    if not user_data:
        print("❌ SOCKET: Неверный токен")
        return

    g.user_id = user_data["user_id"]
    g.role = user_data["role"]

    join_room(room_id)
    print(f"✅ SOCKET: Пользователь {g.user_id} вошёл в комнату {room_id}")