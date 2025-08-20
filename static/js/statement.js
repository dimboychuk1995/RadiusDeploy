function initStatementEvents() {
  generateWeekRanges("statementWeekRangeSelect");
}

/* ===================== CREATE-МОДАЛКА (формирование нового стейтмента) ===================== */
function openDriverStatementModal() {
  const modal = document.getElementById("driverStatementModal");
  const backdrop = document.getElementById("driverStatementBackdrop");
  const title = modal.querySelector(".modal-title");
  const driverLabel = modal.querySelector('label[for="driverSelect"]');
  const driverSel = modal.querySelector("#driverSelect");
  const weekLabel = modal.querySelector('label[for="driverWeekRangeSelect"]');
  const weekSel = modal.querySelector("#driverWeekRangeSelect");
  const calcBtn = modal.querySelector('button[onclick="calculateDriverStatement()"]');
  const saveBtn = modal.querySelector('button[onclick="saveDriverStatement()"]');
  const results = modal.querySelector("#driverStatementResults");
  const reviewWrap = modal.querySelector("#reviewConfirmWrap");

  modal.classList.add("show");
  if (backdrop) backdrop.classList.add("show");

  modal.dataset.mode = "create";
  delete modal.dataset.statementId;

  if (title) title.textContent = "Добавление стейтмента водителя";
  [driverLabel, driverSel, weekLabel, weekSel].forEach(el => { if (el) el.style.display = ""; });
  if (calcBtn) calcBtn.style.display = "";
  if (saveBtn) saveBtn.style.display = "";

  if (reviewWrap) reviewWrap.remove();
  if (results) results.innerHTML = "";

  try { generateWeekRanges("driverWeekRangeSelect"); } catch (e) {}
}

/* ===================== ЗАКРЫТИЕ МОДАЛКИ (полный ресет) ===================== */
function closeDriverStatementModal() {
  const modal = document.getElementById("driverStatementModal");
  const backdrop = document.getElementById("driverStatementBackdrop");
  if (!modal) return;

  modal.classList.remove("show");
  if (backdrop) backdrop.classList.remove("show");

  const title = modal.querySelector(".modal-title");
  const driverLabel = modal.querySelector('label[for="driverSelect"]');
  const driverSel = modal.querySelector("#driverSelect");
  const weekLabel = modal.querySelector('label[for="driverWeekRangeSelect"]');
  const weekSel = modal.querySelector("#driverWeekRangeSelect");
  const calcBtn = modal.querySelector('button[onclick="calculateDriverStatement()"]');
  const saveBtn = modal.querySelector('button[onclick="saveDriverStatement()"]');
  const reviewWrap = modal.querySelector("#reviewConfirmWrap");
  const results = modal.querySelector("#driverStatementResults");

  if (title) title.textContent = "Добавление стейтмента водителя";
  [driverLabel, driverSel, weekLabel, weekSel].forEach(el => { if (el) el.style.display = ""; });
  if (calcBtn) calcBtn.style.display = "";
  if (saveBtn) saveBtn.style.display = "";
  if (reviewWrap) reviewWrap.remove();
  if (results) results.innerHTML = "";

  delete modal.dataset.mode;
  delete modal.dataset.statementId;
}

/* ===================== Расчёт одного стейтмента (модалка CREATE) ===================== */
async function calculateDriverStatement() {
  const driverId = document.getElementById("driverSelect").value;
  const weekRange = document.getElementById("driverWeekRangeSelect").value;
  const container = document.getElementById("driverStatementResults");

  if (!driverId || !weekRange) {
    alert("Выберите водителя и диапазон недели.");
    return;
  }

  container.innerHTML = "<p>Загрузка...</p>";

  // 1) Грузы
  await fetchAndRenderDriverLoads(driverId, weekRange);

  // 2) Параллельные блоки
  fetchDriverFuelSummary(driverId, weekRange);
  fetchDriverInspections(driverId, weekRange);
  fetchDriverExpenses(driverId, weekRange);

  // 3) Пробег за период (используется в per_mile)
  fetchDriverMileage(driverId, weekRange);

  // 4) Пересчёт зарплаты
  window.recalculateDriverSalary();
}

/* ===================== Грузы водителя ===================== */
function fetchAndRenderDriverLoads(driverId, weekRange) {
  return fetch(`/api/driver_statement_loads?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`)
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById("driverStatementResults");

      if (!data.success || !data.loads.length) {
        container.innerHTML = "<p>Грузы не найдены</p>";
        container.dataset.extraStopsTotal = "0";
        const oldSum = container.querySelector("#extraStopsSummary");
        if (oldSum) oldSum.remove();
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
        if (Array.isArray(load.extra_delivery) && load.extra_delivery.length) {
          const last = load.extra_delivery[load.extra_delivery.length - 1];
          return last?.date || null;
        }
        if (load.extra_delivery && typeof load.extra_delivery === "object" && load.extra_delivery.date) {
          return load.extra_delivery.date;
        }
        return (load.delivery && load.delivery.date) || load.delivery_date || null;
      };

      let selectedExtraStops = 0;

      const table = document.createElement("table");
      table.className = "table table-sm table-bordered";
      table.innerHTML = `
        <thead>
          <tr>
            <th>✓</th>
            <th>Load ID</th>
            <th>Pickup<br><small>Date</small></th>
            <th>Delivery / Extra<br><small>Final Date</small></th>
            <th>Extra Stops</th>
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
            const extraCount = Number(load.extra_stops || 0);
            if (!load.out_of_diap) selectedExtraStops += Math.max(0, extraCount);

            return `
              <tr>
                <td>
                  <input
                    type="checkbox"
                    class="load-checkbox"
                    data-load-oid="${load._id || ""}"
                    data-price="${load.price || 0}"
                    data-extra-stops="${extraCount}"
                    ${checkedAttr}
                  >
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
                <td>${extraCount}</td>
                <td>$${(load.price || 0).toFixed(2)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      `;

      container.innerHTML = "";
      container.appendChild(table);

      container.dataset.extraStopsTotal = String(selectedExtraStops);

      const checkboxes = container.querySelectorAll(".load-checkbox");
      checkboxes.forEach(cb => cb.addEventListener("change", recalculateDriverSalary));

      renderOrUpdateExtraStopsSummary(container);

      return data.loads.reduce((sum, load) => sum + (load.price || 0), 0);
    })
    .catch(err => {
      console.error("❌ Ошибка при получении грузов:", err);
      return 0;
    });
}




// вспомогательный сниппет: небольшой summary по экстра-стопам под таблицей
function renderOrUpdateExtraStopsSummary(container) {
  const cbs = container.querySelectorAll(".load-checkbox");
  let selectedExtraStops = 0;
  cbs.forEach(cb => {
    if (cb.checked) {
      selectedExtraStops += Number(cb.dataset.extraStops || 0);
    }
  });
  container.dataset.extraStopsTotal = String(selectedExtraStops);

  let sum = container.querySelector("#extraStopsSummary");
  const html = `
    <div id="extraStopsSummary" class="mt-2 text-muted">
      <strong>Extra stops (selected):</strong> ${selectedExtraStops}
    </div>
  `;
  if (!sum) {
    const table = container.querySelector("table");
    if (table) table.insertAdjacentHTML("afterend", html);
  } else {
    sum.outerHTML = html;
  }
}





/* ===================== Топливо ===================== */
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

/* ===================== Инспекции ===================== */
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

/* ===================== Инвойсы ===================== */
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
        <div class="mt-4" id="driverExpensesBlock">
          <h5>📄 Инвойсы за период (<span id="expensesCount">${data.count}</span>):</h5>
          <ul class="list-unstyled mb-2" id="expensesList">
            ${data.expenses.map(e => `
              <li
                class="expense-item d-flex align-items-center gap-2 mb-2"
                data-expense-id="${e._id}"
                data-removed="0"
              >
                <div class="flex-grow-1">
                  <div><strong>${e.date}</strong> • ${e.category || "—"} — ${e.note || "—"}</div>
                  <div class="d-flex align-items-center gap-2 mt-1">
                    <label class="form-label m-0">Сумма:</label>
                    <input
                      type="number"
                      class="form-control form-control-sm expense-amount"
                      step="0.01"
                      min="0"
                      value="${(e.amount || 0).toFixed(2)}"
                      style="width:140px"
                    />
                    <select
                      class="form-select form-select-sm expense-action"
                      style="width:210px"
                    >
                      <option value="keep" selected>Оставить как есть</option>
                      <option value="deduct_salary">Снять с зарплаты</option>
                      <option value="add_salary">Добавить в зарплату</option>
                      <option value="deduct_gross">Снять с гросса</option>
                      <option value="add_gross">Добавить в гросс</option>
                    </select>

                    <button type="button" class="btn btn-sm btn-outline-danger expense-remove-btn">
                      Удалить из стейтмента
                    </button>
                  </div>
                </div>
              </li>
            `).join("")}
          </ul>
          <div class="text-muted">
            <strong>Итого по инвойсам:</strong>
            $<span id="expensesTotalVal">${total.toFixed(2)}</span>
          </div>
        </div>
      `;

      container.insertAdjacentHTML("beforeend", html);

      const expensesBlock = container.querySelector("#driverExpensesBlock");
      expensesBlock.querySelectorAll(".expense-action").forEach(sel => {
        sel.addEventListener("change", window.recalculateDriverSalary);
      });
      expensesBlock.querySelectorAll(".expense-amount").forEach(inp => {
        inp.addEventListener("input", window.recalculateDriverSalary);
      });

      expensesBlock.querySelectorAll(".expense-remove-btn").forEach(btn => {
        btn.addEventListener("click", (ev) => {
          const li = ev.currentTarget.closest(".expense-item");
          const removed = li.getAttribute("data-removed") === "1";
          if (!removed) {
            li.setAttribute("data-removed", "1");
            li.style.opacity = "0.5";
            ev.currentTarget.classList.remove("btn-outline-danger");
            ev.currentTarget.classList.add("btn-outline-secondary");
            ev.currentTarget.textContent = "Вернуть в стейтмент";
          } else {
            li.setAttribute("data-removed", "0");
            li.style.opacity = "1";
            ev.currentTarget.classList.remove("btn-outline-secondary");
            ev.currentTarget.classList.add("btn-outline-danger");
            ev.currentTarget.textContent = "Удалить из стейтмента";
          }
          window.recalculateDriverSalary();
        });
      });
    })
    .catch(err => {
      console.error("❌ Ошибка при получении инвойсов:", err);
    });
}

/* ===================== ПРОБЕГ ВОДИТЕЛЯ ЗА ПЕРИОД (одиночный расчёт) ===================== */
async function fetchDriverMileage(driverId, weekRange) {
  const container = document.getElementById("driverStatementResults");
  const [start, end] = weekRange.split("-").map(s => s.trim());

  const params = new URLSearchParams({
    driver_id: driverId,
    start: start,   // без времени -> сервер сделает 00:00 локали
    end: end,       // без времени -> сервер сделает 23:59:59 локали
    tz: "America/Chicago"
  });

  try {
    const res = await fetch(`/api/statement/driver_mileage?${params.toString()}`);
    let data = null;
    try { data = await res.json(); } catch (_) {}

    const old = container.querySelector("#driverMileageBlock");
    if (old) old.remove();

    if (!res.ok) {
      const msg = (data && (data.error || data.reason)) || `HTTP ${res.status}`;
      container.insertAdjacentHTML(
        "beforeend",
        `<div id="driverMileageBlock" class="mt-4 text-muted">🚚 Пробег: недоступен (${msg})</div>`
      );
      return;
    }

    const miles = Number((data && (data.miles ?? data.mileage?.miles)) || 0);
    const source = (data && (data.source ?? data.mileage?.source)) || "—";
    const truckNum = data && (data.unit_number || data.truck_number);

    const html = `
      <div id="driverMileageBlock" class="mt-4" data-miles="${miles}" data-source="${source}">
        <h5>🚚 Пробег за период:</h5>
        <div><b>${miles.toFixed(2)}</b> mi <span class="text-muted">(${source})</span>${truckNum ? ` • Truck ${truckNum}` : ""}</div>
      </div>
    `;
    container.insertAdjacentHTML("beforeend", html);

    window.__statementState = window.__statementState || {};
    window.__statementState.mileageByDriver = window.__statementState.mileageByDriver || {};
    window.__statementState.mileageByDriver[driverId] = { miles, source, raw: data };

    window.recalculateDriverSalary();
  } catch (err) {
    console.error("❌ Ошибка пробега:", err);
    const old = container.querySelector("#driverMileageBlock");
    if (old) old.remove();
    container.insertAdjacentHTML(
      "beforeend",
      `<div id="driverMileageBlock" class="mt-4 text-danger">Не удалось получить пробег</div>`
    );
  }
}

/* ===================== Пересчёт зарплаты (учёт percent и per_mile) ===================== */
window.recalculateDriverSalary = async function () {
  const container = document.getElementById("driverStatementResults");
  const driverId = document.getElementById("driverSelect").value;
  const weekRange = document.getElementById("driverWeekRangeSelect").value;

  // 1) Гросс из выбранных грузов
  const checkboxes = container.querySelectorAll(".load-checkbox");
  let loadsGross = 0;
  let selectedExtraStops = 0;
  checkboxes.forEach(cb => {
    if (cb.checked) {
      loadsGross += parseFloat(cb.dataset.price || "0");
      selectedExtraStops += Number(cb.dataset.extraStops || 0);
    }
  });

  // Обновим маленький summary по экстра-стопам
  renderOrUpdateExtraStopsSummary(container);

  // 2) Инвойсы
  let grossAdd = 0, grossDeduct = 0, salaryAdd = 0, salaryDeduct = 0, visibleTotal = 0;
  const expensesBlock = container.querySelector("#driverExpensesBlock");
  if (expensesBlock) {
    const items = expensesBlock.querySelectorAll(".expense-item");
    items.forEach(item => {
      const removed = item.getAttribute("data-removed") === "1";
      const amountStr = (item.querySelector(".expense-amount")?.value || "0").trim();
      const amount = Math.max(0, parseFloat(amountStr || "0"));
      const action = item.querySelector(".expense-action")?.value || "keep";

      if (!removed) {
        visibleTotal += amount;
        switch (action) {
          case "add_gross":     grossAdd += amount; break;
          case "deduct_gross":  grossDeduct += amount; break;
          case "add_salary":    salaryAdd += amount; break;
          case "deduct_salary": salaryDeduct += amount; break;
        }
      }
    });

    const totalEl = expensesBlock.querySelector("#expensesTotalVal");
    if (totalEl) totalEl.textContent = visibleTotal.toFixed(2);
  }

  const grossForCommission = loadsGross + grossAdd - grossDeduct;

  try {
    // 3) Схема + экстра-стоп бонус из карточки водителя
    const res = await fetch(`/api/driver_commission_scheme?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`);
    const data = await res.json();
    if (!data.success) {
      console.warn("Ошибка схемы зарплаты:", data.error);
      return;
    }

    // 4) Комиссия
    let commission = 0;
    let perMileDetails = null;

    if (data.scheme_type === "per_mile") {
      // пробег берём из блока/стейта
      let miles = 0;
      const block = document.getElementById("driverMileageBlock");
      if (block && block.dataset.miles) {
        miles = Number(block.dataset.miles || 0);
      } else {
        const st = (window.__statementState?.mileageByDriver?.[driverId]) || {};
        miles = Number(st.miles || 0);
      }
      const rate = Number(data.per_mile_rate || 0);
      commission = miles * rate;
      perMileDetails = { miles, rate, amount: commission };
    } else {
      // percent
      const table = data.commission_table || [];
      if (table.length === 1) {
        commission = grossForCommission * (Number(table[0].percent || 0) / 100);
      } else if (table.length > 1) {
        const matched = table
          .filter(row => grossForCommission >= Number(row.from_sum || 0))
          .sort((a, b) => Number(b.from_sum || 0) - Number(a.from_sum || 0))[0];
        if (matched) commission = grossForCommission * (Number(matched.percent || 0) / 100);
      }
    }

    // 5) Вычеты по схеме + корректировки ЗП из инвойсов
    const schemeDeductions = data.deductions || [];
    const schemeDeductionsTotal = schemeDeductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    // 6) 🆕 Экстра-стоп бонус
    const extraEnabled = !!data.enable_extra_stop_bonus;
    const extraRate = Number(data.extra_stop_bonus_amount || 0);
    const extraBonus = extraEnabled ? selectedExtraStops * extraRate : 0;

    const finalSalary =
      commission
      - schemeDeductionsTotal
      - salaryDeduct
      + salaryAdd
      + extraBonus; // ← добавили бонус за экстра-стопы

    // 7) Рендер
    const old = container.querySelector("#driverSalaryBlock");
    if (old) old.remove();

    const perMileRow = perMileDetails ? `
      <tr class="table-light">
        <th>Per-mile</th>
        <td class="text-end">
          ${perMileDetails.miles.toLocaleString(undefined, {maximumFractionDigits:2})}
          × $${perMileDetails.rate.toFixed(4)} = <strong>$${perMileDetails.amount.toFixed(2)}</strong>
        </td>
      </tr>
    ` : "";

    const extraRow = extraEnabled ? `
      <tr class="table-light">
        <th>Extra stop bonus</th>
        <td class="text-end">
          ${selectedExtraStops}
          × $${extraRate.toFixed(2)} = <strong>$${extraBonus.toFixed(2)}</strong>
        </td>
      </tr>
    ` : "";

    const html = `
      <div id="driverSalaryBlock" class="mt-4">
        <h5>💰 Зарплата водителя:</h5>
        <div class="table-responsive">
          <table class="table table-sm table-bordered align-middle">
            <tbody>
              <tr>
                <th style="width:50%">Гросс по выбранным грузам</th>
                <td class="text-end">$${loadsGross.toFixed(2)}</td>
              </tr>
              <tr>
                <th>Корректировки гросса (инвойсы)</th>
                <td class="text-end">
                  +$${grossAdd.toFixed(2)} (add_gross)
                  &nbsp;&nbsp;–$${grossDeduct.toFixed(2)} (deduct_gross)
                </td>
              </tr>
              <tr class="table-light">
                <th>Гросс для расчёта комиссии</th>
                <td class="text-end"><strong>$${grossForCommission.toFixed(2)}</strong></td>
              </tr>
              ${perMileRow}
              <tr>
                <th>Комиссия по схеме</th>
                <td class="text-end">$${commission.toFixed(2)}</td>
              </tr>
              <tr>
                <th>Списания по схеме</th>
                <td class="text-end">–$${schemeDeductionsTotal.toFixed(2)}</td>
              </tr>
              <tr>
                <th>Корректировки к зарплате (инвойсы)</th>
                <td class="text-end">
                  +$${salaryAdd.toFixed(2)} (add_salary)
                  &nbsp;&nbsp;–$${salaryDeduct.toFixed(2)} (deduct_salary)
                </td>
              </tr>
              ${extraRow}
              <tr class="table-success">
                <th>Итого к выплате</th>
                <td class="text-end"><strong>$${finalSalary.toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        ${schemeDeductions.length > 0 ? `
          <h6 class="mt-3">💸 Списания по схеме:</h6>
          <ul>
            ${schemeDeductions.map(d => `
              <li>${d.type}: -$${(Number(d.amount) || 0).toFixed(2)}</li>
            `).join("")}
          </ul>
        ` : ""}
      </div>
    `;

    container.insertAdjacentHTML("beforeend", html);

    // можно сохранить калькуляцию в крошечный кэш, если saveDriverStatement это читает
    window.__statementState = window.__statementState || {};
    window.__statementState.lastSingleCalc = {
      driverId,
      loadsGross, grossAdd, grossDeduct, salaryAdd, salaryDeduct,
      grossForCommission, commission, schemeDeductionsTotal,
      extraEnabled, selectedExtraStops, extraRate, extraBonus,
      finalSalary
    };
  } catch (err) {
    console.error("❌ Ошибка при расчёте зарплаты:", err);
  }
};





/* ===================== Statement for All drivers ===================== */
function openAllDriversStatementModal() {
  document.getElementById("allDriversStatementModal").classList.add("show");
  document.getElementById("allDriversStatementBackdrop").classList.add("show");

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

    const grouped = {};
    data.drivers.forEach(d => {
      const comp = d.hiring_company_name || "—";
      if (!grouped[comp]) grouped[comp] = [];
      grouped[comp].push(d);
    });

    const sortedCompanies = Object.keys(grouped).sort();
    const container = document.getElementById("allDriversResults");
    container.innerHTML = "";

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

    sortedCompanies.forEach(companyName => {
      const drivers = grouped[companyName].sort((a, b) => a.name.localeCompare(b.name));
      const companyBlock = document.createElement("div");
      companyBlock.className = "mb-3";

      const header = document.createElement("h5");
      header.textContent = companyName;
      companyBlock.appendChild(header);

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
        checkbox.checked = true;
        checkbox.dataset.driverId = d.id;

        const label = document.createElement("label");
        label.className = "form-check-label";
        label.setAttribute("for", cbId);

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

/* ===================== Helpers (All drivers) ===================== */
function getSelectedDriversFromModal() {
  const container = document.getElementById("allDriversResults");
  const cbs = container.querySelectorAll(".driver-select");
  return Array.from(cbs)
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.driverId);
}

async function apiGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return await r.json();
}

// 🔁 утилита: «мягкий» запрос JSON. На 404 — НЕ бросаем исключение.
async function apiGetSoft(url) {
  const r = await fetch(url);
  if (r.status === 404) {
    return { success: false, _soft404: true };
  }
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return await r.json();
}

/* ===================== Собрать данные по одному водителю (All drivers) ===================== */
async function fetchAllForDriver(driverId, weekRange) {
  const [start, end] = weekRange.split("-").map(s => s.trim());

  const [
    loadsRes,
    fuelRes,
    schemeRes,
    inspRes,
    expRes,
    mileageRes
  ] = await Promise.all([
    apiGet(`/api/driver_statement_loads?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`),
    apiGet(`/api/driver_fuel_summary?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`),
    apiGet(`/api/driver_commission_scheme?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`),
    apiGet(`/api/driver_inspections_by_range?driver_id=${driverId}&start_date=${start}&end_date=${end}`),
    apiGet(`/api/driver_expenses_by_range?driver_id=${driverId}&start_date=${start}&end_date=${end}`),
    // пробег — «мягко», 404 не валит расчёт
    apiGetSoft(`/api/statement/driver_mileage?driver_id=${driverId}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&tz=America/Chicago`)
  ]);

  // 1) Нормализация блоков
  const loads = (loadsRes.success ? loadsRes.loads : []);
  const fuel  = (fuelRes.success ? fuelRes.fuel : { qty:0, retail:0, invoice:0, cards:[] });

  // схема: добавили поля для экстра-стоп бонуса
  const scheme = (schemeRes.success ? {
    scheme_type: schemeRes.scheme_type,
    commission_table: schemeRes.commission_table || [],
    per_mile_rate: Number(schemeRes.per_mile_rate || 0),
    deductions: schemeRes.deductions || [],
    enable_inspection_bonus: !!schemeRes.enable_inspection_bonus,
    bonus_level_1: schemeRes.bonus_level_1 || 0,
    bonus_level_2: schemeRes.bonus_level_2 || 0,
    bonus_level_3: schemeRes.bonus_level_3 || 0,

    // 🆕 для бонуса за экстра-стоп
    enable_extra_stop_bonus: !!schemeRes.enable_extra_stop_bonus,
    extra_stop_bonus_amount: Number(schemeRes.extra_stop_bonus_amount || 0)
  } : null);

  const inspections = (inspRes.success ? inspRes.inspections : []);

  const expenses = (expRes.success ? expRes.expenses : []).map(e => ({
    _id: e._id,
    amount: Number(e.amount || 0),
    category: e.category || "",
    note: e.note || "",
    date: e.date || "",
    photo_id: e.photo_id || null,
    action: "keep",
    removed: false
  }));

  // 2) Пробег
  const mileage = (mileageRes && mileageRes.success)
    ? {
        miles:  Number((mileageRes.miles ?? mileageRes.mileage?.miles) || 0),
        meters: Number((mileageRes.meters ?? mileageRes.mileage?.meters) || 0),
        source: (mileageRes.source ?? mileageRes.mileage?.source) || null,
        truck_id: mileageRes.truck_id || null,
        samsara_vehicle_id: mileageRes.vehicle_id || null
      }
    : { miles: 0, meters: 0, source: null, truck_id: null, samsara_vehicle_id: null };

  // 3) Гросс + корректировки
  const loadsGross = loads.reduce((sum, ld) => sum + Number(ld.price || 0), 0);
  let grossAdd = 0, grossDeduct = 0, salaryAdd = 0, salaryDeduct = 0;
  for (const exp of expenses) {
    if (exp.removed) continue;
    const amt = Number(exp.amount || 0);
    switch (exp.action) {
      case "add_gross":     grossAdd += amt; break;
      case "deduct_gross":  grossDeduct += amt; break;
      case "add_salary":    salaryAdd += amt; break;
      case "deduct_salary": salaryDeduct += amt; break;
      default: break;
    }
  }
  const grossForCommission = loadsGross + grossAdd - grossDeduct;

  // 4) Комиссия
  let commission = 0;
  if (scheme) {
    if (scheme.scheme_type === "per_mile") {
      commission = (mileage.miles || 0) * (scheme.per_mile_rate || 0);
    } else {
      const table = scheme.commission_table || [];
      if (table.length === 1) {
        commission = grossForCommission * (Number(table[0].percent || 0) / 100);
      } else if (table.length > 1) {
        const matched = table
          .filter(row => grossForCommission >= Number(row.from_sum || 0))
          .sort((a, b) => Number(b.from_sum || 0) - Number(a.from_sum || 0))[0];
        if (matched) commission = grossForCommission * (Number(matched.percent || 0) / 100);
      }
    }
  }

  // 5) Вычеты по схеме
  const schemeDeductions = (scheme?.deductions || []);
  const schemeDeductionsTotal = schemeDeductions.reduce((s, d) => s + Number(d.amount || 0), 0);

  // 6) 🆕 Экстра-стоп бонус для массового расчёта
  // сервер уже считает extra_stops_total в ответе /driver_statement_loads,
  // но на всякий случай пересчитаем, если поле не пришло
  const extraStopsTotal = loadsRes.extra_stops_total != null
    ? Number(loadsRes.extra_stops_total || 0)
    : loads.filter(ld => !ld.out_of_diap).reduce((acc, ld) => acc + Number(ld.extra_stops || 0), 0);

  const extraRate = Number(scheme?.extra_stop_bonus_amount || 0);
  const extraBonus = (scheme && scheme.enable_extra_stop_bonus) ? (extraStopsTotal * extraRate) : 0;

  // 7) Итог
  const finalSalary = commission - schemeDeductionsTotal - salaryDeduct + salaryAdd + extraBonus;

  const calc = {
    loads_gross: Number(loadsGross.toFixed(2)),
    gross_add_from_expenses: Number(grossAdd.toFixed(2)),
    gross_deduct_from_expenses: Number(grossDeduct.toFixed(2)),
    gross_for_commission: Number(grossForCommission.toFixed(2)),
    commission: Number(commission.toFixed(2)),
    scheme_deductions_total: Number(schemeDeductionsTotal.toFixed(2)),
    salary_add_from_expenses: Number(salaryAdd.toFixed(2)),
    salary_deduct_from_expenses: Number(salaryDeduct.toFixed(2)),

    // 🆕 чтобы было видно в UI/логах
    extra_stops_total: Number(extraStopsTotal),
    extra_stop_bonus_total: Number(extraBonus.toFixed(2)),

    final_salary: Number(finalSalary.toFixed(2))
  };

  return {
    driver_id: driverId,
    week_range: weekRange,
    loads,
    fuel,
    scheme,
    inspections,
    expenses,
    mileage,
    calc
  };
}





/* ===================== ▶️ Рассчитать всем + Bulk Save ===================== */
async function calculateAllDriversStatements() {
  const weekRange = document.getElementById("allDriversWeekRangeSelect").value;
  if (!weekRange) {
    Swal.fire("Внимание", "Выберите неделю.", "warning");
    return;
  }

  const driverIds = getSelectedDriversFromModal();
  if (!driverIds.length) {
    Swal.fire("Внимание", "Выберите хотя бы одного водителя.", "warning");
    return;
  }

  const out = document.getElementById("allDriversResults");
  const progressId = "bulkProgress";
  const existing = document.getElementById(progressId);
  if (existing) existing.remove();

  const progress = document.createElement("div");
  progress.id = progressId;
  progress.className = "mt-3";
  progress.innerHTML = `<p><strong>Старт расчёта (${driverIds.length} водителей)...</strong></p>`;
  out.prepend(progress);

  const results = [];
  let done = 0;

  for (const driverId of driverIds) {
    try {
      const data = await fetchAllForDriver(driverId, weekRange);
      results.push(data);
      done += 1;
      progress.innerHTML = `<p><strong>Готово ${done}/${driverIds.length}</strong></p>`;
    } catch (e) {
      console.error("Ошибка по водителю", driverId, e);
      done += 1;
      progress.innerHTML = `<p><strong>Готово ${done}/${driverIds.length} (с ошибками)</strong></p>`;
    }
  }

  try {
    const r = await fetch("/api/statements/bulk_save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        week_range: weekRange,
        items: results
      })
    });
    const resp = await r.json();

    if (!resp.success) {
      console.warn("Bulk save error:", resp.error);
      progress.insertAdjacentHTML(
        "beforeend",
        `<p class="text-danger">Ошибка сохранения: ${resp.error || "unknown"}</p>`
      );
      Swal.fire("Ошибка", resp.error || "Bulk save failed", "error");
      return;
    }

    const { added = 0, ignored = 0, replaced = 0 } = resp;

    progress.insertAdjacentHTML(
      "beforeend",
      `<p class="text-success">Добавлено: ${added} • Перезаписано: ${replaced} • Проигнорировано: ${ignored}</p>`
    );

    await Swal.fire({
      icon: "success",
      title: "Массовый расчёт завершён",
      html: `
        <div style="text-align:left">
          <div><b>Неделя:</b> ${weekRange}</div>
          <div style="margin-top:8px">
            <span style="color:#16a34a"><b>Добавлено:</b> ${added}</span><br>
            <span style="color:#ca8a04"><b>Перезаписано:</b> ${replaced}</span><br>
            <span style="color:#6b7280"><b>Проигнорировано (approved):</b> ${ignored}</span>
          </div>
          <div style="margin-top:8px"><b>Всего обработано:</b> ${results.length}</div>
        </div>
      `,
      confirmButtonText: "Ок"
    });
  } catch (e) {
    console.error("Bulk save request error:", e);
    progress.insertAdjacentHTML(
      "beforeend",
      `<p class="text-danger">Ошибка запроса сохранения</p>`
    );
    Swal.fire("Ошибка", "Не удалось выполнить запрос сохранения.", "error");
  }
}

/* ===================== Список стейтментов (таблица) + Review ===================== */
async function loadDriverStatements() {
  const weekRange = document.getElementById("statementWeekRangeSelect").value || "";
  const container = document.getElementById("driverStatementsContainer");

  container.innerHTML = `<p>Загрузка...</p>`;

  let url = `/api/statements/list`;
  if (weekRange) {
    url += `?week_range=${encodeURIComponent(weekRange)}`;
  }

  const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;
  const debounce = (fn, ms = 200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `<p class="text-danger">Ошибка: ${data.error || "Не удалось получить список стейтментов"}</p>`;
      return;
    }
    if (!data.items || data.items.length === 0) {
      container.innerHTML = `<p>Стейтменты не найдены</p>`;
      return;
    }

    const items = [...data.items].sort((a,b)=>{
      const c = (a.hiring_company_name||"").localeCompare(b.hiring_company_name||"", undefined, {sensitivity:"base"});
      if (c!==0) return c;
      return (a.driver_name||"").localeCompare(b.driver_name||"", undefined, {sensitivity:"base"});
    });

    const companies = Array.from(new Set(items.map(x => x.hiring_company_name || "—")))
      .sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));

    const filterBar = `
      <div class="card border-0 shadow-sm rounded-3 mb-3">
        <div class="card-body py-3">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
            <div class="d-flex align-items-center gap-2">
              <span class="fw-semibold">Фильтры</span>
              <span class="badge bg-light text-secondary border">Неделя: ${weekRange || "—"}</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="stmtFiltersReset">Сбросить</button>
          </div>

          <div class="row g-3">
            <div class="col-md-4">
              <label for="stmtFilterDriver" class="form-label mb-1">Имя водителя</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">🔎</span>
                <input type="text" id="stmtFilterDriver" class="form-control" placeholder="Например: John">
              </div>
            </div>

            <div class="col-md-4">
              <label for="stmtFilterCompany" class="form-label mb-1">Компания</label>
              <select id="stmtFilterCompany" class="form-select form-select-sm">
                <option value="">Все компании</option>
                ${companies.map(c => `<option value="${c}">${c}</option>`).join("")}
              </select>
            </div>

            <div class="col-md-4">
              <label class="form-label mb-1 d-block">Активность</label>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="stmtFilterActiveOnly">
                <label class="form-check-label" for="stmtFilterActiveOnly">
                  Показать где Monday Loads / Invoices / Inspections ≥ 1
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const tableShell = `
      <div class="table-responsive">
        <table class="table table-sm table-bordered align-middle" id="statementsTable">
          <thead class="table-light">
            <tr>
              <th class="text-center" style="width:36px">
                <input type="checkbox" class="form-check-input" id="stmtMasterCb">
              </th>
              <th>Status</th>
              <th>Week</th>
              <th>Driver</th>
              <th>Company</th>
              <th>Truck</th>
              <th class="text-end">Monday Loads</th>
              <th class="text-end">Invoices</th>
              <th class="text-end">Inspections</th>
              <th class="text-end">Salary</th>
              <th class="text-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody id="statementsTbody"></tbody>
        </table>
      </div>
      <div class="mt-2 text-muted d-flex justify-content-between">
        <div>Всего: <span id="stmtSummaryCount">0</span></div>
        <div><strong>Сумма зарплат:</strong> <span id="stmtSummaryTotal">$0.00</span></div>
      </div>
    `;

    container.innerHTML = filterBar + tableShell;

    const tbody = container.querySelector("#statementsTbody");
    const master = container.querySelector("#stmtMasterCb");
    const sumCountEl = container.querySelector("#stmtSummaryCount");
    const sumTotalEl = container.querySelector("#stmtSummaryTotal");

    const buildRow = (it) => {
      const approvedBadge = it.approved
        ? `<span class="badge bg-success">Approved</span>`
        : `<span class="badge bg-secondary">Pending</span>`;
      const anyPositive = Number(it.monday_loads)>0 || Number(it.invoices_num)>0 || Number(it.inspections_num)>0;
      const rowClass = it.approved ? "table-success" : (anyPositive ? "table-danger" : "table-warning");
      const confirmDisabled = it.approved ? "disabled" : "";

      return `
        <tr class="${rowClass}" data-id="${it._id}">
          <td class="text-center" style="width:36px">
            <input type="checkbox" class="form-check-input stmt-cb" data-id="${it._id}">
          </td>
          <td class="status-cell">${approvedBadge}</td>
          <td>${it.week_range || "—"}</td>
          <td>${it.driver_name || "—"}</td>
          <td>${it.hiring_company_name || "—"}</td>
          <td>${it.truck_number || "—"}</td>
          <td class="text-end">${it.monday_loads}</td>
          <td class="text-end">${it.invoices_num}</td>
          <td class="text-end">${it.inspections_num}</td>
          <td class="text-end fw-semibold">${fmtMoney(it.salary)}</td>
          <td class="text-nowrap" style="width:180px">
            <button type="button" class="btn btn-sm btn-primary btn-stmt-confirm" data-id="${it._id}" ${confirmDisabled}>Confirm</button>
            <button type="button" class="btn btn-sm btn-outline-secondary ms-1 btn-stmt-review" data-id="${it._id}">Review</button>
          </td>
        </tr>
      `;
    };

    const renderRows = (arr) => {
      tbody.innerHTML = arr.map(buildRow).join("");
      sumCountEl.textContent = arr.length;
      const totalSalary = arr.reduce((s, x) => s + (Number(x.salary)||0), 0);
      sumTotalEl.textContent = fmtMoney(totalSalary);
      if (master) master.checked = false;
    };

    // фильтры
    const driverInput   = container.querySelector("#stmtFilterDriver");
    const companySelect = container.querySelector("#stmtFilterCompany");
    const activeOnlyCb  = container.querySelector("#stmtFilterActiveOnly");
    const resetBtn      = container.querySelector("#stmtFiltersReset");

    const applyFilters = () => {
      const q = (driverInput.value||"").trim().toLowerCase();
      const comp = companySelect.value||"";
      const activeOnly = activeOnlyCb.checked;

      const filtered = items.filter(it => {
        if (q && !(it.driver_name||"").toLowerCase().includes(q)) return false;
        if (comp && (it.hiring_company_name||"") !== comp) return false;
        if (activeOnly) {
          const anyPos = Number(it.monday_loads)>0 || Number(it.invoices_num)>0 || Number(it.inspections_num)>0;
          if (!anyPos) return false;
        }
        return true;
      });

      renderRows(filtered);
    };

    renderRows(items);

    driverInput.addEventListener("input", debounce(applyFilters, 200));
    companySelect.addEventListener("change", applyFilters);
    activeOnlyCb.addEventListener("change", applyFilters);
    resetBtn.addEventListener("click", () => {
      driverInput.value = "";
      companySelect.value = "";
      activeOnlyCb.checked = false;
      applyFilters();
      driverInput.focus();
    });

    // мастер чекбокс
    if (master) {
      master.addEventListener("change", () => {
        tbody.querySelectorAll(".stmt-cb").forEach(cb => cb.checked = master.checked);
      });
    }

    // делегирование: Confirm / Review
    const table = container.querySelector("#statementsTable");
    table.addEventListener("click", async (e) => {
      const confirmBtn = e.target.closest(".btn-stmt-confirm");
      const reviewBtn  = e.target.closest(".btn-stmt-review");
      if (!confirmBtn && !reviewBtn) return;

      const row = e.target.closest("tr[data-id]");
      const id = row?.getAttribute("data-id");
      if (!id) return;

      const item = items.find(x => x._id === id);
      if (!item) return;

      if (reviewBtn) {
        return openStatementReviewModal(item);
      }

      if (confirmBtn) {
        try {
          confirmBtn.disabled = true;
          confirmBtn.textContent = "Confirming...";
          const r = await fetch("/api/statements/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
          });
          const resp = await r.json();
          if (!resp.success) throw new Error(resp.error || "Confirm failed");

          item.approved = true;
          const badge = row.querySelector(".status-cell .badge");
          if (badge) {
            badge.classList.remove("bg-secondary");
            badge.classList.add("bg-success");
            badge.textContent = "Approved";
          }
          row.classList.remove("table-warning", "table-danger");
          row.classList.add("table-success");
          confirmBtn.textContent = "Confirmed";
        } catch (err) {
          console.error(err);
          if (typeof Swal !== "undefined") Swal.fire("Ошибка", err.message || "Не удалось подтвердить", "error");
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Confirm";
        }
      }
    });

  } catch (err) {
    console.error("❌ Ошибка при загрузке стейтментов:", err);
    container.innerHTML = `<p class="text-danger">Ошибка при загрузке стейтментов</p>`;
  }
}

/* ===================== REVIEW-МОДАЛКА для существующего стейтмента ===================== */
function ensureWeekRangeOption(selectEl, weekRange) {
  if (!selectEl || !weekRange) return;
  const exists = Array.from(selectEl.options).some(o => o.value === weekRange);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = weekRange;
    opt.textContent = weekRange;
    selectEl.appendChild(opt);
  }
}

async function openStatementReviewModal(item) {
  openDriverStatementModal();

  const modal = document.getElementById("driverStatementModal");
  const title = modal.querySelector(".modal-title");
  const driverLabel = modal.querySelector('label[for="driverSelect"]');
  const driverSel = modal.querySelector("#driverSelect");
  const weekLabel = modal.querySelector('label[for="driverWeekRangeSelect"]');
  const weekSel = modal.querySelector("#driverWeekRangeSelect");
  const calcBtn = modal.querySelector('button[onclick="calculateDriverStatement()"]');
  const saveBtn = modal.querySelector('button[onclick="saveDriverStatement()"]');
  const results = modal.querySelector("#driverStatementResults");

  modal.dataset.mode = "review";
  modal.dataset.statementId = item._id || "";
  if (title) title.textContent = "Просмотр стейтмента";

  [driverLabel, driverSel, weekLabel, weekSel].forEach(el => { if (el) el.style.display = "none"; });
  if (calcBtn) calcBtn.style.display = "none";
  if (saveBtn) saveBtn.style.display = "none";

  let confirmWrap = modal.querySelector("#reviewConfirmWrap");
  if (confirmWrap) confirmWrap.remove();
  confirmWrap = document.createElement("div");
  confirmWrap.id = "reviewConfirmWrap";
  confirmWrap.className = "mt-3 d-flex gap-2";
  confirmWrap.innerHTML = `
    <button type="button" class="btn btn-success" id="reviewConfirmBtn">Confirm</button>
    <button type="button" class="btn btn-outline-secondary" id="reviewCloseBtn">Закрыть</button>
  `;
  results.parentElement.insertBefore(confirmWrap, results.nextSibling);

  try { generateWeekRanges("driverWeekRangeSelect"); } catch (e) {}
  ensureWeekRangeOption(weekSel, item.week_range);
  if (driverSel) driverSel.value = item.driver_id || "";
  if (weekSel) weekSel.value = item.week_range || "";

  if (results) results.innerHTML = "<p>Загрузка...</p>";
  await calculateDriverStatement();

  const confirmBtn = modal.querySelector("#reviewConfirmBtn");
  const closeBtn = modal.querySelector("#reviewCloseBtn");

  confirmBtn.onclick = async () => {
    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Confirming...";
      const r = await fetch("/api/statements/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modal.dataset.statementId })
      });
      const resp = await r.json();
      if (!resp.success) throw new Error(resp.error || "Confirm failed");
      closeDriverStatementModal();
      if (typeof loadDriverStatements === "function") await loadDriverStatements();
    } catch (err) {
      console.error("Confirm error:", err);
      if (typeof Swal !== "undefined") Swal.fire("Ошибка", err.message || "Не удалось подтвердить.", "error");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirm";
    }
  };

  closeBtn.onclick = () => closeDriverStatementModal();
}


async function saveDriverStatement() {
  const driverId  = document.getElementById("driverSelect").value;
  const weekRange = document.getElementById("driverWeekRangeSelect").value;
  const container = document.getElementById("driverStatementResults");

  if (!driverId || !weekRange) {
    alert("Сначала выберите водителя и неделю.");
    return;
  }

  // 1) Собираем актуальные данные для item (loads/fuel/scheme/inspections/expenses/mileage/calc)
  const item = await fetchAllForDriver(driverId, weekRange);
  if (!item) {
    alert("Не удалось собрать данные для сохранения.");
    return;
  }

  // 2) Инвойсы — перечитываем из UI (чтобы action/removed/amount ушли правильно)
  const expensesBlock = container.querySelector("#driverExpensesBlock");
  if (expensesBlock) {
    const uiItems = expensesBlock.querySelectorAll(".expense-item");
    const mapped = [];
    uiItems.forEach(li => {
      const id = li.getAttribute("data-expense-id");
      const removed = li.getAttribute("data-removed") === "1";
      const amount = Math.max(0, parseFloat((li.querySelector(".expense-amount")?.value || "0").trim() || "0"));
      const action = li.querySelector(".expense-action")?.value || "keep";
      const base = (item.expenses || []).find(e => (e._id === id || e._id?.$oid === id)) || {};
      mapped.push({
        _id: base._id || id,
        amount,
        category: base.category || "",
        note: base.note || "",
        date: base.date || "",
        photo_id: base.photo_id || null,
        action,
        removed
      });
    });
    item.expenses = mapped;
  }

  // 3) Выбор по грузам и экстра-стопам из чекбоксов
  const cbs = container.querySelectorAll(".load-checkbox");
  const selectedLoadIds = [];
  let selectedExtraStops = 0;
  let loadsGross = 0;
  cbs.forEach(cb => {
    if (cb.checked) {
      const oid = cb.getAttribute("data-load-oid");
      if (oid) selectedLoadIds.push(oid);
      loadsGross += parseFloat(cb.dataset.price || "0");
      selectedExtraStops += Number(cb.dataset.extraStops || 0);
    }
  });

  // 4) Пересчёт из стейта (его наполняет recalculateDriverSalary)
  const calc = (window.__statementState && window.__statementState.lastSingleCalc) || {};
  calc.extra_stops_total = selectedExtraStops;

  item.calc = {
    loads_gross: Number(calc.loadsGross ?? loadsGross) || 0,
    gross_add_from_expenses: Number(calc.grossAdd || 0),
    gross_deduct_from_expenses: Number(calc.grossDeduct || 0),
    gross_for_commission: Number(calc.grossForCommission ?? (loadsGross + (calc.grossAdd||0) - (calc.grossDeduct||0))) || 0,
    commission: Number(calc.commission || 0),
    scheme_deductions_total: Number(calc.schemeDeductionsTotal || 0),
    salary_add_from_expenses: Number(calc.salaryAdd || 0),
    salary_deduct_from_expenses: Number(calc.salaryDeduct || 0),
    extra_stops_total: Number(calc.extra_stops_total || selectedExtraStops),
    extra_stop_bonus_total: Number(calc.extraBonus || 0),
    final_salary: Number(calc.finalSalary || 0)
  };

  // 5) Тело запроса — добавили selected_load_ids
  const body = {
    week_range: weekRange,
    item: {
      driver_id: driverId,
      loads: item.loads || [],
      fuel: item.fuel || {qty:0, retail:0, invoice:0, cards:[]},
      inspections: item.inspections || [],
      expenses: item.expenses || [],
      scheme: item.scheme || {},
      mileage: item.mileage || {miles:0, meters:0, source:null, truck_id:null, samsara_vehicle_id:null},
      calc: item.calc,
      selected_load_ids: selectedLoadIds   // ← ключевое для отметки на бэке
    }
  };

  // 6) Сохранение
  const r = await fetch("/api/statements/save_single", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));

  if (!r.ok || !data.success) {
    console.error("Save single statement error:", data);
    alert(`Не удалось сохранить стейтмент: ${(data && (data.error || data.status)) || r.status}`);
    return;
  }

  alert("Стейтмент сохранён.");
  closeDriverStatementModal();
}
