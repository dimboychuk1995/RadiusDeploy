from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime
from tools.db import db
from tools.socketio_instance import socketio
from werkzeug.utils import secure_filename
from bson import ObjectId
import os
import json
from uuid import uuid4
import sys

chat_bp = Blueprint('chat_bp', __name__)

UPLOAD_FOLDER = 'static/CHAT_FILES'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ====== SOCKET ======
@socketio.on('send_message')
def handle_send_message(data):
    from flask_login import current_user
    if not current_user.is_authenticated:
        print("❌ SOCKET: User not authenticated")
        return

    print("🔵 SOCKET: send_message received:", data)
    room_id = data.get('room_id')
    if not room_id:
        return

    message = {
        'room_id': ObjectId(room_id),
        'sender_id': str(current_user.id),
        'sender_name': current_user.username,
        'content': data.get('content', '').strip(),
        'timestamp': datetime.utcnow().isoformat()
    }

    db.chat_messages.insert_one(message)
    socketio.emit('new_message', message, room=room_id)


@socketio.on('join')
def handle_join(data):
    from flask_login import current_user
    if not current_user.is_authenticated:
        print("❌ SOCKET: User not authenticated (join)")
        return

    room_id = data.get('room_id')
    if room_id:
        from flask_socketio import join_room
        join_room(room_id)
        print(f"🟢 SOCKET: User {current_user.username} joined room {room_id}")

# ====== CHAT UI ======
@chat_bp.route('/fragment/chat')
@login_required
def chat_fragment():
    return render_template(
        'fragments/chat_fragment.html',
        current_user_id=str(current_user.id),
        current_user_name=current_user.username
    )

# ====== ROOMS ======
@chat_bp.route('/api/chat/rooms', methods=['GET'])
@login_required
def get_rooms():
    rooms = list(db.chat_rooms.find({'participants': str(current_user.id)}))
    for room in rooms:
        room['_id'] = str(room['_id'])
    return jsonify(rooms)


@chat_bp.route('/api/chat/rooms', methods=['POST'])
@login_required
def create_room():
    name = request.json.get('name', '').strip()
    if not name:
        return jsonify({'status': 'error', 'error': 'Missing name'}), 400

    room = {
        'name': name,
        'created_by': str(current_user.id),
        'participants': [str(current_user.id)],  # 👈 вот тут
        'created_at': datetime.utcnow()
    }

    inserted = db.chat_rooms.insert_one(room)
    room['_id'] = str(inserted.inserted_id)

    return jsonify({'status': 'ok', 'room': room})

# ====== MESSAGES ======
@chat_bp.route('/api/chat/messages/<room_id>', methods=['GET'])
@login_required
def get_messages(room_id):
    try:
        room_oid = ObjectId(room_id)
    except Exception:
        return jsonify({'status': 'error', 'error': 'Invalid room ID'}), 400

    messages = list(db.chat_messages.find({'room_id': room_oid}).sort('timestamp', 1))

    for msg in messages:
        msg['_id'] = str(msg['_id'])
        msg['room_id'] = str(msg['room_id'])  # ⬅️ ЭТО НУЖНО!
        if msg.get('reply_to') and msg['reply_to'].get('message_id'):
            msg['reply_to']['message_id'] = str(msg['reply_to']['message_id'])

    return jsonify(messages)


@chat_bp.route('/api/chat/send/<room_id>', methods=['POST'])
@login_required
def send_message(room_id):
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
        'room_id': ObjectId(room_id),
        'sender_id': str(current_user.id),
        'sender_name': current_user.username,
        'content': content,
        'files': file_infos,
        'reply_to': reply_to,
        'timestamp': datetime.utcnow()
    }

    inserted = db.chat_messages.insert_one(message)
    message['_id'] = inserted.inserted_id

    safe_message = {
        '_id': str(message['_id']),
        'room_id': room_id,
        'sender_id': message['sender_id'],
        'sender_name': message['sender_name'],
        'content': message['content'],
        'files': message['files'],
        'reply_to': message['reply_to'],
        'timestamp': message['timestamp'].isoformat()
    }

    socketio.emit('new_message', safe_message, room=room_id)

    return jsonify({'status': 'ok'})

@chat_bp.route('/api/chat/rooms/<room_id>', methods=['PUT'])
@login_required
def rename_room(room_id):
    data = request.json
    new_name = data.get('name', '').strip()

    if not new_name:
        return jsonify({'status': 'error', 'error': 'Missing new name'}), 400

    room = db.chat_rooms.find_one({'_id': ObjectId(room_id)})
    if not room:
        return jsonify({'status': 'error', 'error': 'Room not found'}), 404

    if room.get('created_by') != str(current_user.id):
        return jsonify({'status': 'error', 'error': 'Not authorized'}), 403

    db.chat_rooms.update_one({'_id': ObjectId(room_id)}, {'$set': {'name': new_name}})
    return jsonify({'status': 'ok'})

@chat_bp.route('/api/chat/rooms/<room_id>', methods=['DELETE'])
@login_required
def delete_room(room_id):
    room = db.chat_rooms.find_one({'_id': ObjectId(room_id)})
    if not room:
        return jsonify({'status': 'error', 'error': 'Room not found'}), 404

    if room.get('created_by') != str(current_user.id):
        return jsonify({'status': 'error', 'error': 'Not authorized'}), 403

    # 🧹 Удаление всех файлов
    messages = db.chat_messages.find({'room_id': ObjectId(room_id)})
    for msg in messages:
        files = msg.get('files', [])
        for f in files:
            file_path = f.get('file_url', '').lstrip('/')
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception as e:
                    print(f"⚠️ Не удалось удалить файл {file_path}: {e}", file=sys.stderr)

    # 🗑 Удаление сообщений и комнаты
    db.chat_messages.delete_many({'room_id': ObjectId(room_id)})
    db.chat_rooms.delete_one({'_id': ObjectId(room_id)})

    return jsonify({'status': 'ok'})

@chat_bp.route('/api/chat/rooms/<room_id>/add_user', methods=['POST'])
@login_required
def add_user_to_room(room_id):
    data = request.json
    user_id_to_add = data.get('user_id')

    if not user_id_to_add:
        return jsonify({'status': 'error', 'error': 'Missing user_id'}), 400

    room = db.chat_rooms.find_one({'_id': ObjectId(room_id)})
    if not room:
        return jsonify({'status': 'error', 'error': 'Room not found'}), 404

    if room['created_by'] != str(current_user.id):
        return jsonify({'status': 'error', 'error': 'Not authorized'}), 403

    db.chat_rooms.update_one(
        {'_id': ObjectId(room_id)},
        {'$addToSet': {'participants': user_id_to_add}}
    )

    return jsonify({'status': 'ok'})

@chat_bp.route('/api/users')
@login_required
def list_users():
    users = list(db.users.find({}, {'_id': 1, 'username': 1}))  # или адаптируй под ORM
    for u in users:
        u['_id'] = str(u['_id'])
    return jsonify(users)
