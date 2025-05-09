from flask import Blueprint, render_template
from flask_login import login_required, current_user

from Test.tools.db import db

fleet_bp = Blueprint('fleet', __name__)

@fleet_bp.route('/fragment/fleet_fragment', methods=['GET'])
@login_required
def fleet_fragment():
    return render_template('fragments/fleet_fragment.html')
