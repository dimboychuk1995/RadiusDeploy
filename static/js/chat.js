function initChat() {
  const socket = io();

  const meta = document.getElementById("chat-meta");
  const CURRENT_USER_ID = meta.dataset.userId;
  const CURRENT_USER_NAME = meta.dataset.userName;

  const chatBox = document.getElementById("chat-box");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const fileInput = document.getElementById("chat-file");

  function formatMessage(msg) {
    const wrapper = document.createElement("div");
    const time = new Date(msg.timestamp).toLocaleString();

    // Заголовок: имя + время
    const header = document.createElement("div");
    header.classList.add("mb-1");
    header.innerHTML = `<strong>${msg.sender_name}</strong> <small class="text-muted ms-1">${time}</small>`;

    // Тело сообщения
    const body = document.createElement("div");
    body.classList.add("p-2", "rounded", "d-inline-block", "mt-1");

    if (msg.sender_id === CURRENT_USER_ID) {
      body.style.backgroundColor = "#d1ecf1"; // светло-голубой
      body.style.color = "#0c5460";
      wrapper.classList.add("text-end");
    } else {
      body.style.backgroundColor = "#e0e0e0"; // грязно-серый
      body.style.color = "#212529";
    }

    body.innerHTML = msg.content || '';

    if (msg.file_url) {
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.file_url);
      const fileBlock = isImage
        ? `<div class="mt-2"><img src="${msg.file_url}" style="max-width: 200px; max-height: 200px;" /></div>`
        : `<div class="mt-2"><a href="${msg.file_url}" target="_blank" class="text-decoration-underline">📎 Скачать файл</a></div>`;
      body.innerHTML += fileBlock;
    }

    wrapper.classList.add("mb-3");
    wrapper.appendChild(header);
    wrapper.appendChild(body);

    return wrapper;
  }

  function addMessage(msg) {
    chatBox.appendChild(formatMessage(msg));
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  sendBtn.addEventListener("click", () => {
    const content = input.value.trim();
    const file = fileInput.files[0];

    if (!content && !file) return;

    const formData = new FormData();
    formData.append("content", content);
    if (file) formData.append("file", file);

    fetch("/api/chat/send", {
      method: "POST",
      body: formData
    }).then(res => res.json())
      .then(resp => {
        if (resp.status === 'ok') {
          input.value = '';
          fileInput.value = '';
          // ❌ Убрали лишний fetch — теперь только через сокет
        }
      });
  });

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendBtn.click();
    }
  });

  socket.on("connect", () => {
    // Загрузим историю при подключении
    fetch('/api/chat/messages')
      .then(res => res.json())
      .then(messages => {
        chatBox.innerHTML = '';
        messages.forEach(addMessage);
      });
  });

  socket.on("new_message", (msg) => {
    addMessage(msg);
  });
}
