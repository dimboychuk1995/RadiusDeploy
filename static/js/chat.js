function initChat() {
  const socket = io();

  const meta = document.getElementById("chat-meta");
  const CURRENT_USER_ID = meta.dataset.userId;
  const CURRENT_USER_NAME = meta.dataset.userName;

  const chatBox = document.getElementById("chat-box");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");

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
      <div>${msg.content}</div>
    `;
    return div;
  }

  function addMessage(msg) {
    chatBox.appendChild(formatMessage(msg));
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  sendBtn.addEventListener("click", () => {
    const content = input.value.trim();
    if (!content) return;
    socket.emit("send_message", { content });
    input.value = '';
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
