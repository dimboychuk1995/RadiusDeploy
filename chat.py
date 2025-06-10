from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from datetime import datetime
from tools.db import db
from flask_socketio import emit
from tools.socketio_instance import socketio  # ✅ вместо from main

chat_bp = Blueprint('chat_bp', __name__)

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
        # Создаём JSON-safe копию:
        safe_message = {
            'sender_id': message['sender_id'],
            'sender_name': message['sender_name'],
            'content': message['content'],
            'timestamp': message['timestamp']
        }
        emit('new_message', safe_message, broadcast=True)


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
    data = request.json
    message = {
        'sender_id': str(current_user.id),
        'sender_name': current_user.username,
        'content': data.get('content', '').strip(),
        'timestamp': datetime.utcnow()
    }
    if not message['content']:
        return jsonify({'status': 'error', 'error': 'Empty message'}), 400

    db.chat_messages.insert_one(message)
    return jsonify({'status': 'ok'})
