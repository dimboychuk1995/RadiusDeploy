from flask import Blueprint, render_template, request
from flask_login import login_required, current_user
import logging

from Test.tools.db import db  # централизованное подключение

broker_customer_bp = Blueprint('broker_customer', __name__)
brokers_collection = db['brokers']
customers_collection = db['customers']


@broker_customer_bp.route('/fragment/dispatch_brokers', methods=['GET'])
@login_required
def dispatch_brokers_fragment():
    try:
        brokers = list(brokers_collection.find({'company': current_user.company}))
        customers = list(customers_collection.find({'company': current_user.company}))

        return render_template('fragments/dispatch_brokers_fragment.html',
                               brokers=brokers,
                               customers=customers)
    except Exception as e:
        logging.error(f"Ошибка при загрузке брокеров/кастомеров: {e}")
        return "Ошибка загрузки данных", 500
