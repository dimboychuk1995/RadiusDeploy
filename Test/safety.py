from flask import Blueprint, render_template

safety_bp = Blueprint('safety', __name__)

@safety_bp.route('/fragment/safety')
def safety_fragment():
    return render_template('fragments/safety_fragment.html')