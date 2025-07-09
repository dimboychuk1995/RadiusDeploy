import logging
from gevent import monkey
monkey.patch_all()

from flask_cors import CORS
from flask import Flask, render_template, redirect, url_for, request, jsonify
from flask_login import current_user
from tools.socketio_instance import socketio  # <-- здесь уже готовый экземпляр
from apscheduler.schedulers.background import BackgroundScheduler
from super_dispatch import import_super_dispatch_orders

# Импорт блюпринтов
from chat import chat_bp
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
from logbook import logbook
from ifta import ifta_bp
from super_dispatch import super_dispatch_bp
from documents import document_bp
from equipment import equipment_bp
from dispatch_schedule import dispatch_schedule_bp
from settings import settings_bp
from dispatch_statements import dispatch_statements_bp
from chat_mobile import mobile_chat_bp


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        func=import_super_dispatch_orders,
        trigger="interval",
        minutes=60,
        id="super_dispatch_import",
        replace_existing=True
    )
    scheduler.start()
    logging.info("🔁 Планировщик Super Dispatch запущен")

app = Flask(__name__)
app.secret_key = 'secret'
app.config["JWT_SECRET"] = "super_secret_123"
logging.basicConfig(level=logging.INFO)

# Куки для кросс-доменных запросов
app.config.update(
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=False  # true, если HTTPS
)

# Инициализация Flask-Login
login_manager.init_app(app)

@login_manager.unauthorized_handler
def unauthorized_callback():
    if request.path.startswith("/api/"):
        return jsonify({"success": False, "message": "Unauthorized"}), 401
    return redirect(url_for("auth.login"))

# ✅ CORS настроен глобально
CORS(app,
     supports_credentials=True,
     origins=[
         "http://localhost:8081",
         "http://192.168.0.229:8081",
         "https://3b95522a1c03.ngrok-free.app"
     ],
     expose_headers=["Authorization"])

# ✅ SocketIO инициализируем без CORS тут (он уже есть выше)
socketio.init_app(
    app,
    async_mode='gevent',
    cors_allowed_origins=[
        "http://localhost:8081",
        "http://192.168.0.229:8081",
        "https://3b95522a1c03.ngrok-free.app",
        "http://127.0.0.1:5000"
    ]
)

# Регистрация всех блюпринтов
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
app.register_blueprint(chat_bp)
app.register_blueprint(logbook)
app.register_blueprint(ifta_bp)
app.register_blueprint(super_dispatch_bp)
app.register_blueprint(document_bp)
app.register_blueprint(equipment_bp)
app.register_blueprint(dispatch_schedule_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(dispatch_statements_bp)
app.register_blueprint(mobile_chat_bp)

# Главная страница
@app.route('/')
def index():
    if current_user.is_authenticated:
        return render_template('index.html')
    else:
        return redirect(url_for('auth.login'))

# Обработка 500 ошибки
@app.errorhandler(500)
def internal_server_error(e):
    logging.error(f"Internal Server Error: {e}")
    return render_template('error.html', message="Internal Server Error"), 500

# Запуск
if __name__ == '__main__':
    start_scheduler()
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)