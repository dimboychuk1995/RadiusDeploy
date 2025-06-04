from flask import Blueprint, render_template
from tools.db import db  # централизованное подключение

dispatchers_bp = Blueprint('dispatchers', __name__)
users_collection = db['users']

@dispatchers_bp.route('/fragment/dispatchers')
def dispatchers_fragment():
    dispatchers = list(users_collection.find({"role": "dispatch"}))
    return render_template('fragments/dispatchers_fragment.html', dispatchers=dispatchers)