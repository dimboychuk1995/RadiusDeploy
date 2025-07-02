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

  const summaryHtml = `
    <hr />
    <div class="mt-3">
      <h6>Период: ${data.period_start} — ${data.period_end}</h6>
      <p><strong>Сумма по грузам:</strong> $${data.total_price}</p>
      <p><strong>Тип расчета:</strong> ${data.salary_type}</p>
      <p><strong>Уникальных водителей:</strong> ${data.unique_drivers}</p>
      <p><strong>Зарплата диспетчера:</strong> <span class="text-success fw-bold">$${data.dispatcher_salary}</span></p>
    </div>
  `;

  const loadsRows = data.loads_list.map(l => `
    <tr>
      <td>${l.load_id}</td>
      <td>${l.company_name}</td>
      <td>${l.RPM || "—"}</td>
      <td>$${l.price}</td>
      <td>${l.driver_name || '<span class="text-danger">Нет</span>'}</td>
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
  `).join("");

  const loadsTable = `
    <div class="mt-4">
      <h6>Грузы:</h6>
      <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
        <table class="table table-sm table-bordered align-middle text-nowrap">
          <thead class="table-light">
            <tr>
              <th>ID</th>
              <th>Компания</th>
              <th>RPM</th>
              <th>Цена</th>
              <th>Водитель</th>
              <th>Пикап</th>
              <th>Доставка</th>
              <th>Extra Stops</th>
            </tr>
          </thead>
          <tbody>
            ${loadsRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  resultsDiv.innerHTML = summaryHtml + loadsTable;
}
