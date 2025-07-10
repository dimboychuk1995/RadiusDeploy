const socket = io("http://127.0.0.1:5001", {
  transports: ["websocket"]
});

socket.on("connect", () => {
  console.log("🟢 Socket.IO подключён:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("❌ Ошибка подключения Socket.IO:", err.message);
});

socket.on("super_dispatch_done", (data) => {
  console.log("📨 Получен супер-диспетчер ответ", data);
  Swal.fire({
    icon: data.success ? "success" : "error",
    title: data.success ? "✅ Импорт завершён" : "❌ Ошибка при импорте",
    text: data.message || "Завершено без деталей"
  });
});