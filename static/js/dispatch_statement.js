function initStatementDispatcherEvents() {
  // сюда только вызовы других функций, если появятся
}

function openDispatcherPayrollModal() {
    document.getElementById("dispatcherPayrollModal").classList.add("show");
    document.getElementById("dispatcherPayrollBackdrop").classList.add("show");

    generateWeekRanges("weekRangeSelect");
}

function closeDispatcherPayrollModal() {
    document.getElementById("dispatcherPayrollModal").classList.remove("show");
    document.getElementById("dispatcherPayrollBackdrop").classList.remove("show");
}

// Очень важный метод генерации недель
function generateWeekRanges(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = "";

  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const baseMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);

  const mmdd = d => String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + "/" + d.getFullYear();

  for (let i = 0; i < 10; i++) {
    const monday = new Date(baseMonday);
    monday.setDate(monday.getDate() - i * 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const label = `${mmdd(monday)} - ${mmdd(sunday)}`;

    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    select.appendChild(option);
  }
}


function calculateDispatcherPayroll() {
  const dispatcherId = document.getElementById("dispatcherSelect").value;
  const weekRange = document.getElementById("weekRangeSelect").value;

  fetch("/api/calculate_dispatcher_payroll", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ dispatcher_id: dispatcherId, week_range: weekRange })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        renderDispatcherPayrollResult(data);
      } else {
        alert("Ошибка: " + (data.error || "Неизвестная"));
      }
    });
}

function renderDispatcherPayrollResult(data) {
  const resultsDiv = document.getElementById("dispatcherPayrollResults");

  resultsDiv.dataset.salaryType = data.salary_type;
  resultsDiv.dataset.salaryPercent = data.salary_percent || 0;
  resultsDiv.dataset.salaryFixed = data.salary_fixed || 0;
  resultsDiv.dataset.salaryPerDriver = data.salary_per_driver || 0;

  const summaryContainerId = "dispatcherPayrollSummary";

  const summaryHtml = `
    <hr />
    <div id="${summaryContainerId}" class="mt-3"></div>
  `;

  const renderLoadRow = (l, index, driverName) => `
    <tr data-driver="${driverName}">
      <td>
        <input type="checkbox" class="payroll-load-checkbox" data-price="${l.price}" data-driver="${driverName}" checked onchange="recalculateDispatcherTotals()">
        <span class="ms-2">${l.load_id}</span>
      </td>
      <td>${l.company_name}</td>
      <td>${l.RPM || "—"}</td>
      <td>$${l.price}</td>
      <td>
        <div><strong>${l.pickup_date}</strong></div>
        <div>${l.pickup_address || "—"}</div>
      </td>
      <td>
        <div><strong>${l.delivery_date}</strong></div>
        <div>${l.delivery_address || "—"}</div>
      </td>
      <td>${Array.isArray(l.extra_stops) && l.extra_stops.length > 0
        ? l.extra_stops.map((s, i) => `<div><strong>Stop ${i + 1}:</strong> ${s.address || ""}</div>`).join("")
        : "—"
      }</td>
    </tr>
  `;

  const renderTable = (driverName, loads) => {
    const total = loads.reduce((sum, l) => sum + (l.price || 0), 0);
    return `
      <div class="mt-4 payroll-driver-block" data-driver="${driverName}">
        <h6 class="mb-2">
          Водитель: <span class="text-primary">${driverName}</span>
          <span class="text-muted driver-total" data-driver="${driverName}">(${loads.length} грузов, $${total.toFixed(2)})</span>
        </h6>
        <div class="table-responsive" style="max-height: 350px; overflow-y: auto;">
          <table class="table table-sm table-bordered align-middle text-nowrap">
            <thead class="table-light">
              <tr>
                <th>ID</th>
                <th>Компания</th>
                <th>RPM</th>
                <th>Цена</th>
                <th>Пикап</th>
                <th>Доставка</th>
                <th>Extra Stops</th>
              </tr>
            </thead>
            <tbody>
              ${loads.map((l, idx) => renderLoadRow(l, idx, driverName)).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  const groupedHtml = Object.entries(data.driver_groups)
    .map(([driverName, loads]) => renderTable(driverName, loads))
    .join("");

  const noDriverHtml = data.no_driver.length > 0
    ? renderTable("Нет водителя", data.no_driver)
    : "";

  resultsDiv.innerHTML = summaryHtml + groupedHtml + noDriverHtml;

  // Сохраняем исходные данные в глобальную переменную
  window._dispatcherPayrollData = data;

  // Вызываем пересчёт сразу
  recalculateDispatcherTotals();
}

function recalculateDispatcherTotals() {
  const checkboxes = document.querySelectorAll(".payroll-load-checkbox:checked");

  let totalGross = 0;
  const driverTotals = {};

  checkboxes.forEach(cb => {
    const price = parseFloat(cb.dataset.price || 0);
    const driver = cb.dataset.driver || "Нет водителя";

    totalGross += price;
    if (!driverTotals[driver]) driverTotals[driver] = 0;
    driverTotals[driver] += price;
  });

  // Обновляем суммы по каждому водителю
  document.querySelectorAll(".driver-total").forEach(span => {
    const driver = span.dataset.driver;
    const sum = driverTotals[driver] || 0;
    const count = document.querySelectorAll(`.payroll-load-checkbox[data-driver="${driver}"]:checked`).length;
    span.innerHTML = `(${count} грузов, $${sum.toFixed(2)})`;
  });

  // Обновляем общую зарплату
  const container = document.getElementById("dispatcherPayrollSummary");
  const data = window._dispatcherPayrollData;
  const uniqueDrivers = Object.keys(driverTotals).filter(d => d !== "Нет водителя").length;

  let salary = 0;
  if (data.salary_type === "percent") {
    salary = totalGross * (data.salary_percent / 100);
  } else if (data.salary_type === "fixed_plus_percent") {
    salary = totalGross * (data.salary_percent / 100) + data.salary_fixed;
  } else if (data.salary_type === "per_driver_plus_percent") {
    salary = totalGross * (data.salary_percent / 100) + uniqueDrivers * data.salary_per_driver;
  }

  container.innerHTML = `
    <h6>Обновлено после выбора:</h6>
    <p><strong>Сумма по выбранным грузам:</strong> $${totalGross.toFixed(2)}</p>
    <p><strong>Выбранных водителей:</strong> ${uniqueDrivers}</p>
    <p><strong>Зарплата диспетчера:</strong> <span class="text-success fw-bold">$${salary.toFixed(2)}</span></p>
  `;
}
