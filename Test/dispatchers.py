from flask import Blueprint, render_template

dispatchers_bp = Blueprint('dispatchers', __name__)

@dispatchers_bp.route('/fragment/dispatchers')
def dispatchers_fragment():
    return render_template('fragments/dispatchers_fragment.html')