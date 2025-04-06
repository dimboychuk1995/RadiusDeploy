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
            document.getElementById("salaryResult").style.display = "none";
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
                    const [startStr, endStr] = weekValue.split('_');
                    filterLoadsByDateRange(startStr, endStr);
                    highlightWeekLoads(startStr, endStr);

                    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');
                    rows.forEach(row => {
                        const checkbox = row.querySelector('.load-checkbox');
                        const deliveryCell = row.querySelector('[data-delivery-date]');
                        if (!checkbox || !deliveryCell) return;

                        const deliveryStr = deliveryCell.dataset.deliveryDate.trim();
                        checkbox.checked = deliveryStr >= startStr && deliveryStr <= endStr;

                        // слушатель на каждый чекбокс
                        checkbox.addEventListener('change', calculateAndDisplaySalary);
                    });

                    // 💡 вызываем пересчёт ПОСЛЕ установки чекбоксов
                    calculateAndDisplaySalary();
                }
            })
            .catch(err => {
                console.error("Ошибка загрузки:", err);
                loadsContent.innerHTML = '<p class="text-danger">Ошибка загрузки грузов</p>';
            });

        document.getElementById("fuelInput")?.addEventListener('input', calculateAndDisplaySalary);
        document.getElementById("tollsInput")?.addEventListener('input', calculateAndDisplaySalary);
        document.getElementById("startDate")?.addEventListener('change', calculateAndDisplaySalary);
        document.getElementById("endDate")?.addEventListener('change', calculateAndDisplaySalary);
    });

    document.getElementById("weekSelect")?.addEventListener("change", function () {
        const weekValue = this.value;
        if (weekValue) {
            const [startStr, endStr] = weekValue.split('_');
            filterLoadsByDateRange(startStr, endStr);
            highlightWeekLoads(startStr, endStr);

            const rows = document.querySelectorAll('#driverLoadsContent tbody tr');
            rows.forEach(row => {
                const checkbox = row.querySelector('.load-checkbox');
                const deliveryCell = row.querySelector('[data-delivery-date]');
                if (!checkbox || !deliveryCell) return;

                const deliveryStr = deliveryCell.dataset.deliveryDate.trim();
                checkbox.checked = deliveryStr >= startStr && deliveryStr <= endStr;

                checkbox.addEventListener('change', calculateAndDisplaySalary);
            });

            calculateAndDisplaySalary();
        }
    });
}

function parseLoadsFromHTML(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const rows = temp.querySelectorAll("tbody tr");
    const loads = [];

    rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 5) {
            const priceText = cells[4].textContent.replace(/[$,\s]/g, '');
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
        console.warn('Схема net_gross: используем commission_table как fallback');
    }

    if (!commissionTable.length) {
        console.warn('Комиссионная таблица пуста');
        document.getElementById("salaryAmount").textContent = "$0.00";
        return;
    }

    const fuel = parseFloat(document.getElementById("fuelInput")?.value || 0) || 0;
    const tolls = parseFloat(document.getElementById("tollsInput")?.value || 0) || 0;

    let gross = 0;

    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');
    rows.forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
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

    document.getElementById("salaryResult").style.display = "block";
    document.getElementById("salaryAmount").textContent = `$${salary.toFixed(2)}`;
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

document.addEventListener('DOMContentLoaded', initStatementEvents);

function openStatementModal() {
    document.getElementById('createStatementModal')?.classList.add('open');
}

function closeStatementModal() {
    document.getElementById('createStatementModal')?.classList.remove('open');
}
