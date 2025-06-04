let selectedDriverData = null;
let selectedLoads = [];

function initStatementEvents() {
    const select = $('#driverSelect');
    const createBtn = document.getElementById("createStatementBtn");
    const detailsBlock = document.getElementById("statementDetails");
    const loadsBlock = document.getElementById("driverLoadsBlock");
    const loadsContent = document.getElementById("driverLoadsContent");

    if (!select.length || !createBtn || !detailsBlock || !loadsBlock || !loadsContent) return;

    select.select2({
        dropdownParent: $('#createStatementModal'),
        placeholder: 'Выберите водителя',
        width: 'resolve',
        allowClear: true
    });

    select.on('change', function () {
        const driverId = this.value;
        if (!driverId) {
            createBtn.disabled = true;
            delete createBtn.dataset.driverId;
            detailsBlock.style.display = 'none';
            loadsBlock.style.display = 'none';
            document.getElementById("driverFuelBlock") && (document.getElementById("driverFuelBlock").style.display = "none");
            document.getElementById("driverTollsBlock") && (document.getElementById("driverTollsBlock").style.display = "none");
            selectedDriverData = null;
            selectedLoads = [];
            return;
        }

        createBtn.disabled = false;
        createBtn.dataset.driverId = driverId;
        detailsBlock.style.display = 'block';

        populateWeekSelect('#weekSelect');

        fetch(`/statement/driver_loads/${driverId}`)
            .then(res => res.text())
            .then(html => {
                loadsBlock.style.display = 'block';
                loadsContent.innerHTML = html;

                selectedDriverData = getDriverDataById(driverId);
                selectedLoads = parseLoadsFromHTML(html);

                const weekValue = document.getElementById("weekSelect")?.value;
                if (weekValue) {
                    const [startStr, endStr] = weekValue.split(' - ');
                    filterLoadsByDateRange(startStr, endStr);
                    highlightWeekLoads(startStr, endStr);

                    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');
                    rows.forEach(row => {
                        const checkbox = row.querySelector('.load-checkbox');
                        const deliveryStr = row.querySelector('[data-delivery-date]')?.dataset.deliveryDate.trim();
                        if (!checkbox || !deliveryStr) return;

                        checkbox.checked = deliveryStr >= startStr && deliveryStr <= endStr;
                        checkbox.addEventListener('change', calculateAndDisplaySalary);
                    });

                    calculateAndDisplaySalary();
                    loadFuelTransactions(driverId, weekValue);
                    loadTollTransactions(driverId, weekValue);
                    loadDriverCharges(selectedDriverData, weekValue); // ✅
                }

                document.getElementById("fuelInput")?.addEventListener('input', calculateAndDisplaySalary);
                document.getElementById("tollsInput")?.addEventListener('input', calculateAndDisplaySalary);
            })
            .catch(err => {
                console.error("Ошибка загрузки:", err);
                loadsContent.innerHTML = '<p class="text-danger">Ошибка загрузки грузов</p>';
            });
    });

    document.getElementById("weekSelect")?.addEventListener("change", function () {
        const weekValue = this.value;
        if (weekValue) {
            const [startStr, endStr] = weekValue.split(' - ');
            filterLoadsByDateRange(startStr, endStr);
            highlightWeekLoads(startStr, endStr);

            const rows = document.querySelectorAll('#driverLoadsContent tbody tr');
            rows.forEach(row => {
                const checkbox = row.querySelector('.load-checkbox');
                const deliveryStr = row.querySelector('[data-delivery-date]')?.dataset.deliveryDate.trim();
                if (!checkbox || !deliveryStr) return;

                checkbox.checked = deliveryStr >= startStr && deliveryStr <= endStr;
                checkbox.addEventListener('change', calculateAndDisplaySalary);
            });

            calculateAndDisplaySalary();

            if (selectedDriverData?._id) {
                loadFuelTransactions(selectedDriverData._id, weekValue);
                loadTollTransactions(selectedDriverData._id, weekValue);
                loadDriverCharges(selectedDriverData, weekValue); // ✅
            }
        }
    });

    createBtn.addEventListener('click', function () {
        const driverId = this.dataset.driverId;
        const weekValue = document.getElementById("weekSelect")?.value || "";
        const note = document.getElementById("note")?.value || "";
        const fuel = parseFloat(document.getElementById("fuelInput")?.value || 0) || 0;
        const tolls = parseFloat(document.getElementById("tollsInput")?.value || 0) || 0;

        const selectedLoadIds = [];
        document.querySelectorAll('.load-checkbox:checked').forEach(cb => {
            selectedLoadIds.push(cb.dataset.loadId);
        });

        const grossText = document.getElementById("salaryAmount")?.dataset.gross || "0";
        const salaryText = document.getElementById("salaryAmount")?.textContent?.replace(/[$,\s]/g, '') || "0";
        const gross = parseFloat(grossText);
        const salary = parseFloat(salaryText);

        if (!driverId || selectedLoadIds.length === 0) {
            alert("Выберите водителя и хотя бы один груз.");
            return;
        }

        const manualAdjustments = [];
            document.querySelectorAll("#manualAdjustmentsContainer > [data-idx]").forEach(block => {
              const type = block.querySelector(".adjustment-type")?.value || "deduction";
              const target = block.querySelector(".adjustment-target")?.value || "salary";
              const reason = block.querySelector(".adjustment-reason")?.value || "";
              const amount = parseFloat(block.querySelector(".adjustment-amount")?.value || 0) || 0;
              const fileInput = block.querySelector(".adjustment-file");
              const file = fileInput?.files?.[0] || null;

              manualAdjustments.push({
                type,
                target,
                reason,
                amount,
                file: null, // пока не отправляем сами файлы
                filename: file ? file.name : null
              });
            });

        fetch("/statement/create", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                driver_id: driverId,
                week: weekValue,
                note: note,
                fuel: fuel,
                tolls: tolls,
                load_ids: selectedLoadIds,
                gross: gross,
                manual_adjustments: manualAdjustments,
                salary: salary
            })
        })
        .then(res => {
            if (res.ok) {
                alert("Стейтмент успешно создан!");
                window.location.reload();
            } else {
                return res.text().then(text => { throw new Error(text) });
            }
        })
        .catch(err => {
            console.error("Ошибка при создании стейтмента:", err);
            alert("Ошибка при создании стейтмента");
        });
    });
}


function loadFuelTransactions(driverId, weekRange) {
    const block = document.getElementById("driverFuelBlock");
    const content = document.getElementById("driverFuelContent");

    if (!block || !content) return;

    fetch(`/statement/driver_fuel/${driverId}/${encodeURIComponent(weekRange)}`)
        .then(res => res.text())
        .then(html => {
            block.style.display = "block";
            content.innerHTML = html;

            const fuelCheckboxes = content.querySelectorAll(".fuel-checkbox");
            fuelCheckboxes.forEach(cb => {
                cb.addEventListener("change", updateFuelTotalFromCheckboxes);
            });

            updateFuelTotalFromCheckboxes();
        })
        .catch(err => {
            console.error("Ошибка загрузки топлива:", err);
            content.innerHTML = `<p class="text-danger">Ошибка загрузки транзакций топлива</p>`;
        });
}

function updateFuelTotalFromCheckboxes() {
    let total = 0;
    document.querySelectorAll(".fuel-checkbox:checked").forEach(cb => {
        const amount = parseFloat(cb.dataset.amount || 0);
        total += amount;
    });

    const fuelInput = document.getElementById("fuelInput");
    if (fuelInput) {
        fuelInput.value = total.toFixed(2);
        calculateAndDisplaySalary();
    }
}

function parseLoadsFromHTML(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const rows = temp.querySelectorAll("tbody tr");
    const loads = [];

    rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 5) {
            const priceText = cells[5].textContent.replace(/[$,\s]/g, '');
            loads.push({
                price: parseFloat(priceText) || 0
            });
        }
    });

    return loads;
}

function getDriverDataById(driverId) {
    const option = document.querySelector(`#driverSelect option[value="${driverId}"]`);
    if (!option || !option.dataset.driver) return null;
    try {
        return JSON.parse(option.dataset.driver);
    } catch (err) {
        console.error("Ошибка парсинга JSON из data-driver:", err);
        return null;
    }
}

function calculateAndDisplaySalary() {
    if (!selectedDriverData) return;

    const scheme = selectedDriverData.scheme_type || 'gross';
    let commissionTable = [];

    if (scheme === 'gross') {
        commissionTable = selectedDriverData.commission_table || [];
    } else if (scheme === 'net' || scheme === 'net_percent') {
        commissionTable = selectedDriverData.net_commission_table || [];
    } else if (scheme === 'net_gross') {
        commissionTable = selectedDriverData.commission_table || [];
    }

    if (!commissionTable.length) {
        document.getElementById("salaryAmount").textContent = "$0.00";
        return;
    }

    const fuel = parseFloat(document.getElementById("fuelInput")?.value || 0) || 0;
    const tolls = parseFloat(document.getElementById("tollsInput")?.value || 0) || 0;

    let gross = 0;
    document.querySelectorAll('#driverLoadsContent tbody tr').forEach(row => {
        const checkbox = row.querySelector('.load-checkbox');
        if (!checkbox || !checkbox.checked || row.style.display === 'none') return;

        const priceCell = row.querySelector('td:nth-child(6)');
        const price = parseFloat(priceCell.textContent.replace(/[$,\s]/g, '')) || 0;
        gross += price;
    });

    // 1. Ручные списания/возвраты
    let grossAdjustment = 0;
    let netAdjustment = 0;

    document.querySelectorAll("#manualAdjustmentsContainer > [data-idx]").forEach(block => {
        const type = block.querySelector(".adjustment-type")?.value || "deduction";
        const target = block.querySelector(".adjustment-target")?.value || "salary";
        const amount = parseFloat(block.querySelector(".adjustment-amount")?.value || 0) || 0;
        const sign = type === "refund" ? 1 : -1;

        if (target === "gross") {
            grossAdjustment += sign * amount;
        } else {
            netAdjustment += sign * amount;
        }
    });

    const adjustedGross = gross + grossAdjustment;
    let net = adjustedGross - fuel - tolls;

    // 2. Автоматические списания из additional_charges
    const weekValue = document.getElementById("weekSelect")?.value || "";
    let chargesTotal = 0;

    if (selectedDriverData.additional_charges && weekValue) {
        const [startStr, endStr] = weekValue.split(" - ");
        const start = new Date(startStr);
        const end = new Date(endStr);

        selectedDriverData.additional_charges.forEach(charge => {
            const period = charge.period;
            const amount = parseFloat(charge.amount || 0);
            if (!amount) return;

            if (period === "statement") {
                chargesTotal += amount;
            } else if (period === "monthly") {
                const day = parseInt(charge.day_of_month || 0);
                if (!isNaN(day) && start.getDate() <= day && day <= end.getDate()) {
                    chargesTotal += amount;
                }
            }
        });
    }

    // 3. Расчёт по комиссии
    let salary = 0;
    if (scheme === 'gross') {
        salary = applyTieredFlatCommission(commissionTable, adjustedGross);
    } else if (scheme === 'net' || scheme === 'net_percent') {
        const percent = getApplicablePercent(commissionTable, adjustedGross);
        salary = Math.max(net, 0) * (percent / 100);
    } else if (scheme === 'net_gross') {
        salary = applyTieredFlatCommission(commissionTable, adjustedGross);
    }

    salary += netAdjustment;
    salary -= chargesTotal;

    const salaryElement = document.getElementById("salaryAmount");
    salaryElement.style.display = "block";
    salaryElement.textContent = `$${salary.toFixed(2)}`;
    salaryElement.dataset.gross = adjustedGross.toFixed(2);
}


function applyTieredFlatCommission(table, amount) {
    if (!Array.isArray(table) || table.length === 0) return 0;
    const sorted = table.slice().sort((a, b) => a.from - b.from);
    let applicablePercent = sorted[0].percent;

    for (let i = 1; i < sorted.length; i++) {
        if (amount >= sorted[i].from) {
            applicablePercent = sorted[i].percent;
        } else {
            break;
        }
    }
    return amount * (applicablePercent / 100);
}

function getApplicablePercent(table, amount) {
    if (!Array.isArray(table) || table.length === 0) return 0;
    const sorted = table.slice().sort((a, b) => a.from - b.from);
    let applicablePercent = sorted[0].percent;

    for (let i = 1; i < sorted.length; i++) {
        if (amount >= sorted[i].from) {
            applicablePercent = sorted[i].percent;
        } else {
            break;
        }
    }
    return applicablePercent;
}

function openStatementModal() {
    document.getElementById('createStatementModal')?.classList.add('open');
}

function closeStatementModal() {
    document.getElementById('createStatementModal')?.classList.remove('open');
}

function applyCombinedFilter() {
    const nameInput = document.getElementById("filterDriver");
    const weekInput = document.getElementById("filterWeek");

    const nameFilter = nameInput?.value.toLowerCase().trim() || '';
    const selectedWeek = weekInput?.value || '';

    const rows = document.querySelectorAll(".card-body table tbody tr");

    rows.forEach(row => {
        const driverName = row.children[0]?.textContent?.toLowerCase() || '';
        const weekText = row.children[1]?.textContent?.trim() || '';

        const matchName = driverName.includes(nameFilter);
        const matchWeek = selectedWeek === "" || weekText === selectedWeek;

        row.style.display = (matchName && matchWeek) ? "" : "none";
    });
}

function initStatementFilter() {
    const filterInput = document.getElementById("filterDriver");
    const weekSelect = document.getElementById("filterWeek");

    if (filterInput) {
        filterInput.addEventListener("input", applyCombinedFilter);
    }

    if (weekSelect) {
        populateWeekSelect("#filterWeek");
        weekSelect.addEventListener("change", applyCombinedFilter);
    }
}

function initStatementRowClicks() {
    document.querySelectorAll("table tbody tr").forEach(row => {
        row.addEventListener("click", () => {
            const statementId = row.dataset.statementId;
            if (statementId) {
                fetch(`/statement/details/${statementId}`)
                    .then(res => res.text())
                    .then(html => {
                        const section = document.getElementById("section-statements");
                        section.innerHTML = html;
                    });
            }
        });
    });
}

function loadTollTransactions(driverId, weekRange) {
    const block = document.getElementById("driverTollsBlock");
    const content = document.getElementById("driverTollsContent");

    if (!block || !content) return;

    fetch(`/statement/driver_tolls/${driverId}/${encodeURIComponent(weekRange)}`)
        .then(res => res.text())
        .then(html => {
            block.style.display = "block";
            content.innerHTML = html;

            const checkboxes = content.querySelectorAll(".toll-checkbox");
            checkboxes.forEach(cb => {
                cb.addEventListener("change", updateTollsTotalFromCheckboxes);
            });

            updateTollsTotalFromCheckboxes();
        })
        .catch(err => {
            console.error("Ошибка загрузки толлов:", err);
            content.innerHTML = `<p class="text-danger">Ошибка загрузки толлов</p>`;
        });
}

function updateTollsTotalFromCheckboxes() {
    let total = 0;
    document.querySelectorAll(".toll-checkbox:checked").forEach(cb => {
        const amount = parseFloat(cb.dataset.amount || 0);
        total += amount;
    });

    const tollsInput = document.getElementById("tollsInput");
    if (tollsInput) {
        tollsInput.value = total.toFixed(2);
        calculateAndDisplaySalary();
    }
}

function loadDriverCharges(driver, weekRange) {
    const block = document.getElementById("driverChargesBlock");
    const content = document.getElementById("driverChargesContent");

    if (!driver || !driver.additional_charges || !block || !content || !weekRange) {
        block.style.display = "none";
        return;
    }

    const charges = driver.additional_charges;
    const [startStr, endStr] = weekRange.split(' - ');
    const start = new Date(startStr);
    const end = new Date(endStr);
    const applied = [];

    charges.forEach(charge => {
        const period = charge.period;
        const amount = parseFloat(charge.amount || 0);
        const type = charge.type || "Списание";

        if (period === "statement") {
            applied.push({ type, amount, note: "каждый стейтмент" });
        } else if (period === "monthly") {
            const day = parseInt(charge.day_of_month || 0);
            if (!isNaN(day) && day >= start.getDate() && day <= end.getDate()) {
                applied.push({ type, amount, note: `ежемесячно, ${day} число` });
            }
        }
    });

    if (!applied.length) {
        block.style.display = "none";
        return;
    }

    block.style.display = "block";
    const ul = document.createElement("ul");
    ul.className = "mb-0 pl-3";

    let total = 0;
    applied.forEach(c => {
        total += c.amount;
        const li = document.createElement("li");
        li.textContent = `${c.type} — $${c.amount.toFixed(2)} (${c.note})`;
        ul.appendChild(li);
    });

    const summary = document.createElement("p");
    summary.className = "mt-2 font-weight-bold text-danger";
    summary.textContent = `Итого списаний: $${total.toFixed(2)}`;

    content.innerHTML = '';
    content.appendChild(ul);
    content.appendChild(summary);
}

function addManualAdjustment() {
  const container = document.getElementById("manualAdjustmentsContainer");
  const idx = Date.now(); // уникальный ID
  const wrapper = document.createElement("div");
  wrapper.className = "border p-3 mb-3 rounded bg-light";
  wrapper.dataset.idx = idx;

  wrapper.innerHTML = `
    <div class="form-row mb-2">
      <div class="col-md-4">
        <label>Тип</label>
        <select class="form-control adjustment-type" onchange="toggleAdjustmentFields(${idx})">
          <option value="deduction">Списание</option>
          <option value="refund">Возврат</option>
        </select>
      </div>
      <div class="col-md-4">
        <label>Списать из</label>
        <select class="form-control adjustment-target">
          <option value="salary">из зарплаты</option>
          <option value="gross">из gross</option>
        </select>
      </div>
      <div class="col-md-4 text-right">
        <label>&nbsp;</label>
        <button class="btn btn-sm btn-outline-danger w-100" onclick="this.closest('[data-idx]').remove(); calculateAndDisplaySalary();">🗑 Удалить</button>
      </div>
    </div>
    <div class="form-row mb-2">
      <div class="col-md-6">
        <label>Причина</label>
        <input type="text" class="form-control adjustment-reason">
      </div>
      <div class="col-md-3">
        <label>Сумма</label>
        <input type="number" step="0.01" class="form-control adjustment-amount" oninput="calculateAndDisplaySalary()">
      </div>
      <div class="col-md-3">
        <label>Файл</label>
        <input type="file" class="form-control-file adjustment-file">
      </div>
    </div>
  `;

  container.appendChild(wrapper);
}

function toggleAdjustmentFields(idx) {
  // Можно будет использовать для динамического поведения, если нужно
}
