from flask import Flask, render_template, session, redirect, url_for
import logging
from auth import auth_bp, login_manager
from trucks import trucks_bp, trucks_list
from drivers import drivers_bp
from dispatch import dispatch_bp
from Test.loads import loads_bp  # Импортируем Blueprint грузов
from flask_login import current_user, login_required
from pymongo import MongoClient
from bson.objectid import ObjectId
import os

app = Flask(__name__)
app.secret_key = 'secret'

# Создаём папку для загрузок, если не существует
if not os.path.exists('uploads'):
    os.makedirs('uploads')

# Подключение к базе MongoDB
client = MongoClient('mongodb://localhost:27017/')
db = client['trucks_db']
drivers_collection = db['drivers']
trucks_collection = db['trucks']
users_collection = db['users']
loads_collection = db['loads']

# Регистрируем Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(trucks_bp)
app.register_blueprint(drivers_bp)
app.register_blueprint(dispatch_bp)
app.register_blueprint(loads_bp)

# Инициализируем Flask-Login
login_manager.init_app(app)

# Обработчик ошибок
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

# Старый маршрут для траков
@app.route('/trucks')
def trucks():
    return trucks_list()

# 🔥 НОВОЕ: ФРАГМЕНТЫ для подгрузки во вкладки
@app.route('/fragment/drivers')
@login_required
def fragment_drivers():
    drivers = list(drivers_collection.find({'company': current_user.company}))
    trucks = list(trucks_collection.find({'company': current_user.company}))

    truck_units = {str(truck['_id']): truck['unit_number'] for truck in trucks}

    for driver in drivers:
        driver['_id'] = str(driver['_id'])
        driver['truck_unit'] = truck_units.get(driver.get('truck'), 'Нет трака')

    return render_template('fragments/drivers_fragment.html', drivers=drivers)

@app.route('/fragment/trucks')
@login_required
def fragment_trucks():
    return render_template('fragments/trucks_fragment.html')

@app.route('/fragment/dispatch')
@login_required
def fragment_dispatch():
    return render_template('fragments/dispatch_fragment.html')

@app.route('/fragment/loads')
@login_required
def fragment_loads():
    return render_template('fragments/loads_fragment.html')

# Запуск приложения
if __name__ == '__main__':
    app.run(debug=True)
