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
    const div = document.createElement("div");
    const time = new Date(msg.timestamp).toLocaleString();
    div.classList.add("mb-2", "p-2", "rounded");

    if (msg.sender_id === CURRENT_USER_ID) {
      div.classList.add("bg-primary", "text-white", "text-end");
    } else {
      div.classList.add("bg-light", "text-start");
    }

    div.innerHTML = `
      <div><strong>${msg.sender_name}</strong> <small>${time}</small></div>
      <div>${msg.content || ''}</div>
    `;

    if (msg.file_url) {
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.file_url);
      const fileBlock = isImage
        ? `<div><img src="${msg.file_url}" style="max-width: 200px; max-height: 200px;" class="mt-1"/></div>`
        : `<div><a href="${msg.file_url}" target="_blank">📎 Скачать файл</a></div>`;
      div.innerHTML += fileBlock;
    }

    return div;
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
          // Подгружаем последние сообщения заново
          fetch('/api/chat/messages')
            .then(res => res.json())
            .then(messages => {
              chatBox.innerHTML = '';
              messages.forEach(addMessage);
            });
        }
      });
  });

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendBtn.click();
    }
  });

  socket.on("connect", () => {
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
