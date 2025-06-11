function initChat() {
  const socket = io();
  console.log("⏳ Connecting to Socket.IO...");

  socket.on("connect", () => {
    console.log("✅ Socket connected!", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Socket.IO connection error:", err);
  });

  const meta = document.getElementById("chat-meta");
  const CURRENT_USER_ID = meta.dataset.userId;

  const roomList = document.getElementById("room-list");
  const createRoomBtn = document.getElementById("create-room-btn");
  const chatBox = document.getElementById("chat-box");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const fileInput = document.getElementById("chat-file");
  const attachBtn = document.getElementById("chat-attach-btn");
  const selectedFiles = document.getElementById("selected-files");

  chatBox.style.display = "flex";
  chatBox.style.flexDirection = "column-reverse";

  let currentRoomId = null;
  let replyTo = null;
  let replyIndicator = null;

  attachBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files);
    selectedFiles.innerHTML = files.length === 0 ? "" : files.map(file =>
      `<div>📎 ${file.name} <span class="text-muted small">(${(file.size / 1024).toFixed(1)} KB)</span></div>`
    ).join("");
  });

  createRoomBtn.addEventListener("click", () => {
    const name = prompt("Введите имя чата:");
    if (name) {
      fetch('/api/chat/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      }).then(res => res.json()).then(loadRooms);
    }
  });

  function loadRooms() {
    fetch('/api/chat/rooms')
      .then(res => res.json())
      .then(rooms => {
        roomList.innerHTML = '';
        rooms.forEach(room => {
          const item = document.createElement("li");
          item.className = "list-group-item list-group-item-action";
          item.textContent = room.name;
          item.dataset.roomId = room._id;
          item.addEventListener("click", () => switchRoom(room._id));
          roomList.appendChild(item);
        });

        if (rooms.length === 0) {
          chatBox.innerHTML = '<div class="text-muted">Нет доступных чатов. Нажмите + чтобы создать.</div>';
        }

        if (rooms.length > 0 && !currentRoomId) {
          switchRoom(rooms[0]._id);
        }
      });
  }

  function switchRoom(roomId) {
    if (currentRoomId === roomId) return;
    currentRoomId = roomId;

    Array.from(roomList.children).forEach(item => {
      item.classList.toggle("active", item.dataset.roomId === roomId);
    });

    socket.emit("join", { room_id: roomId });

    fetch(`/api/chat/messages/${roomId}`)
      .then(res => res.json())
      .then(messages => {
        chatBox.innerHTML = '';
        messages.reverse().forEach(addMessage); // важный момент
      });
  }

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
      if (reply.content) replyText.innerText = reply.content.slice(0, 300);

      if (reply.files && Array.isArray(reply.files)) {
        reply.files.forEach(file => {
          const fileName = file.file_name || "Файл";
          const fileSize = file.file_size ? (file.file_size / 1024).toFixed(1) + " KB" : "";
          const fileLink = document.createElement("a");
          fileLink.href = file.file_url;
          fileLink.target = "_blank";
          fileLink.classList.add("text-decoration-underline");
          fileLink.innerHTML = `📎 ${fileName} <span class="text-muted small">(${fileSize})</span>`;
          replyText.appendChild(fileLink);
        });
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

    if (msg.files && Array.isArray(msg.files)) {
      msg.files.forEach(file => {
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.file_url);
        const fileBlock = document.createElement("div");
        fileBlock.classList.add("mt-2");

        if (isImage) {
          const link = document.createElement("a");
          link.href = file.file_url;
          link.target = "_blank";
          const img = document.createElement("img");
          img.src = file.file_url;
          img.style.maxWidth = "600px";
          img.style.maxHeight = "600px";
          link.appendChild(img);
          fileBlock.appendChild(link);
        } else {
          const fileName = file.file_name || "Файл";
          const fileSize = file.file_size ? (file.file_size / 1024).toFixed(1) + " KB" : "";
          fileBlock.innerHTML = `<a href="${file.file_url}" target="_blank" class="text-decoration-underline">📎 ${fileName} <span class="text-muted small">(${fileSize})</span></a>`;
        }

        bubble.appendChild(fileBlock);
      });
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
        </div>`;
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
    chatBox.prepend(formatMessage(msg)); // prepend вместо append
  }

  sendBtn.addEventListener("click", () => {
    const content = input.value.trim();
    const files = Array.from(fileInput.files);
    if (!content && files.length === 0) return;
    if (!currentRoomId) return alert("Выберите чат");

    const formData = new FormData();
    formData.append("content", content);
    files.forEach(file => formData.append("files", file));

    if (replyTo) {
      formData.append("reply_to", JSON.stringify({
        sender_name: replyTo.sender_name,
        content: replyTo.content,
        files: replyTo.files || [],
        timestamp: replyTo.timestamp,
        message_id: replyTo._id
      }));
    }

    fetch(`/api/chat/send/${currentRoomId}`, {
      method: "POST",
      body: formData
    }).then(res => res.json())
      .then(resp => {
        if (resp.status === 'ok') {
          input.value = '';
          fileInput.value = '';
          selectedFiles.innerHTML = '';
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

  socket.on("new_message", (msg) => {
    if (msg.room_id === currentRoomId || msg.room_id === String(currentRoomId)) {
      addMessage(msg);
    }
  });

  loadRooms();
}
