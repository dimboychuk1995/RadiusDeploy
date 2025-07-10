console.log("🔧 driver_detail.js загружен");

const perMileBlock = document.getElementById("perMileBlock");

function initDriverDetailActions() {
    console.log("🔧 initDriverDetailActions вызвана");

    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const formElements = document.querySelectorAll('#editForm input, #editForm select');

    if (editBtn && saveBtn && formElements.length) {
        editBtn.addEventListener('click', function () {
            formElements.forEach(element => element.disabled = false);
            editBtn.classList.add('d-none');
            saveBtn.classList.remove('d-none');
        });
    }

    const backBtn = document.getElementById("backToDriversBtn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            localStorage.setItem("activeSection", "btn-drivers");
            window.location.href = "/";
        });
    }

    const form = document.getElementById("editForm");
    if (form) {
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            const formData = new FormData(form);
            const driverId = form.dataset.driverId;

            if (!driverId) {
                console.error("❌ driverId отсутствует в editForm");
                alert("Ошибка: не удалось определить ID водителя");
                return;
            }

            fetch(`/edit_driver/${driverId}`, {
                method: "POST",
                body: formData
            })
                .then(res => {
                    if (res.ok) {
                        localStorage.setItem("activeSection", "btn-drivers");
                        window.location.href = "/";
                    } else {
                        alert("❌ Ошибка при сохранении");
                    }
                })
                .catch(err => {
                    console.error("Ошибка запроса:", err);
                    alert("❌ Ошибка сети");
                });
        });
    }

    const schemeSelect = document.getElementById("schemeTypeSelect");
    const percentBlock = document.getElementById("percentSchemeBlock");
    const netBlock = document.getElementById("netPercentBlock");
    const addGrossRowBtn = document.getElementById("addCommissionRow");
    const commissionTable = document.getElementById("commissionTable");
    const addNetRowBtn = document.getElementById("addNetCommissionRow");
    const netCommissionTable = document.getElementById("netCommissionTable");

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

    if (addGrossRowBtn && commissionTable) {
        addGrossRowBtn.addEventListener("click", () => {
            const row = document.createElement("div");
            row.classList.add("form-row", "mb-2");
            row.innerHTML = `
                <div class="col">
                    <input type="number" step="0.01" min="0.01" class="form-control" name="gross_from_sum[]" placeholder="от суммы ($) — не 0">
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
                    <input type="number" step="0.01" min="0.01" class="form-control" name="net_from_sum[]" placeholder="от суммы ($) — не 0">
                </div>
                <div class="col">
                    <input type="number" step="0.01" class="form-control" name="net_percent[]" placeholder="Процент (%)">
                </div>
            `;
            netCommissionTable.appendChild(row);
        });
    }

    // 🔧 Additional Charges
    const additionalContainer = document.getElementById("additionalChargesContainer");
    const addChargeBtn = document.getElementById("addChargeBtn");

    if (addChargeBtn && additionalContainer) {
        addChargeBtn.addEventListener("click", () => {
            const block = document.createElement("div");
            block.className = "border p-3 mb-3 rounded bg-light";

            block.innerHTML = `
                <div class="form-group">
                    <label>Тип списания:</label>
                    <input type="text" name="charge_type[]" class="form-control" placeholder="например: штраф, аренда и т.д.">
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
                    <input type="number" name="charge_day_of_month[]" class="form-control" placeholder="например: 15">
                </div>

                <div class="form-group">
                    <label>Файл:</label>
                    <input type="file" name="charge_file[]" class="form-control-file">
                </div>

                <div class="form-group">
                    <label>Сумма ($):</label>
                    <input type="number" step="0.01" name="charge_amount[]" class="form-control" placeholder="например: 75.00">
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

    const salaryForm = document.getElementById("salarySchemeForm");

    if (salaryForm) {
        salaryForm.addEventListener("submit", function (e) {
            e.preventDefault();
            const driverId = salaryForm.dataset.driverId;
            console.log("📦 driverId:", driverId);
            console.log("📦 salaryForm:", salaryForm);

            if (!driverId) {
                alert("❌ Ошибка: не удалось получить ID водителя.");
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
                        alert("✅ Схема зарплаты сохранена");
                        closeSalaryModal();
                        window.location.reload();
                    } else {
                        alert("❌ Ошибка при сохранении схемы");
                    }
                })
                .catch(err => {
                    console.error("Ошибка при отправке схемы:", err);
                    alert("❌ Сетевая ошибка");
                });
        });
    }

    // ✅ Инициализируем иконки Lucide
    if (window.lucide) {
        lucide.createIcons();
    }
}

function openSalaryModal() {
    document.getElementById("salarySchemeModal")?.classList.add("open");
    document.querySelector(".custom-offcanvas-backdrop")?.classList.add("show");
}

function closeSalaryModal() {
    document.getElementById("salarySchemeModal")?.classList.remove("open");
    document.querySelector(".custom-offcanvas-backdrop")?.classList.remove("show");
}

document.addEventListener("DOMContentLoaded", () => {
    const toggleButtons = document.querySelectorAll(".toggle-btn");

    toggleButtons.forEach(btn => {
        const icon = btn.querySelector("i");

        if (!icon) return;

        const targetId = btn.getAttribute("data-bs-target");
        const collapseEl = document.querySelector(targetId);

        if (collapseEl) {
            collapseEl.addEventListener("show.bs.collapse", () => {
                icon.classList.remove("chevron-down");
                icon.classList.add("chevron-up");
            });

            collapseEl.addEventListener("hide.bs.collapse", () => {
                icon.classList.remove("chevron-up");
                icon.classList.add("chevron-down");
            });
        }
    });
});


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
      const res = await fetch(`/download_file/${driverId}/${docType}`);
      const contentType = res.headers.get("Content-Type");

      if (contentType.includes("pdf")) {
        container.innerHTML = `<iframe src="/download_file/${driverId}/${docType}" width="100%" height="600px" class="border rounded"></iframe>`;
      } else if (contentType.includes("image")) {
        container.innerHTML = `<img src="/download_file/${driverId}/${docType}" class="img-fluid border rounded">`;
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