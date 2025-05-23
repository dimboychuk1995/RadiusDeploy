from flask import Blueprint, render_template, jsonify
from flask_login import login_required, current_user

from Test.tools.db import db

load_stats_api = Blueprint('load_stats_api', __name__)
loads_collection = db['loads']

# HTML-фрагмент
@load_stats_api.route('/fragment/load_stats_fragment')
@login_required
def load_stats_fragment():
    return render_template('fragments/load_stats_fragment.html')

@load_stats_api.route('/api/load_stats/general')
@login_required
def load_stats_general():
    loads = list(db['loads'].find({'company': current_user.company}))

    total_loads = len(loads)

    total_amount = 0.0
    total_rpm = 0.0

    for load in loads:
        try:
            total_amount += float(load.get('price') or 0)
        except:
            continue

        try:
            total_rpm += float(load.get('RPM') or 0)
        except:
            continue

    avg_rpm = total_rpm / total_loads if total_loads else 0

    return jsonify({
        'total_loads': total_loads,
        'total_amount': total_amount,
        'avg_rpm': avg_rpm
    })