async function initLoadStats() {
    console.log("📊 Статистика по грузам загружается");

    document.getElementById("filterStats").addEventListener("click", async () => {
        const startDate = document.getElementById("startDate").value;
        const endDate = document.getElementById("endDate").value;
        const driverId = document.getElementById("driverSelect").value;

        const res = await fetch(`/api/load_stats?start=${startDate}&end=${endDate}&driver=${driverId}`);
        const data = await res.json();

        const tbody = document.querySelector("#loadStatsTable tbody");
        tbody.innerHTML = "";

        data.forEach(row => {
            tbody.innerHTML += `
                <tr>
                    <td>${row.driver_name}</td>
                    <td>${row.load_count}</td>
                    <td>${row.total_price.toFixed(2)}</td>
                    <td>${row.avg_rpm.toFixed(2)}</td>
                </tr>
            `;
        });
    });
}
