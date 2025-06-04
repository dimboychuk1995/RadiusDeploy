from flask import Flask, render_template, redirect, url_for
import logging
from flask_login import current_user

from samsara import samsara_bp
from auth import auth_bp, login_manager
from trucks import trucks_bp
from drivers import drivers_bp
from dispatch import dispatch_bp
from loads import loads_bp
from accounting import accounting_bp
from statement import statement_bp
from fuel_cards import fuel_cards_bp
from integrations import integrations_bp
from tolls import tolls_bp
from fleet import fleet_bp
from broker_customer import broker_customer_bp
from company_information import company_bp
from load_stats_api import load_stats_api
from dispatchers import dispatchers_bp
from safety import safety_bp

app = Flask(__name__)
app.secret_key = 'secret'  # Лучше заменить на os.getenv('SECRET_KEY')


# Регистрируем все blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(trucks_bp)
app.register_blueprint(drivers_bp)
app.register_blueprint(dispatch_bp)
app.register_blueprint(loads_bp)
app.register_blueprint(accounting_bp)
app.register_blueprint(statement_bp)
app.register_blueprint(fuel_cards_bp)
app.register_blueprint(integrations_bp)
app.register_blueprint(samsara_bp)
app.register_blueprint(tolls_bp)
app.register_blueprint(fleet_bp)
app.register_blueprint(broker_customer_bp)
app.register_blueprint(company_bp)
app.register_blueprint(load_stats_api)
app.register_blueprint(dispatchers_bp)
app.register_blueprint(safety_bp)

# Настройка логина
login_manager.init_app(app)

# Ошибка 500
@app.errorhandler(500)
def internal_server_error(e):
    logging.error(f"Internal Server Error: {e}")
    return render_template('error.html', message="Internal Server Error"), 500

# Главная страница
@app.route('/')
def index():
    if current_user.is_authenticated:
        return render_template('index.html')
    else:
        return redirect(url_for('auth.login'))

# 🔥 Локальный запуск (НЕ используется на Render)
if __name__ == '__main__':
    app.run(debug=True)
