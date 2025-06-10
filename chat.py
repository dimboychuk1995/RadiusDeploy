from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime
from tools.db import db
from tools.socketio_instance import socketio
from werkzeug.utils import secure_filename
import os
import json
from uuid import uuid4

chat_bp = Blueprint('chat_bp', __name__)

UPLOAD_FOLDER = 'static/CHAT_FILES'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@socketio.on('send_message')
@login_required
def handle_send_message(data):
    message = {
        'sender_id': str(current_user.id),
        'sender_name': current_user.username,
        'content': data.get('content', '').strip(),
        'timestamp': datetime.utcnow().isoformat()
    }

    if message['content']:
        db.chat_messages.insert_one(message)
        socketio.emit('new_message', message, broadcast=True, namespace='/')


@chat_bp.route('/fragment/chat')
@login_required
def chat_fragment():
    return render_template(
        'fragments/chat_fragment.html',
        current_user_id=str(current_user.id),
        current_user_name=current_user.username
    )


@chat_bp.route('/api/chat/messages', methods=['GET'])
@login_required
def get_messages():
    messages = list(db.chat_messages.find().sort('timestamp', 1))
    for msg in messages:
        msg['_id'] = str(msg['_id'])
    return jsonify(messages)


@chat_bp.route('/api/chat/send', methods=['POST'])
@login_required
def send_message():
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
        'sender_id': message['sender_id'],
        'sender_name': message['sender_name'],
        'content': message['content'],
        'files': message['files'],
        'reply_to': message['reply_to'],
        'timestamp': message['timestamp'].isoformat()
    }

    socketio.emit('new_message', safe_message, namespace='/')

    return jsonify({'status': 'ok'})
