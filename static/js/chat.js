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

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  function formatMessage(msg) {
    const wrapper = document.createElement("div");
    const time = formatTime(msg.timestamp);

    wrapper.classList.add("mb-3");

    const bubble = document.createElement("div");
    bubble.classList.add("p-2", "rounded", "d-inline-block", "mt-1");
    bubble.style.maxWidth = "80%";
    bubble.style.wordBreak = "break-word";

    const isCurrentUser = msg.sender_id === CURRENT_USER_ID;
    if (isCurrentUser) {
      bubble.style.backgroundColor = "#d1ecf1";
      bubble.style.color = "#0c5460";
      wrapper.classList.add("text-end");
    } else {
      bubble.style.backgroundColor = "#e0e0e0";
      bubble.style.color = "#212529";
    }

    // Заголовок: имя + дата
    const header = document.createElement("div");
    header.classList.add("mb-1");
    header.innerHTML = `
      <strong>${msg.sender_name}</strong>
      <small class="text-muted ms-2">${time}</small>
    `;
    bubble.appendChild(header);

    // Вложенный ответ (если есть)
    if (msg.reply_to) {
      const replyBubble = document.createElement("div");
      replyBubble.classList.add("p-2", "rounded", "mb-2");
      replyBubble.style.backgroundColor = "#f8f9fa";
      replyBubble.style.borderLeft = "4px solid #adb5bd";
      replyBubble.style.fontSize = "0.875em";
      replyBubble.style.wordBreak = "break-word";

      const replyHeader = document.createElement("div");
      replyHeader.innerHTML = `
        <strong>${msg.reply_to.sender_name}</strong>
        <small class="text-muted ms-2">
          ${msg.reply_to.timestamp ? formatTime(msg.reply_to.timestamp) : ''}
        </small>
      `;

      const replyText = document.createElement("div");
      replyText.classList.add("mt-1");
      replyText.innerText = msg.reply_to.content?.slice(0, 300) || '📎 файл';

      replyBubble.appendChild(replyHeader);
      replyBubble.appendChild(replyText);
      bubble.appendChild(replyBubble);
    }

    // Текст сообщения
    if (msg.content) {
      const textDiv = document.createElement("div");
      textDiv.innerText = msg.content;
      bubble.appendChild(textDiv);
    }

    // Вложение (если есть)
    if (msg.file_url) {
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.file_url);
      const fileBlock = document.createElement("div");
      fileBlock.classList.add("mt-2");
      fileBlock.innerHTML = isImage
        ? `<img src="${msg.file_url}" style="max-width: 200px; max-height: 200px;" />`
        : `<a href="${msg.file_url}" target="_blank" class="text-decoration-underline">📎 Скачать файл</a>`;
      bubble.appendChild(fileBlock);
    }

    // Слушатель для ответа
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

    wrapper.appendChild(bubble);
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
        file_url: replyTo.file_url,
        timestamp: replyTo.timestamp
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
          input.style.height = "38px";
          replyTo = null;
          if (replyIndicator) {
            replyIndicator.remove();
            replyIndicator = null;
          }
        }
      });
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    } else if (e.key === "Enter" && (e.ctrlKey || e.shiftKey)) {
      const pos = input.selectionStart;
      const val = input.value;
      input.value = val.slice(0, pos) + "\n" + val.slice(pos);
      input.selectionStart = input.selectionEnd = pos + 1;
      e.preventDefault();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
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
