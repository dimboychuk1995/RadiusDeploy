// === Заменить downloadBtn обработку в initDocuments() ===
function initDocuments() {
  console.log("\ud83d\udcc2 initDocuments() запущен");

  document.querySelectorAll(".document-template-card").forEach(card => {
    card.addEventListener("click", () => {
      const template = card.dataset.template;
      const modal = document.getElementById("documentModal");
      const modalBody = modal.querySelector(".modal-body");
      modal.dataset.template = template;

      modalBody.innerHTML = "";

      fetch(`/templates/document_templates/${template}`)
        .then(response => {
          if (!response.ok) throw new Error("\u274c Не удалось загрузить шаблон");
          return response.text();
        })
        .then(html => {
          modalBody.innerHTML = html;

          const bsModal = new bootstrap.Modal(modal);
          bsModal.show();

          switch (template) {
            case 'lease_agreement':
              initLeaseAgreement(modalBody, modal);
              break;
            case 'truck_trailer_checklist':
              initTruckChecklist(modalBody, modal);
              break;
            case 'annual_inspection':
              initAnnualInspection(modalBody, modal);
              break;
            case 'driver_contract':
              initDriverContract(modalBody, modal);
              break;
            default:
              console.warn("⛔ Нет специфичной инициализации для:", template);
          }
        })
        .catch(err => {
          console.error("\u274c Ошибка загрузки шаблона:", err);
          alert("Ошибка загрузки шаблона документа");
        });
    });
  });
}

function initLeaseAgreement(modalBody, modal) {
  const select = modalBody.querySelector("#companySelect");

  // === Запрашиваем компании ===
  fetch('/api/companies')
    .then(res => res.json())
    .then(data => {
      if (!data.success) throw new Error("Ошибка получения компаний");

      const companies = data.companies;
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
    });

  // === Подгружаем список юнитов ===
  fetch('/api/units')
    .then(res => res.json())
    .then(data => {
      if (!data.success) throw new Error("Ошибка загрузки юнитов");

      const units = data.units || [];
      modalBody.loadedUnits = units;

      const unitSelect = modalBody.querySelector("#unitSelect");
      if (!unitSelect) {
        console.warn("❌ unitSelect не найден в DOM");
        return;
      }

      units.forEach(unit => {
        const opt = document.createElement("option");
        opt.value = unit._id;
        opt.textContent = unit.unit;
        opt.dataset.make = unit.make;
        opt.dataset.model = unit.model;
        opt.dataset.year = unit.year;
        opt.dataset.vin = unit.vin;
        unitSelect.appendChild(opt);
      });

      if (typeof $ !== 'undefined' && $.fn.select2) {
        $(unitSelect).select2({
          theme: 'bootstrap-5',
          width: '100%',
          placeholder: '-- Select Unit --',
          minimumResultsForSearch: 0,
          dropdownParent: $(modal)
        });
      }

      $(unitSelect).on('change', function () {
        const selectedValue = $(this).val();
        const selectedOption = unitSelect.querySelector(`option[value="${selectedValue}"]`);
        if (!selectedOption) return;

        modalBody.querySelector("#makeCell").textContent = selectedOption.dataset.make || '';
        modalBody.querySelector("#modelCell").textContent = selectedOption.dataset.model || '';
        modalBody.querySelector("#yearCell").textContent = selectedOption.dataset.year || '';
        modalBody.querySelector("#vinCell").textContent = selectedOption.dataset.vin || '';
      });
    })
    .catch(err => {
      console.error("❌ Ошибка получения юнитов:", err);
    });

  // === Equipment Owner input связка ===
  const equipmentInput = modalBody.querySelector("#equipmentOwnerInput");
  const equipmentNameDisplay = modalBody.querySelector("#equipmentOwnerName");
  const equipmentSignature = modalBody.querySelector("#equipmentOwnerSignature");

  if (equipmentInput && equipmentNameDisplay) {
    const updateOwnerFields = (val) => {
      equipmentNameDisplay.textContent = val;
      if (equipmentSignature) equipmentSignature.textContent = val;
    };

    updateOwnerFields(equipmentInput.value || '');
    equipmentInput.addEventListener("input", () => {
      updateOwnerFields(equipmentInput.value || '');
    });
  }

  // === Кнопка генерации, сохранения и скачивания PDF ===
  const downloadBtn = modal.querySelector("#downloadPdfBtn");
  if (downloadBtn) {
    const newBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);

    newBtn.addEventListener("click", async () => {
      const doc = modalBody.querySelector("#editableDocument");
      const unitSelect = modalBody.querySelector("#unitSelect");
      const unitId = unitSelect?.value;

      if (!doc) {
        Swal.fire("Ошибка", "Не найден документ для печати", "error");
        return;
      }

      if (!unitId) {
        Swal.fire("Ошибка", "Выберите юнит перед загрузкой документа", "warning");
        return;
      }

      replaceFormElementsWithText(doc);

      try {
        const filename = `lease_agreement_${Date.now()}.pdf`;

        // 1. Генерация PDF → blob
        const blob = await html2pdf().set({
          margin: 0.5,
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        }).from(doc).outputPdf('blob');

        // 2. Отправка в базу
        const formData = new FormData();
        formData.append("file", new File([blob], filename, { type: "application/pdf" }));
        formData.append("unit_id", unitId);

        const res = await fetch("/api/units/upload_lease_agreement", {
          method: "POST",
          body: formData
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        // 3. Скачивание на клиент
        const downloadLink = document.createElement("a");
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = filename;
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(downloadLink.href);

        // 4. Закрываем модалку и показываем подтверждение
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) bsModal.hide();

        Swal.fire("Готово", "Документ сохранён и скачан", "success");
        console.log("📁 Новый file_id:", json.file_id);
      } catch (err) {
        console.error("❌ Ошибка при сохранении или скачивании PDF:", err);
        Swal.fire("Ошибка", "Ошибка при создании или загрузке PDF", "error");
      }
    });
  }
}


// Replace inputs and select to text
function replaceFormElementsWithText(container) {
  // Удаляем .select2 DOM-обёртки, если есть
  container.querySelectorAll('.select2-container').forEach(el => el.remove());
  
  // Заменяем <input>
  container.querySelectorAll("input").forEach(input => {
    const span = document.createElement("span");
    span.textContent = input.value;
    span.style.fontWeight = "bold";
    input.replaceWith(span);
  });

  // Заменяем <select>
  container.querySelectorAll("select").forEach(select => {
    const selectedText = select.options[select.selectedIndex]?.textContent || '';
    const span = document.createElement("span");
    span.textContent = selectedText;
    span.style.fontWeight = "bold";
    select.replaceWith(span);
  });
}

function initTruckChecklist(modalBody, modal) {
  const select = modalBody.querySelector("#companySelect");

  fetch('/api/companies')
    .then(res => res.json())
    .then(data => {
      if (!data.success) throw new Error("Ошибка получения компаний");

      const companies = data.companies;
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
    });

  const downloadBtn = modal.querySelector("#downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const doc = modalBody.querySelector("#editableDocument");
      if (!doc) return alert("❌ Не найден документ для печати");

      html2pdf().set({
        margin: 0.5,
        filename: `truck_trailer_checklist_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      }).from(doc).save();
    });
  }
}

function initAnnualInspection(modalBody, modal) {
  const select = modalBody.querySelector("#companySelect");

  fetch('/api/companies')
    .then(res => res.json())
    .then(data => {
      if (!data.success) throw new Error("Ошибка получения компаний");
      const companies = data.companies;
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
    });

  const downloadBtn = modal.querySelector("#downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const doc = modalBody.querySelector("#editableDocument");
      if (!doc) return alert("❌ Не найден документ для печати");

      html2pdf().set({
        margin: 0.5,
        filename: `annual_inspection_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      }).from(doc).save();
    });
  }
}

function initDriverContract(modalBody, modal) {
  const today = new Date().toLocaleDateString('en-US');
  modalBody.querySelectorAll("[data-fill='date']").forEach(el => el.textContent = today);

  const select = modalBody.querySelector("#companySelect");
  if (!select) return;

  fetch('/api/companies')
    .then(res => res.json())
    .then(data => {
      const companies = data.companies || [];
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
      });
    });
}
