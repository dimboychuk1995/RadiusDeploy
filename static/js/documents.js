function initDocuments() {
  console.log("📂 initDocuments() запущен");

  document.querySelectorAll(".document-template-card").forEach(card => {
    card.addEventListener("click", () => {
      const template = card.dataset.template;
      console.log("🟦 Клик по шаблону:", template);

      const modal = document.getElementById("documentModal");
      const modalBody = modal.querySelector(".modal-body");
      modal.dataset.template = template;

      fetch(`/templates/document_templates/${template}`)
        .then(response => {
          if (!response.ok) throw new Error("❌ Не удалось загрузить шаблон");
          return response.text();
        })
        .then(html => {
          modalBody.innerHTML = html;

          // ❗ Навешиваем обработчик заново после вставки HTML
          const downloadBtn = modalBody.querySelector("#downloadPdfBtn");
          if (downloadBtn) {
            downloadBtn.addEventListener("click", () => {
              const element = modalBody.querySelector("#editableDocument");
              if (!element) return alert("Документ не загружен");

              const opt = {
                margin: 0.5,
                filename: `${template}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
              };

              html2pdf().set(opt).from(element).save();
            });
          }

          const bsModal = new bootstrap.Modal(modal);
          bsModal.show();
        })
        .catch(err => {
          console.error("❌ Ошибка загрузки шаблона:", err);
          alert("Ошибка загрузки шаблона документа");
        });
    });
  });
}
