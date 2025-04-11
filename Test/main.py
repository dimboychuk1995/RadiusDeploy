from flask import Flask, render_template, redirect, url_for
import logging
from auth import auth_bp, login_manager
from trucks import trucks_bp
from drivers import drivers_bp
from dispatch import dispatch_bp
from loads import loads_bp
from accounting import accounting_bp  # Импортируем новый Blueprint
from statement import statement_bp
from flask_login import current_user
from fuel_cards import fuel_cards_bp
from Test.integrations import integrations_bp
import os

app = Flask(__name__)
app.secret_key = 'secret'

if not os.path.exists('uploads'):
    os.makedirs('uploads')

app.register_blueprint(auth_bp)
app.register_blueprint(trucks_bp)
app.register_blueprint(drivers_bp)
app.register_blueprint(dispatch_bp)
app.register_blueprint(loads_bp)
app.register_blueprint(accounting_bp)  # Регистрируем новый Blueprint
app.register_blueprint(statement_bp)
app.register_blueprint(fuel_cards_bp)

app.register_blueprint(integrations_bp)



login_manager.init_app(app)

@app.errorhandler(500)
def internal_server_error(e):
    logging.error(f"Internal Server Error: {e}")
    return render_template('error.html', message="Internal Server Error"), 500

@app.route('/')
def index():
    if current_user.is_authenticated:
        return render_template('index.html')
    else:
        return redirect(url_for('auth.login'))

if __name__ == '__main__':
    app.run(debug=True)