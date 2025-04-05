console.log("🔧 driver_detail.js загружен");

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
            if (schemeSelect.value === "percent") {
                percentBlock.style.display = "block";
                netBlock.style.display = "none";
            } else {
                percentBlock.style.display = "none";
                netBlock.style.display = "block";
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
                        $('#salarySchemeModal').modal('hide');
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
}
