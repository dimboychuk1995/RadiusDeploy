function initChat() {
  const socket = io();

  const meta = document.getElementById("chat-meta");
  const CURRENT_USER_ID = meta.dataset.userId;

  const chatBox = document.getElementById("chat-box");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const fileInput = document.getElementById("chat-file");
  const attachBtn = document.getElementById("chat-attach-btn");

  attachBtn.addEventListener("click", () => fileInput.click());

  let replyTo = null;
  let replyIndicator = null;

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  function formatMessage(msg) {
    const wrapper = document.createElement("div");
    const time = formatTime(msg.timestamp);
    wrapper.classList.add("mb-3");
    if (msg._id) wrapper.id = `msg-${msg._id}`;

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

    const header = document.createElement("div");
    header.classList.add("mb-1");
    header.innerHTML = `<strong>${msg.sender_name}</strong> <small class="text-muted ms-2">${time}</small>`;
    bubble.appendChild(header);

    if (msg.reply_to) {
      const reply = msg.reply_to;
      const replyBubble = document.createElement("div");
      replyBubble.classList.add("p-2", "rounded", "mb-2");
      replyBubble.style.backgroundColor = "#f8f9fa";
      replyBubble.style.borderLeft = "4px solid #adb5bd";
      replyBubble.style.fontSize = "0.875em";
      replyBubble.style.wordBreak = "break-word";
      replyBubble.style.cursor = "pointer";

      const replyHeader = document.createElement("div");
      replyHeader.innerHTML = `<strong>${reply.sender_name}</strong> <small class="text-muted ms-2">${reply.timestamp ? formatTime(reply.timestamp) : ''}</small>`;

      const replyText = document.createElement("div");
      replyText.classList.add("mt-1");

      if (reply.content) {
        replyText.innerText = reply.content.slice(0, 300);
      }
      if (reply.file_url) {
        const fileName = reply.file_name || "Файл";
        const fileSize = reply.file_size
          ? (reply.file_size >= 1024 * 1024
              ? (reply.file_size / (1024 * 1024)).toFixed(1) + " MB"
              : (reply.file_size / 1024).toFixed(1) + " KB")
          : "";
        const fileLink = document.createElement("a");
        fileLink.href = reply.file_url;
        fileLink.target = "_blank";
        fileLink.classList.add("text-decoration-underline");
        fileLink.innerHTML = `📎 ${fileName} <span class="text-muted small">(${fileSize})</span>`;
        replyText.appendChild(fileLink);
      }

      replyBubble.appendChild(replyHeader);
      replyBubble.appendChild(replyText);
      bubble.appendChild(replyBubble);

      replyBubble.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetId = reply.message_id;
        if (targetId) {
          const targetEl = document.getElementById(`msg-${targetId}`);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            targetEl.classList.add("bg-warning-subtle");
            setTimeout(() => targetEl.classList.remove("bg-warning-subtle"), 1500);
          }
        }
      });
    }

    if (msg.content) {
      const textDiv = document.createElement("div");
      textDiv.innerText = msg.content;
      bubble.appendChild(textDiv);
    }

    if (msg.file_url) {
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.file_url);
      const fileBlock = document.createElement("div");
      fileBlock.classList.add("mt-2");

      if (isImage) {
        fileBlock.innerHTML = `<img src="${msg.file_url}" style="max-width: 200px; max-height: 200px;" />`;
      } else {
        const fileName = msg.file_name || "Файл";
        const fileSize = msg.file_size
          ? (msg.file_size >= 1024 * 1024
              ? (msg.file_size / (1024 * 1024)).toFixed(1) + " MB"
              : (msg.file_size / 1024).toFixed(1) + " KB")
          : "";

        fileBlock.innerHTML = `
          <a href="${msg.file_url}" target="_blank" class="text-decoration-underline">
            📎 ${fileName} <span class="text-muted small">(${fileSize})</span>
          </a>
        `;
      }
      bubble.appendChild(fileBlock);
    }

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
        file_name: replyTo.file_name,
        file_size: replyTo.file_size,
        timestamp: replyTo.timestamp,
        message_id: replyTo._id
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
      input.value = input.value.slice(0, pos) + "\n" + input.value.slice(pos);
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
