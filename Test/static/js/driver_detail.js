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
    const salaryForm = document.getElementById("salarySchemeForm");

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
                    <input type="number" step="0.01" class="form-control" name="gross_from_sum[]" placeholder="от суммы ($)">
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
                    <input type="number" step="0.01" class="form-control" name="net_from_sum[]" placeholder="от суммы ($)">
                </div>
                <div class="col">
                    <input type="number" step="0.01" class="form-control" name="net_percent[]" placeholder="Процент (%)">
                </div>
            `;
            netCommissionTable.appendChild(row);
        });
    }

    const salaryButton = document.querySelector('[data-target="#salarySchemeModal"]');

    if (salaryForm) {
        salaryForm.addEventListener("submit", function (e) {
            e.preventDefault();
            const driverId = salaryForm.dataset.driverId;
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

        $('#salarySchemeModal').on('show.bs.modal', function () {
            const driverId = salaryForm.dataset.driverId;
            fetch(`/get_salary_scheme/${driverId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        const scheme = data.data;
                        schemeSelect.value = scheme.scheme_type || "percent";
                        schemeSelect.dispatchEvent(new Event("change"));
                        commissionTable.innerHTML = '';
                        netCommissionTable.innerHTML = '';

                        if (scheme.scheme_type === "percent") {
                            scheme.commission_table.forEach(entry => {
                                const row = document.createElement("div");
                                row.classList.add("form-row", "mb-2");
                                row.innerHTML = `
                                    <div class="col">
                                        <input type="number" step="0.01" class="form-control" name="gross_from_sum[]" value="${entry.from_sum}" placeholder="от суммы ($)">
                                    </div>
                                    <div class="col">
                                        <input type="number" step="0.01" class="form-control" name="gross_percent[]" value="${entry.percent}" placeholder="Процент (%)">
                                    </div>
                                `;
                                commissionTable.appendChild(row);
                            });
                        }

                        if (scheme.scheme_type === "net_percent") {
                            scheme.net_commission_table.forEach(entry => {
                                const row = document.createElement("div");
                                row.classList.add("form-row", "mb-2");
                                row.innerHTML = `
                                    <div class="col">
                                        <input type="number" step="0.01" class="form-control" name="net_from_sum[]" value="${entry.from_sum}" placeholder="от суммы ($)">
                                    </div>
                                    <div class="col">
                                        <input type="number" step="0.01" class="form-control" name="net_percent[]" value="${entry.percent}" placeholder="Процент (%)">
                                    </div>
                                `;
                                netCommissionTable.appendChild(row);
                            });
                        }
                    }
                })
                .catch(err => {
                    console.error("Ошибка загрузки схемы:", err);
                });
        });

        // ⛔️ Снимаем фокус перед закрытием, чтобы избежать aria-hidden ошибки
        $('#salarySchemeModal').on('hide.bs.modal', function () {
            document.activeElement.blur();
        });

        // ✅ Возвращаем фокус на кнопку открытия модалки
        $('#salarySchemeModal').on('hidden.bs.modal', function () {
            if (salaryButton) salaryButton.focus();
        });
    }

    // 💰 Расчёт зарплаты
    calculateAndRenderSalary();

    function calculateAndRenderSalary() {
        const form = document.getElementById("editForm");
        if (!form) {
            console.warn("⛔️ Не найден editForm для расчета зарплаты");
            return;
        }

        const grossAmountEl = document.getElementById("grossAmount");
        const expensesAmountEl = document.getElementById("expensesAmount");
        const netAmountEl = document.getElementById("netAmount");
        const usedPercentEl = document.getElementById("usedPercent");
        const finalSalaryEl = document.getElementById("finalSalary");

        const loads = JSON.parse(form.dataset.loads || "[]");
        const schemeType = form.dataset.schemeType;
        const commissionTable = JSON.parse(form.dataset.commission || "[]");

        const grossTotal = loads.reduce((sum, load) => sum + (load.price || 0), 0);
        const fuelTotal = loads.reduce((sum, load) => sum + (load.fuel_cost || 0), 0);
        const tollsTotal = loads.reduce((sum, load) => sum + (load.tolls_cost || 0), 0);
        const expenses = fuelTotal + tollsTotal;
        const netTotal = grossTotal - expenses;

        const baseAmount = schemeType === "net_percent" ? netTotal : grossTotal;

        let appliedPercent = 0;
        for (const entry of commissionTable) {
            if (baseAmount >= entry.from_sum) {
                appliedPercent = entry.percent;
            }
        }

        const salary = baseAmount * appliedPercent / 100;

        if (grossAmountEl) grossAmountEl.textContent = `$${grossTotal.toFixed(2)}`;
        if (expensesAmountEl) expensesAmountEl.textContent = `$${expenses.toFixed(2)}`;
        if (netAmountEl) netAmountEl.textContent = `$${netTotal.toFixed(2)}`;
        if (usedPercentEl) usedPercentEl.textContent = `${appliedPercent}%`;
        if (finalSalaryEl) finalSalaryEl.textContent = `$${salary.toFixed(2)}`;
    }
}
