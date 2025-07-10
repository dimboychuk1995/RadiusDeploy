function toggleStatsBlock(el) {
    el.classList.toggle("active");

    const isGeneralBlock = el.innerText.includes("1️⃣");
    const isDriverBlock = el.innerText.includes("2️⃣");
    const isBrokerBlock = el.innerText.includes("3️⃣");

    if (isGeneralBlock && el.classList.contains("active")) {
        document.getElementById("generalStatsSection").style.display = "block";
        loadGeneralStats();
    } else if (isGeneralBlock) {
        document.getElementById("generalStatsSection").style.display = "none";
    }

    if (isDriverBlock && el.classList.contains("active")) {
        document.getElementById("driverStatsSection").style.display = "block";
        document.getElementById("driverChartSection").style.display = "block";
        document.getElementById("driverComparisonSection").style.display = "block"; // 👈 показать сравнение
        loadDriverStats();
    } else if (isDriverBlock) {
        document.getElementById("driverStatsSection").style.display = "none";
        document.getElementById("driverChartSection").style.display = "none";
        document.getElementById("driverComparisonSection").style.display = "none";
    }

    if (isBrokerBlock && el.classList.contains("active")) {
        document.getElementById("brokerStatsSection").style.display = "block";
        loadBrokerStats();
    } else if (isBrokerBlock) {
        document.getElementById("brokerStatsSection").style.display = "none";
    }
}

async function loadGeneralStats() {
    console.log("⚡ loadGeneralStats вызвана");

    try {
        const res = await fetch("/api/load_stats/general");
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log("📦 JSON данные:", data);

        // ⏬ Сохраняем все грузы глобально
        window.lastGeneralLoads = data.loads;

        // Заполнение сводки
        document.getElementById("totalLoads").textContent = data.total_loads;
        document.getElementById("totalAmount").textContent = `$${data.total_amount.toFixed(2)}`;
        document.getElementById("totalMiles").textContent = data.total_miles.toFixed(2);
        document.getElementById("avgRPM").textContent = data.avg_rpm.toFixed(2);
        document.getElementById("avgMiles").textContent = data.avg_miles.toFixed(2);
        document.getElementById("avgPrice").textContent = `$${data.avg_price.toFixed(2)}`;

        // Отрисовка таблицы грузов
        const tbody = document.querySelector("#statLoadsTable tbody");
        tbody.innerHTML = "";

        data.loads.forEach(load => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${load.load_id || ""}</td>
                <td>${load.broker || ""}</td>
                <td>${load.pickup || ""}</td>
                <td>${load.delivery || ""}</td>
                <td>${load.pickup_date || ""}</td>
                <td>${load.delivery_date || ""}</td>
                <td>${load.miles || ""}</td>
                <td>${load.rpm || ""}</td>
                <td>${load.driver || ""}</td>
                <td>${load.dispatch || ""}</td>
            `;
            tbody.appendChild(row);
        });

        // 📊 График по неделям
        const weeklyBuckets = getWeeklyBucketsImproved(data.loads);
        const sortedWeeks = Object.keys(weeklyBuckets).sort();

        const labels = [];
        const values = [];

        sortedWeeks.forEach(weekStart => {
            const item = weeklyBuckets[weekStart];
            labels.push(weekStart);
            values.push(item.count); // можно заменить на item.total, item.miles, item.miles / item.total и т.д.
        });

        renderWeeklyChart(labels, weeklyBuckets);

    } catch (err) {
        console.error("❌ Ошибка загрузки общей статистики:", err);
    }
}

async function loadDriverStats() {
    try {
        const res = await fetch("/api/load_stats/by_driver");
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        window.driverStatsData = data; // 👈 сохраняем для графика

        const tbody = document.querySelector("#driverStatsTable tbody");
        tbody.innerHTML = "";

        const select = document.getElementById("driverChartSelect");
        select.innerHTML = `<option value="">— Не выбран —</option>`;

        data.forEach((stat, index) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${stat.driver}</td>
                <td>${stat.count}</td>
                <td>$${stat.total.toFixed(2)}</td>
                <td>${stat.rpm.toFixed(2)}</td>
                <td>${stat.avg_miles.toFixed(2)}</td>
                <td>$${stat.avg_price.toFixed(2)}</td>
            `;
            tbody.appendChild(row);

            const option = document.createElement("option");
            option.value = index;
            option.textContent = stat.driver;
            select.appendChild(option);
        });

        // при выборе водителя — отрисовать график
        select.addEventListener("change", () => {
            const selectedIndex = select.value;
            if (selectedIndex === "") {
                renderDriverChart([], []);
            } else {
                const selected = data[selectedIndex];
                drawDriverStatChart(selected);
            }
        });

    } catch (err) {
        console.error("❌ Ошибка загрузки по водителям:", err);
    }
}


async function loadBrokerStats() {
    try {
        const res = await fetch("/api/load_stats/by_broker");
        const data = await res.json();

        const tbody = document.querySelector("#brokerStatsTable tbody");
        tbody.innerHTML = "";

        data.forEach(entry => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${entry.name}</td>
                <td>${entry.count}</td>
                <td>$${entry.total.toFixed(2)}</td>
                <td>${entry.total_miles.toFixed(2)}</td>
                <td>${entry.avg_miles.toFixed(2)}</td>
                <td>${entry.rpm.toFixed(2)}</td>
                <td>$${entry.avg_price.toFixed(2)}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error("❌ Ошибка загрузки по брокерам:", err);
    }
}


function getWeeklyBucketsImproved(loads) {
    const buckets = {};

    loads.forEach(load => {
        const deliveryDateStr = load.delivery_date;
        if (!deliveryDateStr) return;

        const date = new Date(deliveryDateStr);
        const weekStart = getMonday(date);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const weekLabel = `${formatDateMMDDYYYY(weekStart)} - ${formatDateMMDDYYYY(weekEnd)}`;

        if (!buckets[weekLabel]) {
            buckets[weekLabel] = {
                count: 0,
                total: 0,
                miles: 0
            };
        }

        const price = parseFloat(load.price || 0);
        const miles = parseFloat(load.miles || load.total_miles || 0);

        buckets[weekLabel].count += 1;
        buckets[weekLabel].total += price;
        buckets[weekLabel].miles += miles;
    });

    return buckets;
}



function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Пн = 1, Вс = 0
    return new Date(d.setDate(diff));
}

function formatDateMMDDYYYY(date) {
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

let weeklyChartInstance = null;


function renderWeeklyChart(labels, weeklyBuckets) {
    const ctx = document.getElementById('weeklyStatsChart').getContext('2d');

    if (weeklyChartInstance) {
        weeklyChartInstance.destroy();
    }

    const counts = [];
    const totals = [];
    const miles = [];
    const rpms = [];
    const avgMiles = [];
    const avgPrices = [];

    labels.forEach(label => {
        const bucket = weeklyBuckets[label];
        const count = bucket.count || 1; // чтобы не делить на 0

        counts.push(bucket.count);
        totals.push(+bucket.total.toFixed(2));
        miles.push(+bucket.miles.toFixed(2));

        const rpm = bucket.total > 0 ? (bucket.miles / bucket.total) : 0;
        rpms.push(+rpm.toFixed(2));

        avgMiles.push(+(bucket.miles / count).toFixed(2));
        avgPrices.push(+(bucket.total / count).toFixed(2));
    });

    weeklyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '📦 Грузы',
                    data: counts,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    yAxisID: 'y-loads'
                },
                {
                    label: '💵 Сумма',
                    data: totals,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    yAxisID: 'y-total'
                },
                {
                    label: '📏 Мили',
                    data: miles,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    yAxisID: 'y-miles'
                },
                {
                    label: '⚖️ RPM',
                    data: rpms,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    yAxisID: 'y-rpm'
                },
                {
                    label: '📉 Средние мили',
                    data: avgMiles,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderDash: [5, 5],
                    tension: 0.4,
                    yAxisID: 'y-avg-miles'
                },
                {
                    label: '💲 Средняя цена',
                    data: avgPrices,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderDash: [5, 5],
                    tension: 0.4,
                    yAxisID: 'y-avg-price'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: '📈 Динамика по неделям (6 показателей)'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Недели'
                    }
                },
                'y-loads': {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Грузы'
                    },
                    beginAtZero: true
                },
                'y-total': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Сумма'
                    },
                    grid: { drawOnChartArea: false }
                },
                'y-miles': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Мили'
                    },
                    grid: { drawOnChartArea: false }
                },
                'y-rpm': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'RPM'
                    },
                    grid: { drawOnChartArea: false },
                    min: 0,
                    suggestedMax: 3
                },
                'y-avg-miles': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Средние мили'
                    },
                    grid: { drawOnChartArea: false }
                },
                'y-avg-price': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Средняя цена'
                    },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function addRangeRow() {
    const container = document.getElementById("rangeComparisonContainer");
    const div = document.createElement("div");
    div.className = "d-flex align-items-center gap-2 range-row";
    div.innerHTML = `
        <input type="date" class="form-control" style="max-width: 200px;">
        <span>—</span>
        <input type="date" class="form-control" style="max-width: 200px;">
        <button class="btn btn-outline-danger" onclick="removeRangeRow(this)">✖</button>
    `;
    container.appendChild(div);
}
function removeRangeRow(btn) {
    btn.parentElement.remove();
}

function calculateRangeComparison() {
    const rows = document.querySelectorAll("#rangeComparisonContainer .range-row");
    const tbody = document.querySelector("#rangeComparisonResult tbody");
    tbody.innerHTML = "";

    const loads = window.lastGeneralLoads || []; // сохраняй data.loads сюда в loadGeneralStats()

    rows.forEach(row => {
        const inputs = row.querySelectorAll("input");
        const start = new Date(inputs[0].value);
        const end = new Date(inputs[1].value);
        if (!inputs[0].value || !inputs[1].value) return;

        const filtered = loads.filter(load => {
            const d = new Date(load.delivery_date);
            return d >= start && d <= end;
        });

        const count = filtered.length;
        const total = filtered.reduce((sum, l) => sum + parseFloat(l.price || 0), 0);
        const miles = filtered.reduce((sum, l) => sum + parseFloat(l.miles || l.total_miles || 0), 0);
        const rpm = total > 0 ? miles / total : 0;
        const avgPrice = count > 0 ? total / count : 0;
        const avgMiles = count > 0 ? miles / count : 0;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${inputs[0].value} – ${inputs[1].value}</td>
            <td>${count}</td>
            <td>$${total.toFixed(2)}</td>
            <td>${miles.toFixed(2)}</td>
            <td>${rpm.toFixed(2)}</td>
            <td>$${avgPrice.toFixed(2)}</td>
            <td>${avgMiles.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById("rangeComparisonResult").style.display = "block";
}

let driverChartInstance = null;

function renderDriverChart(labels, weeklyBuckets) {
    const ctx = document.getElementById('driverStatsChart').getContext('2d');

    if (driverChartInstance) {
        driverChartInstance.destroy();
    }

    const counts = [];
    const totals = [];
    const miles = [];
    const rpms = [];
    const avgMiles = [];
    const avgPrices = [];

    labels.forEach(label => {
        const bucket = weeklyBuckets[label];

        if (!bucket) {
            // Если данных по неделе нет — заполняем нулями
            counts.push(0);
            totals.push(0);
            miles.push(0);
            rpms.push(0);
            avgMiles.push(0);
            avgPrices.push(0);
            return;
        }

        const count = bucket.count || 1;

        counts.push(bucket.count);
        totals.push(+bucket.total.toFixed(2));
        miles.push(+bucket.miles.toFixed(2));

        const rpm = bucket.total > 0 ? (bucket.miles / bucket.total) : 0;
        rpms.push(+rpm.toFixed(2));

        avgMiles.push(+(bucket.miles / count).toFixed(2));
        avgPrices.push(+(bucket.total / count).toFixed(2));
    });

    driverChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '📦 Грузы',
                    data: counts,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    yAxisID: 'y-loads'
                },
                {
                    label: '💵 Сумма',
                    data: totals,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    yAxisID: 'y-total'
                },
                {
                    label: '📏 Мили',
                    data: miles,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    yAxisID: 'y-miles'
                },
                {
                    label: '⚖️ RPM',
                    data: rpms,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    yAxisID: 'y-rpm'
                },
                {
                    label: '📉 Средние мили',
                    data: avgMiles,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderDash: [5, 5],
                    tension: 0.4,
                    yAxisID: 'y-avg-miles'
                },
                {
                    label: '💲 Средняя цена',
                    data: avgPrices,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderDash: [5, 5],
                    tension: 0.4,
                    yAxisID: 'y-avg-price'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: '📈 Показатели по выбранному водителю (недели)'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Недели'
                    }
                },
                'y-loads': {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Грузы'
                    },
                    beginAtZero: true
                },
                'y-total': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Сумма'
                    },
                    grid: { drawOnChartArea: false }
                },
                'y-miles': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Мили'
                    },
                    grid: { drawOnChartArea: false }
                },
                'y-rpm': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'RPM'
                    },
                    grid: { drawOnChartArea: false },
                    min: 0,
                    suggestedMax: 3
                },
                'y-avg-miles': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Средние мили'
                    },
                    grid: { drawOnChartArea: false }
                },
                'y-avg-price': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Средняя цена'
                    },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}



function drawDriverStatChart(stat) {
    const loads = window.lastGeneralLoads || [];
    const driverId = String(stat.driver_id || "").trim();

    const weeklyBuckets = getDriverWeeklyStats(loads, driverId);
    const sortedWeeks = Object.keys(weeklyBuckets).sort();

    const labels = [];
    const counts = [];
    const totals = [];
    const miles = [];
    const rpms = [];
    const avgMiles = [];
    const avgPrices = [];

    sortedWeeks.forEach(label => {
        const bucket = weeklyBuckets[label];
        const count = bucket.count || 1;
        const total = bucket.total;
        const mile = bucket.miles;

        labels.push(label);
        counts.push(count);
        totals.push(+total.toFixed(2));
        miles.push(+mile.toFixed(2));

        const rpm = total > 0 ? mile / total : 0;
        rpms.push(+rpm.toFixed(2));
        avgMiles.push(+(mile / count).toFixed(2));
        avgPrices.push(+(total / count).toFixed(2));
    });

    renderDriverChart(labels, {
        ...Object.fromEntries(labels.map((label, i) => [label, {
            count: counts[i],
            total: totals[i],
            miles: miles[i],
            rpm: rpms[i],
            avg_miles: avgMiles[i],
            avg_price: avgPrices[i]
        }]))
    });
}


function getDriverWeeklyStats(loads, driverId) {
    const buckets = {};
    const normalized = String(driverId).trim();

    console.log("🔍 Фильтруем по driver_id:", normalized);

    loads.forEach(load => {
        const loadDriverId = String(load.driver_id || "").trim();
        if (loadDriverId !== normalized) return;

        const deliveryDateStr = load.delivery_date;
        if (!deliveryDateStr) return;

        const date = new Date(deliveryDateStr);
        if (isNaN(date)) return;

        const weekStart = getMonday(date);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekLabel = `${formatDateMMDDYYYY(weekStart)} - ${formatDateMMDDYYYY(weekEnd)}`;

        if (!buckets[weekLabel]) {
            buckets[weekLabel] = {
                count: 0,
                total: 0,
                miles: 0
            };
        }

        const price = parseFloat(load.price || 0);
        const miles = parseFloat(load.miles || load.total_miles || 0);

        buckets[weekLabel].count += 1;
        buckets[weekLabel].total += price;
        buckets[weekLabel].miles += miles;
    });

    console.log("📦 Итог по driver_id:", driverId, buckets);
    return buckets;
}

// ✅ Добавь это в конец load_stats.js

let compareDriverIndex = 0;

function addDriverCompare() {
    const container = document.getElementById("driverCompareContainer");
    const div = document.createElement("div");
    div.className = "d-flex align-items-center gap-2 mb-2";
    div.dataset.index = compareDriverIndex;

    const select = document.createElement("select");
    select.className = "form-select";
    select.style.maxWidth = "250px";

    // Заполняем список водителей
    const stats = window.driverStatsData || [];
    stats.forEach((stat, index) => {
        const option = document.createElement("option");
        option.value = stat.driver_id || stat.driver || index; // 👈 предпочтительно использовать ID
        option.textContent = stat.driver;
        select.appendChild(option);
    });

    select.addEventListener("change", calculateDriverComparison);

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-outline-danger";
    removeBtn.innerHTML = "✖";
    removeBtn.onclick = () => {
        div.remove();
        calculateDriverComparison();
    };

    div.appendChild(select);
    div.appendChild(removeBtn);
    container.appendChild(div);

    compareDriverIndex++;
    calculateDriverComparison();
}

function calculateDriverComparison() {
    const stats = window.driverStatsData || [];
    const selectedDrivers = [];

    const selects = document.querySelectorAll("#driverCompareContainer select");
    selects.forEach(select => {
        const value = select.value;
        const match = stats.find(s => (s.driver_id || s.driver) === value);
        if (match) selectedDrivers.push(match);
    });

    const tbody = document.getElementById("driverCompareTableBody");
    tbody.innerHTML = "";

    selectedDrivers.forEach(stat => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${stat.driver}</td>
            <td>${stat.count}</td>
            <td>$${stat.total.toFixed(2)}</td>
            <td>${stat.miles.toFixed(2)}</td>
            <td>${stat.rpm.toFixed(2)}</td>
            <td>$${stat.avg_price.toFixed(2)}</td>
            <td>${stat.avg_miles.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}
