function initDocuments() {
  console.log("\ud83d\udcc2 initDocuments() \u0437\u0430\u043f\u0443\u0449\u0435\u043d");

  document.querySelectorAll(".document-template-card").forEach(card => {
    card.addEventListener("click", () => {
      const template = card.dataset.template;
      const modal = document.getElementById("documentModal");
      const modalBody = modal.querySelector(".modal-body");
      modal.dataset.template = template;

      modalBody.innerHTML = "";

      fetch(`/templates/document_templates/${template}`)
        .then(response => {
          if (!response.ok) throw new Error("\u274c \u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d");
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

          const downloadBtn = modal.querySelector("#downloadPdfBtn");
          if (downloadBtn) {
            downloadBtn.addEventListener("click", async () => {
              const doc = modalBody.querySelector("#editableDocument");
              if (!doc) return alert("\u274c \u041d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0434\u043b\u044f \u043f\u0435\u0447\u0430\u0442\u0438");

              try {
                await new Promise(resolve => setTimeout(resolve, 100));
                await html2pdf().set({
                  margin: 0.5,
                  filename: `${template}_${Date.now()}.pdf`,
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2 },
                  jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
                }).from(doc).save();
              } catch (err) {
                console.error("\u274c \u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0438 PDF:", err);
                alert("\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0438 PDF");
              }
            });
          }
        })
        .catch(err => {
          console.error("\u274c \u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0448\u0430\u0431\u043b\u043e\u043d\u0430:", err);
          alert("\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0448\u0430\u0431\u043b\u043e\u043d\u0430 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430");
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

      console.log(`📦 Загружено юнитов: ${units.length}`);

      // 🆕 Инициализируем Select2 (если загружен)
      if (typeof $ !== 'undefined' && $.fn.select2) {
        $(unitSelect).select2({
          theme: 'bootstrap-5',
          width: '100%',
          placeholder: '-- Select Unit --',
          minimumResultsForSearch: 0,
          dropdownParent: $(modal)
        });
        console.log("✅ Select2 применён к #unitSelect");
      } else {
        console.warn("❌ Select2 или jQuery не загружены");
      }

      // === При выборе юнита — заполняем ячейки
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

  // === Кнопка генерации PDF ===
  const downloadBtn = modal.querySelector("#downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const doc = modalBody.querySelector("#editableDocument");
      if (!doc) return alert("❌ Не найден документ для печати");
      
      replaceFormElementsWithText(doc);
      
      html2pdf().set({
        margin: 0.5,
        filename: `lease_agreement_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      }).from(doc).save();
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
