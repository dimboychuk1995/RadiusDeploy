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

async function calculateDriverStatement() {
  const driverId = document.getElementById("driverSelect").value;
  const weekRange = document.getElementById("driverWeekRangeSelect").value;
  const container = document.getElementById("driverStatementResults");

  if (!driverId || !weekRange) {
    alert("Выберите водителя и диапазон недели.");
    return;
  }

  container.innerHTML = "<p>Загрузка...</p>";

  await fetchAndRenderDriverLoads(driverId, weekRange);
  fetchDriverFuelSummary(driverId, weekRange);
  window.recalculateDriverSalary(); // 👉 вызывается всегда, даже если грузов нет
}

function fetchAndRenderDriverLoads(driverId, weekRange) {
  return fetch(`/api/driver_statement_loads?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`)
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById("driverStatementResults");

      if (!data.success || !data.loads.length) {
        container.innerHTML = "<p>Грузы не найдены</p>";
        return 0;
      }

      const totalAmount = data.loads.reduce((sum, load) => sum + (load.price || 0), 0);

      const table = document.createElement("table");
      table.className = "table table-sm table-bordered";
      table.innerHTML = `
        <thead>
          <tr>
            <th>✓</th>
            <th>Load ID</th>
            <th>Pickup</th>
            <th>Delivery</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${data.loads.map((load, index) => `
            <tr>
              <td>
                <input type="checkbox" class="load-checkbox" data-price="${load.price}" checked>
              </td>
              <td>${load.load_id}</td>
              <td>${load.pickup?.address || "—"}</td>
              <td>${load.delivery?.address || "—"}</td>
              <td>$${load.price.toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
      `;

      container.innerHTML = "";
      container.appendChild(table);

      // 👉 ВАЖНО: навешиваем обработчики после вставки
      const checkboxes = container.querySelectorAll(".load-checkbox");
      checkboxes.forEach(cb => {
        cb.addEventListener("change", recalculateDriverSalary);
      });

      return totalAmount;
    })
    .catch(err => {
      console.error("Ошибка при получении грузов:", err);
      return 0;
    });
}

function fetchDriverFuelSummary(driverId, weekRange) {
  fetch(`/api/driver_fuel_summary?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`)
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById("driverStatementResults");

      if (!data.success || !data.fuel) {
        container.insertAdjacentHTML("beforeend", "<p>Нет данных по топливу</p>");
        return;
      }

      const fuel = data.fuel;
      const fuelHtml = `
        <div class="mt-4">
          <h5>⛽ Топливо за период:</h5>
          <ul>
            <li><strong>Gallons (qty):</strong> ${fuel.qty}</li>
            <li><strong>Retail Total:</strong> $${fuel.retail}</li>
            <li><strong>Invoice Total:</strong> $${fuel.invoice}</li>
            <li><strong>Used Cards:</strong> ${fuel.cards.join(", ")}</li>
          </ul>
        </div>
      `;

      container.insertAdjacentHTML("beforeend", fuelHtml);
    })
    .catch(err => {
      console.error("Ошибка при получении дизеля:", err);
    });
}

window.recalculateDriverSalary = async function () {
  const container = document.getElementById("driverStatementResults");
  const driverId = document.getElementById("driverSelect").value;

  const checkboxes = container.querySelectorAll(".load-checkbox");
  let totalAmount = 0;

  checkboxes.forEach(cb => {
    if (cb.checked) {
      totalAmount += parseFloat(cb.dataset.price || "0");
    }
  });

  try {
    const res = await fetch(`/api/driver_commission_scheme?driver_id=${driverId}`);
    const data = await res.json();

    if (!data.success) {
      console.warn("Ошибка схемы зарплаты:", data.error);
      return;
    }

    let salary = 0;

    if (totalAmount > 0 && data.scheme_type === "percent") {
      const table = data.commission_table || [];

      if (table.length === 1) {
        salary = totalAmount * (table[0].percent / 100);
      } else {
        const matched = table
          .filter(row => totalAmount >= row.from_sum)
          .sort((a, b) => b.from_sum - a.from_sum)[0];
        if (matched) {
          salary = totalAmount * (matched.percent / 100);
        }
      }
    }

    // Удалим старый блок
    const old = container.querySelector("#driverSalaryBlock");
    if (old) old.remove();

    const html = `
      <div id="driverSalaryBlock" class="mt-4">
        <h5>💰 Зарплата водителя:</h5>
        <p><strong>Общая сумма выбранных грузов:</strong> $${totalAmount.toFixed(2)}</p>
        <p><strong>Зарплата:</strong> $${salary.toFixed(2)}</p>
      </div>
    `;

    container.insertAdjacentHTML("beforeend", html);

  } catch (err) {
    console.error("Ошибка при расчёте зарплаты:", err);
  }
}

