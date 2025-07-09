from flask import Blueprint, request, jsonify, g, send_file
from bson import ObjectId
from datetime import datetime
from flask_cors import cross_origin
from werkzeug.utils import secure_filename
from flask_socketio import join_room, emit, disconnect
from tools.db import db
from tools.jwt_auth import jwt_required, decode_token
from tools.socketio_instance import socketio
import os
import json
from uuid import uuid4

mobile_chat_bp = Blueprint('mobile_chat', __name__)

UPLOAD_FOLDER = 'static/CHAT_FILES'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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

@socketio.on("mobile_send_message")
def mobile_send_message(data):
    print("📥 SOCKET: mobile_send_message вызван", data)

    token = data.get("token")
    room_id = data.get("room_id")
    content = data.get("content", "")
    reply_to_id = data.get("reply_to")

    if not token:
        print("❌ SOCKET: Токен не передан")
        return

    user = decode_token(token)
    if not user:
        print("❌ SOCKET: Неверный токен")
        return

    try:
        room_oid = ObjectId(room_id)
    except:
        print("❌ SOCKET: Неверный room_id")
        return

    room = db.chat_rooms.find_one({"_id": room_oid, "participants": ObjectId(user["user_id"])})
    if not room:
        print("❌ SOCKET: Нет доступа к комнате")
        return

    message = {
        "room_id": room_oid,
        "sender_id": ObjectId(user["user_id"]),
        "sender_name": user.get("username", "Unknown"),
        "content": content,
        "files": [],
        "timestamp": datetime.utcnow(),
    }

    if reply_to_id:
        try:
            original = db.chat_messages.find_one({"_id": ObjectId(reply_to_id)})
            if original:
                ts = original.get("timestamp")
                reply_data = {
                    "sender_name": original.get("sender_name"),
                    "content": original.get("content", ""),
                    "files": original.get("files", []),
                    "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                    "message_id": str(original["_id"]),
                }
                message["reply_to"] = reply_data
        except Exception as e:
            print(f"⚠️ Ошибка reply_to: {e}")

    inserted = db.chat_messages.insert_one(message)
    message["_id"] = str(inserted.inserted_id)
    message["room_id"] = str(room_oid)
    message["sender_id"] = str(message["sender_id"])
    message["timestamp"] = message["timestamp"].isoformat()

    emit("new_message", message, room=room_id)

# ======= API ROUTES =======

@mobile_chat_bp.route('/api/mobile/chat/send/<room_id>', methods=['POST'])
@jwt_required
@cross_origin()
def mobile_send_message_with_files(room_id):
    try:
        room_oid = ObjectId(room_id)
    except Exception:
        return jsonify({'status': 'error', 'error': 'Invalid room ID'}), 400

    room = db.chat_rooms.find_one({'_id': room_oid, 'participants': ObjectId(g.user_id)})
    if not room:
        return jsonify({'status': 'error', 'error': 'Access denied'}), 403

    content = request.form.get('content', '').strip()
    files = request.files.getlist('files')

    if not content and not files:
        return jsonify({'status': 'error', 'error': 'Empty message'}), 400

    file_infos = []
    for file in files:
        if file.filename:
            original_filename = secure_filename(file.filename)
            unique_prefix = uuid4().hex
            unique_filename = f"{unique_prefix}_{original_filename}"
            filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
            file.save(filepath)

            file_infos.append({
                'file_url': f'/static/CHAT_FILES/{unique_filename}',
                'file_name': original_filename,
                'file_size': os.path.getsize(filepath)
            })

    reply_to_raw = request.form.get('reply_to')
    reply_to = None
    if reply_to_raw:
        try:
            reply_to = json.loads(reply_to_raw)
        except Exception:
            reply_to = None

    message = {
        'room_id': room_oid,
        'sender_id': ObjectId(g.user_id),
        'sender_name': g.get('username', 'Unknown'),
        'content': content,
        'files': file_infos,
        'reply_to': reply_to,
        'timestamp': datetime.utcnow()
    }

    inserted = db.chat_messages.insert_one(message)
    message['_id'] = str(inserted.inserted_id)

    safe_message = {
        '_id': message['_id'],
        'room_id': str(room_oid),
        'sender_id': str(message['sender_id']),
        'sender_name': message['sender_name'],
        'content': message['content'],
        'files': message['files'],
        'reply_to': message['reply_to'],
        'timestamp': message['timestamp'].isoformat()
    }

    emit('new_message', safe_message, room=str(room_oid))

    return jsonify({'status': 'ok', 'message': safe_message})

@mobile_chat_bp.route('/api/mobile/chat/messages/<room_id>', methods=['GET'])
@jwt_required
@cross_origin()
def mobile_get_messages(room_id):
    try:
        room_oid = ObjectId(room_id)
    except Exception:
        return jsonify({'success': False, 'error': 'Invalid room ID'}), 400

    room = db.chat_rooms.find_one({'_id': room_oid, 'participants': ObjectId(g.user_id)})
    if not room:
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    messages = db.chat_messages.find({'room_id': room_oid}).sort('timestamp', 1)
    result = []
    for msg in messages:
        result.append({
            '_id': str(msg['_id']),
            'sender_name': msg.get('sender_name'),
            'sender_id': str(msg.get('sender_id')) if msg.get('sender_id') else None,
            'content': msg.get('content', ''),
            'timestamp': msg.get('timestamp').isoformat() if isinstance(msg.get('timestamp'), datetime) else str(msg.get('timestamp')),
            'has_files': bool(msg.get('files')),
            'files': msg.get('files', []),
            'reply_to': {
                'sender_name': msg['reply_to'].get('sender_name'),
                'content': msg['reply_to'].get('content', ''),
                'files': msg['reply_to'].get('files', []),
                'timestamp': msg['reply_to'].get('timestamp'),
                'message_id': msg['reply_to'].get('message_id'),
            } if msg.get('reply_to') else None,
        })

    return jsonify({'success': True, 'messages': result})

@mobile_chat_bp.route('/api/mobile/chat/file/<filename>', methods=['GET'])
def mobile_chat_get_file(filename):
    try:
        filepath = os.path.join(UPLOAD_FOLDER, secure_filename(filename))
        return send_file(filepath, as_attachment=False)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 404

@mobile_chat_bp.route('/api/mobile/chat/rooms', methods=['GET'])
@jwt_required
@cross_origin()
def mobile_get_rooms():
    try:
        user_oid = ObjectId(g.user_id)
    except Exception:
        return jsonify({'success': False, 'error': 'Invalid user ID'}), 400

    rooms = list(db.chat_rooms.find({'participants': user_oid}))
    result = []

    for room in rooms:
        room_id = str(room['_id'])
        participants = [str(p) for p in room.get('participants', [])]

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