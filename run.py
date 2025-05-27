from Test.main import app  # если в Test/main.py есть app = Flask(...)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)