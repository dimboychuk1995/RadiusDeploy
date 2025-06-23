function initDocuments() {
  console.log("📂 initDocuments() запущен");

  document.querySelectorAll(".document-template-card").forEach(card => {
    card.addEventListener("click", () => {
      const template = card.dataset.template;
      console.log("🟦 Клик по шаблону:", template);

      const modal = document.getElementById("documentModal");
      modal.dataset.template = template;

      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
    });
  });

  const generateBtn = document.getElementById("generatePdfBtn");
  if (!generateBtn) {
    console.error("❌ Кнопка #generatePdfBtn не найдена!");
    return;
  }

  generateBtn.addEventListener("click", () => {
    console.log("🔵 Нажата кнопка 'Сгенерировать PDF'");

    const modal = document.getElementById("documentModal");
    const template = modal.dataset.template;
    console.log("📄 Выбранный шаблон:", template);

    const form = document.getElementById("documentForm");
    const formData = new FormData(form);
    const fields = {};

    formData.forEach((value, key) => {
      fields[key] = value;
    });

    console.log("📨 Отправляемые данные:", fields);

    fetch("/api/documents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, fields })
    })
    .then(res => {
      console.log("📬 Ответ от сервера получен, статус:", res.status);
      return res.json();
    })
    .then(res => {
      console.log("📥 Распакованный ответ:", res);
      if (res.success) {
        const previewFrame = document.getElementById("pdfPreview");
        previewFrame.src = res.file_url;
        console.log("✅ PDF загружен в предпросмотр:", res.file_url);
      } else {
        alert("Ошибка: " + res.error);
        console.error("❌ Ошибка от сервера:", res.error);
      }
    })
    .catch(err => {
      console.error("❌ Ошибка при запросе:", err);
      alert("Ошибка при генерации PDF");
    });
  });
}
