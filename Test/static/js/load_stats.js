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
        loadDriverStats();
    } else if (isDriverBlock) {
        document.getElementById("driverStatsSection").style.display = "none";
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
        console.log("🛰️ Ответ получен:", res);

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log("📦 JSON данные:", data);

        document.getElementById("totalLoads").textContent = data.total_loads;
        document.getElementById("totalAmount").textContent = `$${data.total_amount.toFixed(2)}`;
        document.getElementById("totalMiles").textContent = data.total_miles.toFixed(2);
        document.getElementById("avgRPM").textContent = data.avg_rpm.toFixed(2);
        document.getElementById("avgMiles").textContent = data.avg_miles.toFixed(2);
        document.getElementById("avgPrice").textContent = `$${data.avg_price.toFixed(2)}`;

        // 🧾 Отрисовка таблицы грузов
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
        const tbody = document.querySelector("#driverStatsTable tbody");
        tbody.innerHTML = "";

        data.forEach(stat => {
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

let weeklyChartInstance = null;

function renderEmptyWeeklyChart() {
    const ctx = document.getElementById('weeklyStatsChart').getContext('2d');

    if (weeklyChartInstance) {
        weeklyChartInstance.destroy(); // уничтожаем предыдущий экземпляр
    }

    weeklyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // недели появятся позже
            datasets: [
                {
                    label: 'Грузы',
                    data: [],
                    tension: 0.3,
                    borderWidth: 2,
                    fill: false,
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Динамика грузов по неделям'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Недели'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Значение'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}