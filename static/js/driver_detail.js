console.log("🔧 driver_detail.js загружен");

const perMileBlock = document.getElementById("perMileBlock");

/** 🔁 Инициализация всех действий на странице деталей водителя */
function initDriverDetailActions() {
  setupBackButton();
  setupSalarySchemeForm();
  setupCollapsePreview();
  setupCommissionRowButtons();
  setupAdditionalCharges();
  setupCleanInspectionBonusToggle();
  setupExtraStopBonusToggle(); // 🆕 добавили

  if (window.lucide) lucide.createIcons();
}

/** 🔙 Назад к списку водителей */
function setupBackButton() {
  const backBtn = document.getElementById("backToDriversBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      localStorage.setItem("activeSection", "btn-drivers");
      window.location.href = "/";
    });
  }
}

/** 💰 Обработка смены типа зарплатной схемы и отправка формы */
function setupSalarySchemeForm() {
  const schemeSelect = document.getElementById("schemeTypeSelect");
  const percentBlock = document.getElementById("percentSchemeBlock");
  const netBlock = document.getElementById("netPercentBlock");

  if (schemeSelect && percentBlock && netBlock) {
    schemeSelect.addEventListener("change", () => {
      const selected = schemeSelect.value;
      percentBlock.style.display = selected === "percent" ? "block" : "none";
      netBlock.style.display = selected === "net_percent" ? "block" : "none";
      if (perMileBlock) {
        perMileBlock.style.display = selected === "per_mile" ? "block" : "none";
      }
    });
  }

  const salaryForm = document.getElementById("salarySchemeForm");
  if (salaryForm) {
    salaryForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const driverId = salaryForm.dataset.driverId;

      if (!driverId) {
        Swal.fire({
          icon: "error",
          title: "Ошибка",
          text: "Не удалось получить ID водителя."
        });
        return;
      }

      const formData = new FormData(salaryForm);

      fetch(`/set_salary_scheme/${driverId}`, {
        method: "POST",
        body: formData
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            Swal.fire({
              icon: "success",
              title: "Сохранено",
              text: "Схема зарплаты сохранена"
            }).then(() => {
              closeSalaryModal();
              window.location.reload();
            });
          } else {
            Swal.fire({
              icon: "error",
              title: "Ошибка",
              text: data.message || "Ошибка при сохранении схемы"
            });
          }
        })
        .catch(err => {
          console.error("Ошибка при отправке схемы:", err);
          Swal.fire({
            icon: "error",
            title: "Сетевая ошибка",
            text: "Не удалось отправить схему. Попробуйте ещё раз."
          });
        });
    });
  }
}

/** 🧾 Предпросмотр файлов при раскрытии collapse (GridFS) */
function setupCollapsePreview() {
  document.querySelectorAll('.collapse').forEach(collapse => {
    collapse.addEventListener('show.bs.collapse', async function () {
      const preview = this.querySelector('.collapse-loader');
      if (!preview || preview.getAttribute('data-loaded') === 'true') return;

      const driverId = preview.dataset.driverId;
      const docType = preview.dataset.doc;
      const container = preview.querySelector('.file-content');
      const spinner = preview.querySelector('.spinner-border');
      spinner.classList.remove('d-none');

      try {
        const res = await fetch(`/api/driver_file/${driverId}/${docType}`);
        const data = await res.json();

        if (!res.ok || !data.file_id) {
          container.innerHTML = `<p class="text-danger">Ошибка загрузки файла</p>`;
          return;
        }

        const fileUrl = `/driver_file/${data.file_id}`;
        const filename = data.filename.toLowerCase();

        if (filename.endsWith(".pdf")) {
          container.innerHTML = `<iframe src="${fileUrl}" width="100%" height="600px" class="border rounded"></iframe>`;
        } else if (filename.match(/\.(jpg|jpeg|png|gif)$/)) {
          container.innerHTML = `<img src="${fileUrl}" class="img-fluid border rounded">`;
        } else {
          container.innerHTML = `<p class="text-muted">Невозможно отобразить предпросмотр</p>`;
        }

        preview.setAttribute('data-loaded', 'true');
      } catch (err) {
        container.innerHTML = `<p class="text-danger">Ошибка загрузки файла</p>`;
      } finally {
        spinner.classList.add('d-none');
      }
    });
  });
}

/** ➕ Добавление строк в таблицу уровней (процент/чистая прибыль) */
function setupCommissionRowButtons() {
  const addGrossRowBtn = document.getElementById("addCommissionRow");
  const commissionTable = document.getElementById("commissionTable");
  const addNetRowBtn = document.getElementById("addNetCommissionRow");
  const netCommissionTable = document.getElementById("netCommissionTable");

  if (addGrossRowBtn && commissionTable) {
    addGrossRowBtn.addEventListener("click", () => {
      const row = document.createElement("div");
      row.classList.add("form-row", "mb-2");
      row.innerHTML = `
        <div class="col">
            <input type="number" step="0.01" min="0.01" class="form-control" name="gross_from_sum[]" placeholder="от суммы ($)">
        </div>
        <div class="col">
            <input type="number" step="0.01" class="form-control" name="gross_percent[]" placeholder="Процент (%)">
        </div>
      `;
      commissionTable.appendChild(row);
    });
  }

  if (addNetRowBtn && netCommissionTable) {
    addNetRowBtn.addEventListener("click", () => {
      const row = document.createElement("div");
      row.classList.add("form-row", "mb-2");
      row.innerHTML = `
        <div class="col">
            <input type="number" step="0.01" min="0.01" class="form-control" name="net_from_sum[]" placeholder="от суммы ($)">
        </div>
        <div class="col">
            <input type="number" step="0.01" class="form-control" name="net_percent[]" placeholder="Процент (%)">
        </div>
      `;
      netCommissionTable.appendChild(row);
    });
  }
}

/** 💳 Добавление блоков дополнительных списаний */
function setupAdditionalCharges() {
  const additionalContainer = document.getElementById("additionalChargesContainer");
  const addChargeBtn = document.getElementById("addChargeBtn");

  if (addChargeBtn && additionalContainer) {
    addChargeBtn.addEventListener("click", () => {
      const block = document.createElement("div");
      block.className = "border p-3 mb-3 rounded bg-light";

      block.innerHTML = `
        <div class="form-group">
            <label>Тип списания:</label>
            <input type="text" name="charge_type[]" class="form-control">
        </div>
        <div class="form-group">
            <label>Период:</label>
            <select name="charge_period[]" class="form-control period-select">
                <option value="statement">Каждый стейтмент</option>
                <option value="monthly">Раз в месяц</option>
            </select>
        </div>
        <div class="form-group date-group d-none">
            <label>Число месяца:</label>
            <input type="number" name="charge_day_of_month[]" class="form-control">
        </div>
        <div class="form-group">
            <label>Файл:</label>
            <input type="file" name="charge_file[]" class="form-control-file">
        </div>
        <div class="form-group">
            <label>Сумма ($):</label>
            <input type="number" step="0.01" name="charge_amount[]" class="form-control">
        </div>
      `;

      const periodSelect = block.querySelector(".period-select");
      const dateGroup = block.querySelector(".date-group");

      periodSelect.addEventListener("change", () => {
        if (periodSelect.value === "monthly") {
          dateGroup.classList.remove("d-none");
        } else {
          dateGroup.classList.add("d-none");
          block.querySelector('[name="charge_day_of_month[]"]').value = '';
        }
      });

      additionalContainer.appendChild(block);
    });
  }
}

/** ✅ Обработка показа блока Clean Inspection Bonus */
function setupCleanInspectionBonusToggle() {
  const checkbox = document.getElementById("enableInspectionBonus");
  const bonusBlock = document.getElementById("inspectionBonusBlock");

  if (checkbox && bonusBlock) {
    checkbox.addEventListener("change", () => {
      bonusBlock.style.display = checkbox.checked ? "block" : "none";
    });
  }
}

/** 🆕 ✅ Обработка показа блока Extra Stop Bonus */
function setupExtraStopBonusToggle() {
  const checkbox = document.getElementById("enableExtraStopBonus");
  const block = document.getElementById("extraStopBonusBlock");

  if (checkbox && block) {
    checkbox.addEventListener("change", () => {
      block.style.display = checkbox.checked ? "block" : "none";
    });
  }
}

/** 📤 Открытие модалки зарплаты */
function openSalaryModal() {
  const modal = document.getElementById("salarySchemeModal");
  const backdrop = document.querySelector(".custom-offcanvas-backdrop");
  const form = document.getElementById("salarySchemeForm");
  const driverId = form?.dataset.driverId;

  modal?.classList.add("open");
  backdrop?.classList.add("show");

  if (!driverId) return;

  // 🔄 Загрузить данные схемы
  fetch(`/get_salary_scheme/${driverId}`)
    .then(res => res.json())
    .then(data => {
      if (!data.success || !data.data) return;

      const scheme = data.data;

      // ✅ Clean Inspection Bonus
      const enableBonusCheckbox = document.getElementById("enableInspectionBonus");
      const bonusBlock = document.getElementById("inspectionBonusBlock");
      const level1 = document.querySelector('[name="bonus_level_1"]');
      const level2 = document.querySelector('[name="bonus_level_2"]');
      const level3 = document.querySelector('[name="bonus_level_3"]');

      if (enableBonusCheckbox && bonusBlock) {
        enableBonusCheckbox.checked = scheme.enable_inspection_bonus === true;
        bonusBlock.style.display = enableBonusCheckbox.checked ? "block" : "none";
      }

      if (level1) level1.value = scheme.bonus_level_1 || '';
      if (level2) level2.value = scheme.bonus_level_2 || '';
      if (level3) level3.value = scheme.bonus_level_3 || '';

      // 🆕 Extra Stop Bonus
      const enableExtra = document.getElementById("enableExtraStopBonus");
      const extraBlock = document.getElementById("extraStopBonusBlock");
      const extraAmount = document.querySelector('[name="extra_stop_bonus_amount"]');

      if (enableExtra && extraBlock) {
        enableExtra.checked = scheme.enable_extra_stop_bonus === true;
        extraBlock.style.display = enableExtra.checked ? "block" : "none";
      }
      if (extraAmount) extraAmount.value = scheme.extra_stop_bonus_amount ?? '';
    })
    .catch(err => {
      console.warn("Ошибка при загрузке схемы зарплаты:", err);
    });
}

/** ❌ Закрытие модалки зарплаты */
function closeSalaryModal() {
  document.getElementById("salarySchemeModal")?.classList.remove("open");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.remove("show");
}

document.addEventListener("DOMContentLoaded", initDriverDetailActions);
