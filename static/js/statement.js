function initStatementEvents() {
  generateWeekRanges("statementWeekRangeSelect");
}

function openDriverStatementModal() {
  document.getElementById("driverStatementModal").classList.add("show");
  document.getElementById("driverStatementBackdrop").classList.add("show");

  generateWeekRanges("driverWeekRangeSelect");
}

function closeDriverStatementModal() {
  document.getElementById("driverStatementModal").classList.remove("show");
  document.getElementById("driverStatementBackdrop").classList.remove("show");
}

function calculateDriverStatement() {
  const driverId = document.getElementById("driverSelect").value;
  const weekRange = document.getElementById("driverWeekRangeSelect").value;

  if (!driverId || !weekRange) {
    alert("Выберите водителя и диапазон недели.");
    return;
  }

  fetch(`/api/driver_statement_loads?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`)
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById("driverStatementResults");
      container.innerHTML = "";

      if (!data.success || !data.loads.length) {
        container.innerHTML = "<p>Грузы не найдены</p>";
        return;
      }

      const table = document.createElement("table");
      table.className = "table table-sm table-bordered";
      table.innerHTML = `
        <thead><tr>
          <th>Load ID</th>
          <th>Pickup</th>
          <th>Delivery</th>
          <th>Price</th>
        </tr></thead>
        <tbody>
          ${data.loads.map(load => `
            <tr>
              <td>${load.load_id}</td>
              <td>${load.pickup?.address || "—"}</td>
              <td>${load.delivery?.address || "—"}</td>
              <td>$${load.price.toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
      `;

      container.appendChild(table);
    })
    .catch(err => {
      console.error("Ошибка при получении грузов:", err);
    });
}
