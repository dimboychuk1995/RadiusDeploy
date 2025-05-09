from flask import Blueprint, render_template
from flask_login import login_required

tolls_bp = Blueprint('tolls', __name__)

@tolls_bp.route('/fragment/tolls_fragment', methods=['GET'])
@login_required
def tolls_fragment():
    return render_template('fragments/tolls_fragment.html')  # 👈 добавлен путь