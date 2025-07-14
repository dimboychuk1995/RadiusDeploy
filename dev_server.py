import subprocess
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import time
import os
import socket
import psutil

PORT = 5000

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def wait_for_port_release(port, timeout=5):
    for _ in range(timeout * 10):
        if not is_port_in_use(port):
            return True
        time.sleep(0.1)
    return False

def kill_process_on_port(port):
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            for conn in proc.connections(kind='inet'):
                if conn.status == psutil.CONN_LISTEN and conn.laddr.port == port:
                    print(f"🛑 Убиваем процесс PID {proc.pid} на порту {port}")
                    proc.kill()
                    return True
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            continue
    return False

class ReloadHandler(FileSystemEventHandler):
    def __init__(self, command):
        self.command = command
        self.process = None
        self.start_process()

    def start_process(self):
        print("🚀 Запуск сервера...")
        self.process = subprocess.Popen(self.command, shell=True)

    def stop_process(self):
        if self.process:
            print("⛔ Остановка сервера...")
            self.process.kill()
            self.process.wait()
            self.process = None

    def on_any_event(self, event):
        if event.src_path.endswith(('.py', '.html', '.css', '.js')):
            print(f"📁 Изменение: {event.src_path}")
            self.stop_process()

            # Убиваем висящие процессы, если остались
            kill_process_on_port(PORT)

            # Ждём, пока порт освободится
            if not wait_for_port_release(PORT, timeout=5):
                print(f"❌ Порт {PORT} не освободился")
                return

            self.start_process()

if __name__ == "__main__":
    path = "."
    command = "python main.py"
    event_handler = ReloadHandler(command)
    observer = Observer()
    observer.schedule(event_handler, path=path, recursive=True)
    observer.start()

    print(f"👀 Следим за изменениями... (порт {PORT})")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        event_handler.stop_process()
    observer.join()