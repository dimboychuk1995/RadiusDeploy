function initDocuments() {
  console.log("📂 initDocuments() запущен");

  document.querySelectorAll(".document-template-card").forEach(card => {
    card.addEventListener("click", () => {
      const template = card.dataset.template;
      const modal = document.getElementById("documentModal");
      const modalBody = modal.querySelector(".modal-body");
      modal.dataset.template = template;

      modalBody.innerHTML = "";

      fetch(`/templates/document_templates/${template}`)
        .then(response => {
          if (!response.ok) throw new Error("❌ Не удалось загрузить шаблон");
          return response.text();
        })
        .then(html => {
          modalBody.innerHTML = html;

          // Показываем модалку
          const bsModal = new bootstrap.Modal(modal);
          bsModal.show();

          // Загружаем компании
          fetch('/api/companies')
            .then(res => res.json())
            .then(data => {
              if (!data.success) throw new Error("Ошибка получения компаний");

              const companies = data.companies;
              const select = modalBody.querySelector("#companySelect");
              if (!select) return;

              companies.forEach(c => {
                const option = document.createElement("option");
                option.value = c._id;
                option.textContent = c.name;
                option.dataset.address = c.address;
                option.dataset.mc = c.mc;
                option.dataset.dot = c.dot;
                select.appendChild(option);
              });

              select.addEventListener("change", () => {
                const selected = select.selectedOptions[0];
                modalBody.querySelectorAll("[data-fill='company_name']").forEach(el => el.textContent = selected.textContent);
                modalBody.querySelectorAll("[data-fill='company_address']").forEach(el => el.textContent = selected.dataset.address || '');
                modalBody.querySelectorAll("[data-fill='mc']").forEach(el => el.textContent = selected.dataset.mc || '');
                modalBody.querySelectorAll("[data-fill='dot']").forEach(el => el.textContent = selected.dataset.dot || '');

                const today = new Date().toLocaleDateString('en-US');
                modalBody.querySelectorAll("[data-fill='date']").forEach(el => el.textContent = today);
              });
            })
            .catch(err => {
              console.error("❌ Ошибка загрузки компаний:", err);
              alert("Ошибка загрузки списка компаний");
            });

          // Кнопка "Скачать PDF"
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
