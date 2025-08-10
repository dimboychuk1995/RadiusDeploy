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

  // 1) Гросс из выбранных грузов
  const checkboxes = container.querySelectorAll(".load-checkbox");
  let loadsGross = 0;
  checkboxes.forEach(cb => {
    if (cb.checked) loadsGross += parseFloat(cb.dataset.price || "0");
  });

  // 2) Инвойсы: берём только не удалённые, суммы — из инпутов
  let grossAdd = 0;     // add_gross
  let grossDeduct = 0;  // deduct_gross
  let salaryAdd = 0;    // add_salary
  let salaryDeduct = 0; // deduct_salary
  let visibleTotal = 0; // сумма всех НЕ удалённых инвойсов (для отображения "Итого по инвойсам")

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
          case "keep":
          default: break;
        }
      }
    });

    // Обновим визуальный итог по инвойсам (с учётом удаления/правок)
    const totalEl = expensesBlock.querySelector("#expensesTotalVal");
    if (totalEl) totalEl.textContent = visibleTotal.toFixed(2);
  }

  const grossForCommission = loadsGross + grossAdd - grossDeduct;

  try {
    // 3) Схема комиссии
    const res = await fetch(`/api/driver_commission_scheme?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`);
    const data = await res.json();
    if (!data.success) {
      console.warn("Ошибка схемы зарплаты:", data.error);
      return;
    }

    // 4) Комиссия от откорректированного гросса
    let commission = 0;
    if (data.scheme_type === "percent") {
      const table = data.commission_table || [];
      if (table.length === 1) {
        commission = grossForCommission * (table[0].percent / 100);
      } else if (table.length > 1) {
        const matched = table
          .filter(row => grossForCommission >= row.from_sum)
          .sort((a, b) => b.from_sum - a.from_sum)[0];
        if (matched) {
          commission = grossForCommission * (matched.percent / 100);
        }
      }
    }

    // 5) Вычеты по схеме + корректировки ЗП из инвойсов
    const schemeDeductions = data.deductions || [];
    const schemeDeductionsTotal = schemeDeductions.reduce((sum, d) => sum + (d.amount || 0), 0);

    const finalSalary =
      commission
      - schemeDeductionsTotal
      - salaryDeduct
      + salaryAdd;

    // 6) Рендер блока
    const old = container.querySelector("#driverSalaryBlock");
    if (old) old.remove();

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
              <li>${d.type}: -$${(d.amount || 0).toFixed(2)}</li>
            `).join("")}
          </ul>
        ` : ""}
      </div>
    `;

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

      // Слушатели для пересчёта
      const expensesBlock = container.querySelector("#driverExpensesBlock");
      expensesBlock.querySelectorAll(".expense-action").forEach(sel => {
        sel.addEventListener("change", window.recalculateDriverSalary);
      });
      expensesBlock.querySelectorAll(".expense-amount").forEach(inp => {
        inp.addEventListener("input", window.recalculateDriverSalary);
      });

      // Удаление/восстановление инвойса (визуально и из расчёта)
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



// 📅 получить выбранных драйверов из модалки "All Drivers"
function getSelectedDriversFromModal() {
  const container = document.getElementById("allDriversResults");
  const cbs = container.querySelectorAll(".driver-select");
  return Array.from(cbs)
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.driverId);
}

// 🔁 утилита: запрос JSON
async function apiGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return await r.json();
}

// 👤 вытянуть все данные по одному водителю (5 запросов)
// 👤 вытянуть все данные по одному водителю (5 запросов) + нормализация инвойсов и расчёт зарплаты
async function fetchAllForDriver(driverId, weekRange) {
  const [start, end] = weekRange.split("-").map(s => s.trim());

  const [
    loadsRes,
    fuelRes,
    schemeRes,
    inspRes,
    expRes
  ] = await Promise.all([
    apiGet(`/api/driver_statement_loads?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`),
    apiGet(`/api/driver_fuel_summary?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`),
    apiGet(`/api/driver_commission_scheme?driver_id=${driverId}&week_range=${encodeURIComponent(weekRange)}`),
    apiGet(`/api/driver_inspections_by_range?driver_id=${driverId}&start_date=${start}&end_date=${end}`),
    apiGet(`/api/driver_expenses_by_range?driver_id=${driverId}&start_date=${start}&end_date=${end}`)
  ]);

  // 1) Нормализуем данные
  const loads = (loadsRes.success ? loadsRes.loads : []);
  const fuel  = (fuelRes.success ? fuelRes.fuel : { qty:0, retail:0, invoice:0, cards:[] });
  const scheme = (schemeRes.success ? {
    scheme_type: schemeRes.scheme_type,
    commission_table: schemeRes.commission_table || [],
    deductions: schemeRes.deductions || [],
    enable_inspection_bonus: !!schemeRes.enable_inspection_bonus,
    bonus_level_1: schemeRes.bonus_level_1 || 0,
    bonus_level_2: schemeRes.bonus_level_2 || 0,
    bonus_level_3: schemeRes.bonus_level_3 || 0
  } : null);
  const inspections = (inspRes.success ? inspRes.inspections : []);

  // Инвойсы: по умолчанию — action: "keep", removed: false, amount как в базе
  const expenses = (expRes.success ? expRes.expenses : []).map(e => ({
    _id: e._id,
    amount: Number(e.amount || 0),
    category: e.category || "",
    note: e.note || "",
    date: e.date || "",
    photo_id: e.photo_id || null,
    action: "keep",     // по умолчанию — "Оставить как есть"
    removed: false      // по умолчанию включён в стейтмент
  }));

  // 2) Расчёт зарплаты (на основе правил)
  const loadsGross = loads.reduce((sum, ld) => sum + Number(ld.price || 0), 0);

  // Корректировки от инвойсов: по умолчанию (keep) — нулевые эффекты
  let grossAdd = 0;     // add_gross
  let grossDeduct = 0;  // deduct_gross
  let salaryAdd = 0;    // add_salary
  let salaryDeduct = 0; // deduct_salary

  for (const exp of expenses) {
    if (exp.removed) continue; // если когда-то будем менять флаг — учтётся
    const amt = Number(exp.amount || 0);
    switch (exp.action) {
      case "add_gross":     grossAdd += amt; break;
      case "deduct_gross":  grossDeduct += amt; break;
      case "add_salary":    salaryAdd += amt; break;
      case "deduct_salary": salaryDeduct += amt; break;
      case "keep":
      default: break;
    }
  }

  const grossForCommission = loadsGross + grossAdd - grossDeduct;

  // Комиссия
  let commission = 0;
  if (scheme && scheme.scheme_type === "percent") {
    const table = scheme.commission_table || [];
    if (table.length === 1) {
      commission = grossForCommission * (Number(table[0].percent || 0) / 100);
    } else if (table.length > 1) {
      const matched = table
        .filter(row => grossForCommission >= Number(row.from_sum || 0))
        .sort((a, b) => Number(b.from_sum || 0) - Number(a.from_sum || 0))[0];
      if (matched) {
        commission = grossForCommission * (Number(matched.percent || 0) / 100);
      }
    }
  }

  // Вычеты по схеме
  const schemeDeductions = (scheme?.deductions || []);
  const schemeDeductionsTotal = schemeDeductions.reduce((s, d) => s + Number(d.amount || 0), 0);

  // Итог к выплате
  const finalSalary = commission - schemeDeductionsTotal - salaryDeduct + salaryAdd;

  // 3) Собираем расчётный блок для сохранения
  const calc = {
    loads_gross: Number(loadsGross.toFixed(2)),
    gross_add_from_expenses: Number(grossAdd.toFixed(2)),
    gross_deduct_from_expenses: Number(grossDeduct.toFixed(2)),
    gross_for_commission: Number(grossForCommission.toFixed(2)),
    commission: Number(commission.toFixed(2)),
    scheme_deductions_total: Number(schemeDeductionsTotal.toFixed(2)),
    salary_add_from_expenses: Number(salaryAdd.toFixed(2)),
    salary_deduct_from_expenses: Number(salaryDeduct.toFixed(2)),
    final_salary: Number(finalSalary.toFixed(2))
  };

  return {
    driver_id: driverId,
    week_range: weekRange,
    loads,
    fuel,
    scheme,
    inspections,
    // ВАЖНО: сохраняем инвойсы уже с action/removed/amount
    expenses,
    // И результаты расчёта
    calc
  };
}

// ▶️ главная кнопка "Рассчитать всем"
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

  // последовательно, чтобы не завалить бэкенд
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

  // сохраняем пачкой на сервере
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

    // ожидаем от бэка: { success: true, added, ignored, replaced }
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



async function loadDriverStatements() {
  const weekRange = document.getElementById("statementWeekRangeSelect").value || "";
  const container = document.getElementById("driverStatementsContainer");

  container.innerHTML = `<p>Загрузка...</p>`;

  let url = `/api/statements/list`;
  if (weekRange) {
    url += `?week_range=${encodeURIComponent(weekRange)}`;
  }

  const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;
  const debounce = (fn, ms = 200) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

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

    // Сортировка по компании, затем по имени
    const items = [...data.items].sort((a, b) => {
      const aComp = (a.hiring_company_name || "").toString();
      const bComp = (b.hiring_company_name || "").toString();
      const byCompany = aComp.localeCompare(bComp, undefined, { sensitivity: "base" });
      if (byCompany !== 0) return byCompany;
      const aDrv = (a.driver_name || "").toString();
      const bDrv = (b.driver_name || "").toString();
      return aDrv.localeCompare(bDrv, undefined, { sensitivity: "base" });
    });

    // Уникальные компании для селекта
    const companies = Array.from(new Set(items.map(x => x.hiring_company_name || "—")))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    // ——— красивый фильтр-блок ———
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

    // Рендер одной строки
    const buildRow = (it) => {
      const approvedBadge = it.approved
        ? `<span class="badge bg-success">Approved</span>`
        : `<span class="badge bg-secondary">Pending</span>`;

      const anyPositive =
        Number(it.monday_loads) > 0 ||
        Number(it.invoices_num) > 0 ||
        Number(it.inspections_num) > 0;

      let rowClass = "";
      if (it.approved) {
        rowClass = "table-success";           // approved -> зелёный
      } else {
        rowClass = anyPositive ? "table-danger" : "table-warning"; // pending -> красный/желтый
      }

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

    // Рендер по массиву + сводка
    const renderRows = (arr) => {
      tbody.innerHTML = arr.map(buildRow).join("");
      sumCountEl.textContent = arr.length;
      const totalSalary = arr.reduce((s, it) => s + (Number(it.salary) || 0), 0);
      sumTotalEl.textContent = fmtMoney(totalSalary);
      if (master) master.checked = false; // сбрасываем мастер при перерисовке
    };

    // Фильтрация
    const driverInput   = container.querySelector("#stmtFilterDriver");
    const companySelect = container.querySelector("#stmtFilterCompany");
    const activeOnlyCb  = container.querySelector("#stmtFilterActiveOnly");
    const resetBtn      = container.querySelector("#stmtFiltersReset");

    const applyFilters = () => {
      const q = (driverInput.value || "").trim().toLowerCase();
      const company = companySelect.value || "";
      const activeOnly = activeOnlyCb.checked;

      const filtered = items.filter(it => {
        if (q && !(it.driver_name || "").toLowerCase().includes(q)) return false;
        if (company && (it.hiring_company_name || "") !== company) return false;
        if (activeOnly) {
          const anyPos =
            Number(it.monday_loads) > 0 ||
            Number(it.invoices_num) > 0 ||
            Number(it.inspections_num) > 0;
          if (!anyPos) return false;
        }
        return true;
      });

      renderRows(filtered);
    };

    // Первичный рендер
    renderRows(items);

    // Слушатели
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

    // Мастер-чекбокс (работает по видимым строкам)
    if (master) {
      master.addEventListener("change", () => {
        tbody.querySelectorAll(".stmt-cb").forEach(cb => {
          cb.checked = master.checked;
        });
      });
    }

    // Делегирование событий: Confirm / Review
    const table = container.querySelector("#statementsTable");
    table.addEventListener("click", async (e) => {
      const confirmBtn = e.target.closest(".btn-stmt-confirm");
      const reviewBtn  = e.target.closest(".btn-stmt-review");
      if (!confirmBtn && !reviewBtn) return;

      const row = e.target.closest("tr[data-id]");
      const id = row?.getAttribute("data-id");
      if (!id) return;

      // Ищем актуальный элемент по id в исходном массиве
      const item = items.find(x => x._id === id);
      if (!item) return;

      if (reviewBtn) {
        if (typeof Swal !== "undefined") {
          await Swal.fire({
            title: "Statement Review",
            html: `
              <div style="text-align:left">
                <div><b>Driver:</b> ${item.driver_name || "—"}</div>
                <div><b>Company:</b> ${item.hiring_company_name || "—"}</div>
                <div><b>Week:</b> ${item.week_range || "—"}</div>
                <div><b>Truck:</b> ${item.truck_number || "—"}</div>
                <hr>
                <div><b>Monday Loads:</b> ${item.monday_loads ?? 0}</div>
                <div><b>Invoices:</b> ${item.invoices_num ?? 0}</div>
                <div><b>Inspections:</b> ${item.inspections_num ?? 0}</div>
                <div><b>Salary:</b> ${fmtMoney(item.salary)}</div>
                <hr>
                <div><b>Status:</b> ${item.approved ? "Approved" : "Pending"}</div>
              </div>
            `,
            confirmButtonText: "OK"
          });
        } else {
          alert(
            `Driver: ${item.driver_name || "—"}\n` +
            `Company: ${item.hiring_company_name || "—"}\n` +
            `Week: ${item.week_range || "—"}\n` +
            `Truck: ${item.truck_number || "—"}\n` +
            `Monday Loads: ${item.monday_loads ?? 0}\n` +
            `Invoices: ${item.invoices_num ?? 0}\n` +
            `Inspections: ${item.inspections_num ?? 0}\n` +
            `Salary: ${fmtMoney(item.salary)}\n` +
            `Status: ${item.approved ? "Approved" : "Pending"}`
          );
        }
        return;
      }

      if (confirmBtn) {
        try {
          confirmBtn.disabled = true;
          confirmBtn.innerText = "Confirming...";

          const r = await fetch("/api/statements/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
          });
          const resp = await r.json();

          if (!resp.success) {
            throw new Error(resp.error || "Confirm failed");
          }

          // Обновляем объект и UI
          item.approved = true;

          const badge = row.querySelector(".status-cell .badge");
          if (badge) {
            badge.classList.remove("bg-secondary");
            badge.classList.add("bg-success");
            badge.textContent = "Approved";
          }
          row.classList.remove("table-warning", "table-danger");
          row.classList.add("table-success");
          confirmBtn.innerText = "Confirmed";
        } catch (err) {
          console.error("Confirm error:", err);
          if (typeof Swal !== "undefined") {
            Swal.fire("Ошибка", err.message || "Не удалось подтвердить стейтмент.", "error");
          } else {
            alert("Не удалось подтвердить стейтмент.");
          }
          confirmBtn.disabled = false;
          confirmBtn.innerText = "Confirm";
        }
      }
    });

  } catch (err) {
    console.error("❌ Ошибка при загрузке стейтментов:", err);
    container.innerHTML = `<p class="text-danger">Ошибка при загрузке стейтментов</p>`;
  }
}




// === Ниже важный блок нужен для кнопки review ===



// === helper: убедиться, что нужный weekRange есть в select ===
function ensureWeekRangeOption(selectEl, weekRange) {
  if (!selectEl) return;
  const exists = Array.from(selectEl.options).some(o => o.value === weekRange);
  if (!exists && weekRange) {
    const opt = document.createElement("option");
    opt.value = weekRange;
    opt.textContent = weekRange;
    selectEl.appendChild(opt);
  }
}

// === Открыть модалку в режиме REVIEW для уже созданного стейтмента ===
async function openStatementReviewModal(item) {
  // открыть модалку и фон
  const modal = document.getElementById("driverStatementModal");
  const backdrop = document.getElementById("driverStatementBackdrop");
  modal.classList.add("show");
  backdrop.classList.add("show");

  // пометим режим
  modal.dataset.mode = "review";
  modal.dataset.statementId = item._id || "";

  // элементы модалки
  const title = modal.querySelector(".modal-title");
  const driverLabel = modal.querySelector('label[for="driverSelect"]');
  const driverSel = modal.querySelector("#driverSelect");
  const weekLabel = modal.querySelector('label[for="driverWeekRangeSelect"]');
  const weekSel = modal.querySelector("#driverWeekRangeSelect");
  const calcBtn = modal.querySelector('button[onclick="calculateDriverStatement()"]');
  const saveBtn = modal.querySelector('button[onclick="saveDriverStatement()"]');
  const results = modal.querySelector("#driverStatementResults");

  // заголовок
  if (title) title.textContent = "Просмотр стейтмента";

  // спрячем выборы и кнопку расчёта/сохранения
  [driverLabel, driverSel, weekLabel, weekSel].forEach(el => { if (el) el.style.display = "none"; });
  if (calcBtn) calcBtn.style.display = "none";
  if (saveBtn) saveBtn.style.display = "none";

  // добавим кнопку Confirm (если нет)
  let confirmWrap = modal.querySelector("#reviewConfirmWrap");
  if (!confirmWrap) {
    confirmWrap = document.createElement("div");
    confirmWrap.id = "reviewConfirmWrap";
    confirmWrap.className = "mt-3 d-flex gap-2";
    confirmWrap.innerHTML = `
      <button type="button" class="btn btn-success" id="reviewConfirmBtn">Confirm</button>
      <button type="button" class="btn btn-outline-secondary" id="reviewCloseBtn">Закрыть</button>
    `;
    // вставим под результатами
    results.parentElement.insertBefore(confirmWrap, results.nextSibling);
  } else {
    confirmWrap.style.display = "";
  }

  // заполним селекты нужными значениями "как будто выбраны"
  // (weekRange добавим, если его нет в списке)
  try { generateWeekRanges("driverWeekRangeSelect"); } catch (e) { /* если уже есть — ок */ }
  ensureWeekRangeOption(weekSel, item.week_range);
  if (driverSel) driverSel.value = item.driver_id || "";
  if (weekSel) weekSel.value = item.week_range || "";

  // посчитаем сразу
  results.innerHTML = "<p>Загрузка...</p>";
  await calculateDriverStatement();

  // обработчики кнопок
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

      // успех — закрыть и обновить список
      closeDriverStatementModal();
      if (typeof loadDriverStatements === "function") {
        await loadDriverStatements();
      }
    } catch (err) {
      console.error("Confirm error:", err);
      if (typeof Swal !== "undefined") {
        Swal.fire("Ошибка", err.message || "Не удалось подтвердить стейтмент.", "error");
      } else {
        alert("Не удалось подтвердить стейтмент.");
      }
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirm";
    }
  };

  closeBtn.onclick = () => closeDriverStatementModal();
}

// === Переопределяем закрытие: чистим режим REVIEW и возвращаем видимость ===
function closeDriverStatementModal() {
  const modal = document.getElementById("driverStatementModal");
  const backdrop = document.getElementById("driverStatementBackdrop");
  if (!modal) return;

  // снять show
  modal.classList.remove("show");
  backdrop.classList.remove("show");

  // если был режим review — вернуть всё как было
  if (modal.dataset.mode === "review") {
    const title = modal.querySelector(".modal-title");
    if (title) title.textContent = "Добавление стейтмента водителя";

    const driverLabel = modal.querySelector('label[for="driverSelect"]');
    const driverSel = modal.querySelector("#driverSelect");
    const weekLabel = modal.querySelector('label[for="driverWeekRangeSelect"]');
    const weekSel = modal.querySelector("#driverWeekRangeSelect");
    const calcBtn = modal.querySelector('button[onclick="calculateDriverStatement()"]');
    const saveBtn = modal.querySelector('button[onclick="saveDriverStatement()"]');
    const reviewWrap = modal.querySelector("#reviewConfirmWrap");
    const results = modal.querySelector("#driverStatementResults");

    [driverLabel, driverSel, weekLabel, weekSel].forEach(el => { if (el) el.style.display = ""; });
    if (calcBtn) calcBtn.style.display = "";
    if (saveBtn) saveBtn.style.display = "";
    if (reviewWrap) reviewWrap.style.display = "none";
    if (results) results.innerHTML = ""; // чистим контент

    delete modal.dataset.mode;
    delete modal.dataset.statementId;
  }
}

// === Обновлённая таблица: Review открывает модалку в режиме REVIEW ===
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

    // сортировка по компании, затем по имени
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
        // открыть ту же модалку, но в режиме REVIEW
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

          // обновить строку
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
