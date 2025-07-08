from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from datetime import datetime

from flask_cors import cross_origin

from tools.db import db
from tools.jwt_auth import jwt_required
from flask_socketio import join_room, emit, disconnect
from tools.socketio_instance import socketio

mobile_chat_bp = Blueprint('mobile_chat', __name__)

# ======= SOCKET.IO =======

@socketio.on('mobile_join_room')
def mobile_join_room(data):
    token = data.get('token')
    user = jwt_required(token)
    if not user:
        print("❌ Socket auth failed (join)")
        disconnect()
        return

    room_id = data.get("room_id")
    if not room_id:
        return

    join_room(room_id)
    print(f"📲 MOBILE SOCKET: {user['user_id']} joined room {room_id}")

@socketio.on('mobile_send_message')
def mobile_send_message(data):
    token = data.get('token')
    user = jwt_required(token)
    if not user:
        print("❌ Socket auth failed (send)")
        disconnect()
        return

    room_id = data.get("room_id")
    content = data.get("content", "").strip()
    if not room_id or not content:
        return

    message = {
        'room_id': ObjectId(room_id),
        'sender_id': user['user_id'],
        'sender_name': user['username'],
        'content': content,
        'timestamp': datetime.utcnow().isoformat()
    }

    db.chat_messages.insert_one(message)
    emit("new_message", message, room=room_id)

# ======= API ROUTES =======

@mobile_chat_bp.route('/api/mobile/chat/rooms', methods=['GET'])
@jwt_required
@cross_origin()
def mobile_get_rooms():
    print("✅ mobile_get_rooms вызван")
    print("👤 g.user_id =", g.user_id)

    try:
        user_oid = ObjectId(g.user_id)
        print("🧾 user_oid =", user_oid)
    except Exception as e:
        print("❌ Ошибка преобразования user_id:", e)
        return jsonify({'success': False, 'error': 'Invalid user ID'}), 400

    all_rooms = list(db.chat_rooms.find({}))
    print(f"📦 ВСЕХ комнат в базе: {len(all_rooms)}")

    for r in all_rooms:
        print("➡️ Комната:", r.get('name', 'Без имени'))
        print("   participants:", r.get('participants'))

    rooms = list(db.chat_rooms.find({'participants': user_oid}))
    print(f"🔍 Найдено комнат с участием {user_oid}: {len(rooms)}")

    result = []

    for room in rooms:
        room_id = str(room['_id'])
        participants = [str(p) for p in room.get('participants', [])]

        last_msg = db.chat_messages.find({'room_id': ObjectId(room_id)}).sort('timestamp', -1).limit(1)
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

@mobile_chat_bp.route('/api/mobile/chat/messages/<room_id>', methods=['GET'])
@jwt_required
def mobile_get_messages(room_id):
    try:
        room_oid = ObjectId(room_id)
    except Exception:
        return jsonify({'success': False, 'error': 'Invalid room ID'}), 400

    messages = list(db.chat_messages.find({'room_id': room_oid}).sort('timestamp', 1))
    for msg in messages:
        msg['_id'] = str(msg['_id'])
        msg['room_id'] = str(msg['room_id'])
    return jsonify({'success': True, 'messages': messages})


@mobile_chat_bp.route('/api/mobile/chat/rooms/<room_id>/add_me', methods=['POST'])
@jwt_required
def mobile_add_user_to_room(room_id):
    user_id = str(g.user_id)
    db.chat_rooms.update_one(
        {'_id': ObjectId(room_id)},
        {'$addToSet': {'participants': user_id}}
    )
    return jsonify({'success': True})
