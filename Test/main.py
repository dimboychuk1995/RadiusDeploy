from flask import Flask, render_template, session, redirect, url_for
import logging
from auth import auth_bp, login_manager
from trucks import trucks_bp
from drivers import drivers_bp
from dispatch import dispatch_bp
from flask_login import current_user
from Test.loads import loads_bp  # Импортируем новый Blueprint
import os

app = Flask(__name__)
app.secret_key = 'secret'

if not os.path.exists('uploads'):
    os.makedirs('uploads')

app.register_blueprint(auth_bp)
app.register_blueprint(trucks_bp)
app.register_blueprint(drivers_bp)
app.register_blueprint(dispatch_bp)
app.register_blueprint(loads_bp)  # Регистрируем новый Blueprint
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