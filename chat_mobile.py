from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from datetime import datetime
from tools.db import db
from tools.jwt_auth import jwt_required
from flask_socketio import join_room, emit
from tools.socketio_instance import socketio

mobile_chat_bp = Blueprint('mobile_chat', __name__)

# ======= SOCKET.IO =======

@socketio.on('mobile_join_room')
@jwt_required
def mobile_join_room(data):
    room_id = data.get("room_id")
    if not room_id:
        return
    join_room(room_id)
    print(f"📲 MOBILE SOCKET: {g.user_id} joined room {room_id}")

@socketio.on('mobile_send_message')
@jwt_required
def mobile_send_message(data):
    print("📲 MOBILE SOCKET: Message received:", data)
    room_id = data.get("room_id")
    content = data.get("content", "").strip()
    sender_id = g.user_id

    if not room_id or not content:
        return

    message = {
        'room_id': ObjectId(room_id),
        'sender_id': sender_id,
        'sender_name': g.username,
        'content': content,
        'timestamp': datetime.utcnow().isoformat()
    }

    db.chat_messages.insert_one(message)
    emit("new_message", message, room=room_id)

# ======= API ROUTES =======

@mobile_chat_bp.route('/api/mobile/chat/rooms', methods=['GET'])
@jwt_required
def mobile_get_rooms():
    user_id = str(g.user_id)
    rooms = list(db.chat_rooms.find({'participants': user_id}))
    for room in rooms:
        room['_id'] = str(room['_id'])

        last_msg = db.chat_messages.find({'room_id': ObjectId(room['_id'])}).sort('timestamp', -1).limit(1)
        last_msg = list(last_msg)
        if last_msg:
            m = last_msg[0]
            room['last_message'] = {
                'sender_name': m.get('sender_name'),
                'content': m.get('content', ''),
                'has_files': bool(m.get('files')),
                'timestamp': m.get('timestamp')
            }
        else:
            room['last_message'] = None
    return jsonify({'success': True, 'rooms': rooms})


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
