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

    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');
    rows.forEach(row => {
        const checkbox = row.querySelector('.load-checkbox');
        if (!checkbox || !checkbox.checked || row.style.display === 'none') return;

        const priceCell = row.querySelector('td:nth-child(6)');
        if (!priceCell) return;

        const price = parseFloat(priceCell.textContent.replace(/[$,\s]/g, '')) || 0;
        gross += price;
    });

    const net = gross - fuel - tolls;
    let salary = 0;

    if (scheme === 'gross') {
        salary = applyTieredFlatCommission(commissionTable, gross);
    } else if (scheme === 'net' || scheme === 'net_percent') {
        const percent = getApplicablePercent(commissionTable, gross);
        salary = Math.max(net, 0) * (percent / 100);
    } else if (scheme === 'net_gross') {
        salary = applyTieredFlatCommission(commissionTable, gross);
    }

    const salaryElement = document.getElementById("salaryAmount");
    salaryElement.style.display = "block";
    salaryElement.textContent = `$${salary.toFixed(2)}`;
    salaryElement.dataset.gross = gross.toFixed(2);
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