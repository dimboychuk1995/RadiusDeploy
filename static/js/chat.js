function initChat() {
  const socket = io();

  const meta = document.getElementById("chat-meta");
  const CURRENT_USER_ID = meta.dataset.userId;
  const CURRENT_USER_NAME = meta.dataset.userName;

  const chatBox = document.getElementById("chat-box");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const fileInput = document.getElementById("chat-file");

  let replyTo = null;
  let replyIndicator = null;

  function formatMessage(msg) {
    const wrapper = document.createElement("div");
    const time = new Date(msg.timestamp).toLocaleString();

    const header = document.createElement("div");
    header.classList.add("mb-1");
    header.innerHTML = `<strong>${msg.sender_name}</strong> <small class="text-muted ms-1">${time}</small>`;

    const body = document.createElement("div");
    body.classList.add("p-2", "rounded", "d-inline-block", "mt-1");

    if (msg.sender_id === CURRENT_USER_ID) {
      body.style.backgroundColor = "#d1ecf1";
      body.style.color = "#0c5460";
      wrapper.classList.add("text-end");
    } else {
      body.style.backgroundColor = "#e0e0e0";
      body.style.color = "#212529";
    }

    if (msg.reply_to) {
      const reply = document.createElement("div");
      reply.classList.add("border-start", "ps-2", "mb-1", "text-muted", "small");
      const replyText = msg.reply_to.content?.slice(0, 100) || '📎 файл';
      reply.innerHTML = `<strong>${msg.reply_to.sender_name}:</strong> ${replyText}`;
      body.appendChild(reply);
    }

    body.innerHTML += msg.content || '';

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

    wrapper.addEventListener("dblclick", () => {
      replyTo = msg;

      if (replyIndicator) replyIndicator.remove();

      replyIndicator = document.createElement("div");
      replyIndicator.className = "mb-2 p-2 border rounded bg-light";
      replyIndicator.innerHTML = `
        <div class="text-muted small">
          🡒 Ответ на: <strong>${msg.sender_name}</strong>: ${msg.content?.slice(0, 100) || '📎 файл'}
          <button type="button" class="btn-close float-end" style="font-size: 0.8em;" aria-label="Close"></button>
        </div>
      `;

      replyIndicator.querySelector(".btn-close").addEventListener("click", () => {
        replyTo = null;
        replyIndicator.remove();
        replyIndicator = null;
      });

      chatBox.appendChild(replyIndicator);
      chatBox.scrollTop = chatBox.scrollHeight;
    });

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
    if (replyTo) {
      formData.append("reply_to", JSON.stringify({
        sender_name: replyTo.sender_name,
        content: replyTo.content,
        file_url: replyTo.file_url
      }));
    }

    fetch("/api/chat/send", {
      method: "POST",
      body: formData
    }).then(res => res.json())
      .then(resp => {
        if (resp.status === 'ok') {
          input.value = '';
          fileInput.value = '';
          replyTo = null;
          if (replyIndicator) {
            replyIndicator.remove();
            replyIndicator = null;
          }
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
