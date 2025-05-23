function toggleStatsBlock(el) {
    el.classList.toggle("active");

    // если это первый блок — "Общая статистика"
    const isGeneralBlock = el.innerText.includes("1️⃣");

    if (isGeneralBlock && el.classList.contains("active")) {
        document.getElementById("generalStatsSection").style.display = "block";
        loadGeneralStats();
    } else if (isGeneralBlock) {
        document.getElementById("generalStatsSection").style.display = "none";
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
