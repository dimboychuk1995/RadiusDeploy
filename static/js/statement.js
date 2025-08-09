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
  fetchDriverInspections(driverId, weekRange);
  fetchDriverExpenses(driverId, weekRange);
  window.recalculateDriverSalary();
}

function fetchAndRenderDriverLoads(driverId, weekRange) {
  return fetch(`/api/driver_statement_loads?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`)
    .then(res => res.json())
    .then(data => {
      console.log("📦 Грузы:", data);
      const container = document.getElementById("driverStatementResults");

      if (!data.success || !data.loads.length) {
        container.innerHTML = "<p>Грузы не найдены</p>";
        return 0;
      }

      const toDateOnly = (val) => {
        if (!val) return "—";
        const d = new Date(val);
        if (isNaN(d)) return "—";
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      };

      const getEffectiveDeliveryDate = (load) => {
        // если extra_delivery массив — берём последнюю дату
        if (Array.isArray(load.extra_delivery) && load.extra_delivery.length) {
          const last = load.extra_delivery[load.extra_delivery.length - 1];
          return last?.date || null;
        }
        // если extra_delivery один объект
        if (load.extra_delivery && typeof load.extra_delivery === "object" && load.extra_delivery.date) {
          return load.extra_delivery.date;
        }
        // иначе обычная delivery.date или уже рассчитанное поле delivery_date
        return (load.delivery && load.delivery.date) || load.delivery_date || null;
      };

      const totalAmount = data.loads.reduce((sum, load) => sum + (load.price || 0), 0);

      const table = document.createElement("table");
      table.className = "table table-sm table-bordered";
      table.innerHTML = `
        <thead>
          <tr>
            <th>✓</th>
            <th>Load ID</th>
            <th>Pickup<br><small>Date</small></th>
            <th>Delivery / Extra<br><small>Final Date</small></th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${data.loads.map((load) => {
            const checkedAttr = load.out_of_diap ? "" : "checked";

            const pickupAddress = load.pickup?.address || "—";
            const pickupDateStr = toDateOnly(load.pickup?.date);

            const deliveryAddress = load.delivery?.address || "—";
            const effectiveDeliveryDate = getEffectiveDeliveryDate(load);
            const deliveryDateStr = toDateOnly(effectiveDeliveryDate);

            return `
              <tr>
                <td>
                  <input type="checkbox" class="load-checkbox" data-price="${load.price}" ${checkedAttr}>
                </td>
                <td>${load.load_id || "—"}</td>
                <td>
                  <div>${pickupAddress}</div>
                  <div><strong>${pickupDateStr}</strong></div>
                </td>
                <td>
                  <div>${deliveryAddress}</div>
                  <div><strong>${deliveryDateStr}</strong></div>
                </td>
                <td>$${(load.price || 0).toFixed(2)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      `;

      container.innerHTML = "";
      container.appendChild(table);

      const checkboxes = container.querySelectorAll(".load-checkbox");
      checkboxes.forEach(cb => {
        cb.addEventListener("change", recalculateDriverSalary);
      });

      return totalAmount;
    })
    .catch(err => {
      console.error("❌ Ошибка при получении грузов:", err);
      return 0;
    });
}


function fetchDriverFuelSummary(driverId, weekRange) {
  fetch(`/api/driver_fuel_summary?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`)
    .then(res => res.json())
    .then(data => {
      console.log("⛽ Топливо:", data);
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
      console.error("❌ Ошибка при получении дизеля:", err);
    });
}

window.recalculateDriverSalary = async function () {
  const container = document.getElementById("driverStatementResults");
  const driverId = document.getElementById("driverSelect").value;
  const weekRange = document.getElementById("driverWeekRangeSelect").value;

  const checkboxes = container.querySelectorAll(".load-checkbox");
  let totalAmount = 0;

  checkboxes.forEach(cb => {
    if (cb.checked) {
      totalAmount += parseFloat(cb.dataset.price || "0");
    }
  });

  try {
    const res = await fetch(`/api/driver_commission_scheme?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`);
    const data = await res.json();

    console.log("💰 Зарплатная схема:", data);

    if (!data.success) {
      console.warn("Ошибка схемы зарплаты:", data.error);
      return;
    }

    let salary = 0;

    if (data.scheme_type === "percent") {
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

    const deductions = data.deductions || [];
    const totalDeductions = deductions.reduce((sum, d) => sum + (d.amount || 0), 0);
    const finalSalary = salary - totalDeductions;

    const old = container.querySelector("#driverSalaryBlock");
    if (old) old.remove();

    let html = `
      <div id="driverSalaryBlock" class="mt-4">
        <h5>💰 Зарплата водителя:</h5>
        <p><strong>Общая сумма выбранных грузов:</strong> $${totalAmount.toFixed(2)}</p>
        <p><strong>Зарплата до вычетов:</strong> $${salary.toFixed(2)}</p>
    `;

    if (deductions.length > 0) {
      html += `
        <h6 class="mt-3">💸 Списания:</h6>
        <ul>
          ${deductions.map(d => `
            <li>${d.type}: -$${d.amount.toFixed(2)}</li>
          `).join("")}
        </ul>
        <p><strong>Итого после вычетов:</strong> $${finalSalary.toFixed(2)}</p>
      `;
    }

    html += `</div>`;
    container.insertAdjacentHTML("beforeend", html);

  } catch (err) {
    console.error("❌ Ошибка при расчёте зарплаты:", err);
  }
}

function fetchDriverInspections(driverId, weekRange) {
  const container = document.getElementById("driverStatementResults");
  const [start, end] = weekRange.split("-").map(s => s.trim());

  fetch(`/api/driver_inspections_by_range?driver_id=${driverId}&start_date=${start}&end_date=${end}`)
    .then(res => res.json())
    .then(data => {
      console.log("🧾 Инспекции:", data);
      if (!data.success || !data.inspections.length) return;

      const html = `
        <div class="mt-4">
          <h5>🧾 Инспекции за период (${data.count}):</h5>
          <table class="table table-sm table-bordered">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время</th>
                <th>Адрес</th>
                <th>Clean</th>
              </tr>
            </thead>
            <tbody>
              ${data.inspections.map(i => `
                <tr>
                  <td>${i.date}</td>
                  <td>${i.start_time}–${i.end_time}</td>
                  <td>${i.address || "—"}</td>
                  <td>${i.clean_inspection ? "✅" : "❌"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;

      container.insertAdjacentHTML("beforeend", html);
    })
    .catch(err => {
      console.error("❌ Ошибка при получении инспекций:", err);
    });
}


function fetchDriverExpenses(driverId, weekRange) {
  const container = document.getElementById("driverStatementResults");
  const [start, end] = weekRange.split("-").map(s => s.trim());

  fetch(`/api/driver_expenses_by_range?driver_id=${driverId}&start_date=${start}&end_date=${end}`)
    .then(res => res.json())
    .then(data => {
      console.log("📄 Инвойсы:", data);
      if (!data.success || !data.expenses.length) return;

      const total = data.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

      const html = `
        <div class="mt-4">
          <h5>📄 Инвойсы за период (${data.count}):</h5>
          <ul>
            ${data.expenses.map(e => `
              <li>${e.date}: $${e.amount.toFixed(2)} (${e.category}) — ${e.note || "—"}</li>
            `).join("")}
          </ul>
          <p><strong>Итого по инвойсам:</strong> $${total.toFixed(2)}</p>
        </div>
      `;

      container.insertAdjacentHTML("beforeend", html);
    })
    .catch(err => {
      console.error("❌ Ошибка при получении инвойсов:", err);
    });
}




// Statement for All drrivers 

function openAllDriversStatementModal() {
  document.getElementById("allDriversStatementModal").classList.add("show");
  document.getElementById("allDriversStatementBackdrop").classList.add("show");

  // генерируем список недель, как для обычной модалки
  generateWeekRanges("allDriversWeekRangeSelect");
  loadDriversGroupedByCompany();
}

function closeAllDriversStatementModal() {
  document.getElementById("allDriversStatementModal").classList.remove("show");
  document.getElementById("allDriversStatementBackdrop").classList.remove("show");
}


async function loadDriversGroupedByCompany() {
  try {
    const res = await fetch("/api/drivers/list_for_statements");
    const data = await res.json();

    if (!data.success) {
      console.warn("Не удалось загрузить водителей:", data.error);
      return;
    }

    // Группируем по hiring_company_name
    const grouped = {};
    data.drivers.forEach(d => {
      const comp = d.hiring_company_name || "—";
      if (!grouped[comp]) grouped[comp] = [];
      grouped[comp].push(d);
    });

    // Сортировка компаний по алфавиту
    const sortedCompanies = Object.keys(grouped).sort();

    const container = document.getElementById("allDriversResults");
    container.innerHTML = "";

    // === Мастер-чекбокс ===
    const masterDiv = document.createElement("div");
    masterDiv.className = "mb-3";

    const masterId = "masterDriverCheckbox";
    const masterCb = document.createElement("input");
    masterCb.type = "checkbox";
    masterCb.className = "form-check-input me-2";
    masterCb.id = masterId;
    masterCb.checked = true;

    const masterLabel = document.createElement("label");
    masterLabel.className = "form-check-label fw-bold";
    masterLabel.setAttribute("for", masterId);
    masterLabel.textContent = "Выбрать/снять всех водителей";

    masterDiv.appendChild(masterCb);
    masterDiv.appendChild(masterLabel);
    container.appendChild(masterDiv);

    masterCb.addEventListener("change", () => {
      const allDriverCbs = container.querySelectorAll(".driver-select");
      allDriverCbs.forEach(cb => {
        cb.checked = masterCb.checked;
      });
    });

    // === Списки по компаниям ===
    sortedCompanies.forEach(companyName => {
      const drivers = grouped[companyName].sort((a, b) => a.name.localeCompare(b.name));

      // Блок компании
      const companyBlock = document.createElement("div");
      companyBlock.className = "mb-3";

      // Заголовок компании
      const header = document.createElement("h5");
      header.textContent = companyName;
      companyBlock.appendChild(header);

      // Список водителей с чекбоксами
      const ul = document.createElement("ul");
      ul.className = "list-unstyled";

      drivers.forEach(d => {
        const li = document.createElement("li");
        li.className = "mb-1";

        const cbId = `drv_${d.id}`;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input me-2 driver-select";
        checkbox.id = cbId;
        checkbox.checked = true; // по умолчанию выбраны
        checkbox.dataset.driverId = d.id;

        const label = document.createElement("label");
        label.className = "form-check-label";
        label.setAttribute("for", cbId);

        // Строка с именем, траком и диспетчером
        const truckStr = d.truck_number ? ` • Truck: ${d.truck_number}` : "";
        const dispStr = d.dispatcher_name ? ` • Dispatcher: ${d.dispatcher_name}` : "";

        label.textContent = `${d.name}${truckStr}${dispStr}`;

        li.appendChild(checkbox);
        li.appendChild(label);
        ul.appendChild(li);
      });

      companyBlock.appendChild(ul);
      container.appendChild(companyBlock);
    });

  } catch (err) {
    console.error("Ошибка загрузки водителей:", err);
  }
}