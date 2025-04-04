let selectedDriverData = null;
let selectedLoads = [];

function initStatementEvents() {
    console.log('initStatementEvents (Select2 version)');

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

        fetch(`/statement/driver_loads/${driverId}`)
            .then(res => res.text())
            .then(html => {
                loadsBlock.style.display = 'block';
                loadsContent.innerHTML = html;

                selectedDriverData = getDriverDataById(driverId);
                selectedLoads = parseLoadsFromHTML(html);
                calculateAndDisplaySalary();
            })
            .catch(err => {
                console.error("Ошибка загрузки:", err);
                loadsContent.innerHTML = '<p class="text-danger">Ошибка загрузки грузов</p>';
            });

        // Перерасчёт при ручном вводе
        document.getElementById("fuelInput").addEventListener('input', calculateAndDisplaySalary);
        document.getElementById("tollsInput").addEventListener('input', calculateAndDisplaySalary);
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
            loads.push({
                price: parseFloat(cells[4].textContent.replace('$', '')) || 0
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
    if (!selectedDriverData || !selectedLoads.length) {
        console.warn('Нет данных для расчёта — либо водитель не выбран, либо нет грузов');
        return;
    }

    const scheme = selectedDriverData.scheme_type || 'gross';
    const commissionTable = scheme === 'gross'
        ? selectedDriverData.commission_table || []
        : selectedDriverData.net_commission_table || [];

    const fuel = parseFloat(document.getElementById("fuelInput")?.value || 0);
    const tolls = parseFloat(document.getElementById("tollsInput")?.value || 0);

    const gross = selectedLoads.reduce((sum, load) => sum + (load.price || 0), 0);
    const net = gross - fuel - tolls;
    const base = scheme === 'gross' ? gross : (net > 0 ? net : 0);
    const salary = applyTieredFlatCommission(commissionTable, base);

    // 🔍 ЛОГИ
    console.log("Driver:", selectedDriverData);
    console.log("Loads:", selectedLoads);
    console.log("Gross:", gross);
    console.log("Fuel:", fuel, "Tolls:", tolls);
    console.log("Net:", net);
    console.log("Commission table:", commissionTable);
    console.log("Base for calc:", base);
    console.log("Salary result:", salary);

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
