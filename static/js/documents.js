function initDocuments() {
  console.log("📂 initDocuments() запущен");

  document.querySelectorAll(".document-template-card").forEach(card => {
    card.addEventListener("click", () => {
      const template = card.dataset.template;
      const modal = document.getElementById("documentModal");
      const modalBody = modal.querySelector(".modal-body");
      modal.dataset.template = template;

      // Очищаем тело перед вставкой нового шаблона
      modalBody.innerHTML = "";

      fetch(`/templates/document_templates/${template}`)
        .then(response => {
          if (!response.ok) throw new Error("❌ Не удалось загрузить шаблон");
          return response.text();
        })
        .then(html => {
          modalBody.innerHTML = html;

          const bsModal = new bootstrap.Modal(modal);
          bsModal.show();

          // Обработчик кнопки "Скачать PDF"
          const downloadBtn = modal.querySelector("#downloadPdfBtn");
          if (downloadBtn) {
            downloadBtn.addEventListener("click", () => {
              const doc = modalBody.querySelector("#editableDocument");
              if (!doc) return alert("❌ Не найден документ для печати");

              html2pdf().set({
                margin: 0.5,
                filename: `${template}_${Date.now()}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
              }).from(doc).save();
            });
          }
        })
        .catch(err => {
          console.error("❌ Ошибка загрузки шаблона:", err);
          alert("Ошибка загрузки шаблона документа");
        });
    });
  });
}
