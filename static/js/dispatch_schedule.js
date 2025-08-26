function initDispatchSchedule() {
  bindDispatcherToggleHandlers();
  bindDriverContextMenuHandlers();
  bindLoadCellClicks();
  initDriverScheduleWeekNavigation();
  calculateAndBindDriverAmounts();
  bindLoadContextMenuHandlers();
  }

function initDriverScheduleWeekNavigation() {
  let currentOffset = 0;

  const prevBtn = document.getElementById("prevWeekBtn");
  const nextBtn = document.getElementById("nextWeekBtn");
  const currentBtn = document.getElementById("currentWeekBtn");

  if (prevBtn) {
    prevBtn.onclick = () => {
      currentOffset -= 1;
      loadScheduleFragment();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      currentOffset += 1;
      loadScheduleFragment();
    };
  }

  if (currentBtn) {
    currentBtn.onclick = () => {
      currentOffset = 0;
      loadScheduleFragment();
    };
  }

  function loadScheduleFragment() {
    const weekStart = moment().add(currentOffset, 'weeks').startOf('isoWeek');
    const start = weekStart.format("YYYY-MM-DD");
    const end = moment(weekStart).add(6, 'days').format("YYYY-MM-DD");

    fetch(`/fragment/dispatch_schedule?start=${start}&end=${end}`)
      .then(response => response.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const newContent = doc.querySelector("#dispatch-table-wrapper");
        const container = document.querySelector("#dispatch-table-wrapper");
        if (newContent && container) {
          container.innerHTML = newContent.innerHTML;
        }

        bindDispatcherToggleHandlers();
        bindDriverContextMenuHandlers();
        bindLoadCellClicks();
        updateWeekLabel();
      })
      .catch(err => console.error("Ошибка при загрузке фрагмента:", err));
  }

  function updateWeekLabel() {
    const start = moment().add(currentOffset, 'weeks').startOf('isoWeek');
    const end = moment(start).add(6, 'days');
    const label = document.getElementById("weekRangeLabel");
    if (label) {
      label.textContent = `${start.format("MMM D")} – ${end.format("MMM D, YYYY")}`;
    }
  }

  // при первой инициализации
  updateWeekLabel();
}


function bindDispatcherToggleHandlers() {
  const headers = document.querySelectorAll(".dispatcher-header");

  headers.forEach(header => {
    if (header.dataset.bound === "true") return;
    header.dataset.bound = "true";

    const dispatcherId = header.dataset.dispatcher;
    const driverRows = document.querySelectorAll(`.driver-row[data-dispatcher="${dispatcherId}"]`);

    header.addEventListener("click", e => {
      if (e.target.tagName === 'A') return;
      toggleDriverRows(driverRows);
    });
  });
}

function toggleDriverRows(driverRows) {
  if (!driverRows.length) return;

  const isHidden = getComputedStyle(driverRows[0]).display === "none";

  driverRows.forEach(row => {
    row.style.display = isHidden ? "table-row" : "none";
  });
}


let selectedDriverId = null;

function bindDriverContextMenuHandlers() {
  const menu = document.getElementById("driverContextMenu");

  document.addEventListener("contextmenu", function (e) {
    const td = e.target.closest("td");
    const row = e.target.closest(".driver-row");

    // Работает только если клик был по первой ячейке (имени)
    if (!td || !row || td.cellIndex !== 0) return;

    e.preventDefault();

    selectedDriverId = row.dataset.driverId || null;
    if (!selectedDriverId) return;

    // Показ контекстного меню
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;
    menu.style.display = "block";
  });

  document.addEventListener("click", function () {
    menu.style.display = "none";
  });

  document.getElementById("setBreakBtn").addEventListener("click", () => {
    openDriverBreakModalDispatch(selectedDriverId);
  });

  document.getElementById("showOnMapBtn").addEventListener("click", () => {
    openDriverMapModal?.(selectedDriverId);
  });
}

function openDriverBreakModalDispatch(driverId) {
  if (!driverId) return;

  window.currentBreakDriverId = driverId; // ⬅️ обязательно

  const modal = document.getElementById("driverBreakModalDispatch");
  const backdrop = document.getElementById("driverBreakBackdropDispatch");

  modal.classList.add("show");
  backdrop.classList.add("show");

  initDriverBreakDateRangeDispatch();
  initDriverBreakFormListenerDispatch(); // тоже важно
}

function closeDriverBreakModalDispatch() {
  const modal = document.getElementById("driverBreakModalDispatch");
  const backdrop = document.getElementById("driverBreakBackdropDispatch");

  modal.classList.remove("show");
  backdrop.classList.remove("show");
}

function initDriverBreakDateRangeDispatch() {
  const input = document.getElementById("breakDateRangeDispatch");
  if (!input) return;

  const today = moment().startOf('day');
  const todayPlus3 = moment().add(2, 'days').endOf('day');
  const todayPlus7 = moment().add(6, 'days').endOf('day');
  const nextWeekStart = moment().add(1, 'weeks').startOf('isoWeek');
  const nextWeekEnd = moment().add(1, 'weeks').endOf('isoWeek');

  $(input).daterangepicker({
    startDate: today,
    endDate: todayPlus3,
    showDropdowns: true,
    autoApply: true,
    linkedCalendars: false,
    alwaysShowCalendars: true,
    opens: 'center',
    showCustomRangeLabel: true,
    locale: {
      format: 'MM / DD / YYYY',
      cancelLabel: 'CANCEL',
      daysOfWeek: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      monthNames: moment.months(),
      firstDay: 1
    },
    ranges: {
      '3 дня от сегодня': [today, todayPlus3],
      'Неделя от сегодня': [today, todayPlus7],
      'Вся следующая неделя': [nextWeekStart, nextWeekEnd],
      'Сброс': [moment(), moment()]
    }
  });

  $(input).on('apply.daterangepicker', function (ev, picker) {
    const startFormatted = picker.startDate.startOf('day').toISOString();
    const endFormatted = picker.endDate.endOf('day').toISOString();  // 🔧 конец дня

    input.dataset.startDate = startFormatted;
    input.dataset.endDate = endFormatted;

    console.log(`📅 Break range selected: ${startFormatted} to ${endFormatted}`);
  });
}

function initDriverBreakFormListenerDispatch() {
  const form = document.getElementById('driverBreakFormDispatch');
  if (!form || form.dataset.bound === 'true') return;

  form.dataset.bound = 'true';

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const reason = document.getElementById('breakReasonDispatch').value;
    const input = document.getElementById("breakDateRangeDispatch");
    const startDate = input.dataset.startDate;
    const endDate = input.dataset.endDate;
    const driverId = window.currentBreakDriverId;

    if (!driverId || !reason || !startDate || !endDate) {
      return Swal.fire("Ошибка", "Все поля обязательны", "error");
    }

    const res = await fetch('/api/drivers/break', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driver_id: driverId,
        reason,
        start_date: startDate,
        end_date: endDate
      })
    });

    const json = await res.json();
    if (json.success) {
      Swal.fire("Успех", "Брейк успешно сохранён", "success");
      closeDriverBreakModalDispatch();
    } else {
      Swal.fire("Ошибка", json.error || "Не удалось сохранить", "error");
    }
  });
}



function bindLoadCellClicks() {
  // CSS только для «чипов» грузов и их выбранного состояния
  const styleId = 'dispatch-select-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .delivery-chip {
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        line-height: 1.2;
        display: inline-block;
      }
      .selected-delivery {
        background-color: #0d6efd !important;
        color: #fff !important;
      }
    `;
    document.head.appendChild(style);
  }

  let currentDriverId = null;

  // Больше не используем клики по всей ячейке — только по конкретным грузам
  document.querySelectorAll(".delivery-item").forEach(item => {
    if (item.dataset.bound === "true") return;
    item.dataset.bound = "true";

    item.addEventListener("click", e => {
      e.preventDefault?.();
      e.stopPropagation();

      const row = item.closest("tr.driver-row");
      const driverId = row?.dataset.driverId;

      // Если переключились на другого водителя — очистить предыдущие выборы
      if (currentDriverId && currentDriverId !== driverId) {
        clearAllSelections();
      }
      currentDriverId = driverId || null;

      // Переключаем выбор ТОЛЬКО на этом грузе
      item.classList.toggle("selected-delivery");

      // НИКАКОЙ рамки у ячейки не ставим
    });
  });

  function clearAllSelections() {
    document.querySelectorAll(".delivery-item").forEach(i => {
      i.classList.remove("selected-delivery");
    });
    currentDriverId = null;
  }
}

function calculateAndBindDriverAmounts() {
  const rows = document.querySelectorAll("tr.driver-row");
  rows.forEach(row => {
    const driverId = row.dataset.driverId;
    let total = 0;

    // Собираем все delivery-item с ценой
    const deliveries = row.querySelectorAll(".delivery-item[data-amount]");
    deliveries.forEach(item => {
      const amount = parseFloat(item.dataset.amount);
      if (!isNaN(amount)) {
        total += amount;
      }
    });

    // Сохраняем в data-атрибут и навешиваем tooltip
    row.dataset.totalAmount = total.toFixed(2);

    const nameCell = row.querySelector("td:first-child");
    if (nameCell) {
      nameCell.addEventListener("mouseenter", () => {
        showTooltip(nameCell, `Total: $${total.toFixed(2)}`);
      });
      nameCell.addEventListener("mouseleave", hideTooltip);
    }
  });
}

let tooltipEl = null;

function showTooltip(target, text) {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.style.position = "absolute";
    tooltipEl.style.background = "#333";
    tooltipEl.style.color = "#fff";
    tooltipEl.style.padding = "4px 8px";
    tooltipEl.style.borderRadius = "4px";
    tooltipEl.style.fontSize = "12px";
    tooltipEl.style.zIndex = "9999";
    tooltipEl.style.pointerEvents = "none";
    document.body.appendChild(tooltipEl);
  }

  tooltipEl.textContent = text;
  const rect = target.getBoundingClientRect();
  tooltipEl.style.top = `${rect.top + window.scrollY - 30}px`;
  tooltipEl.style.left = `${rect.left + window.scrollX}px`;
  tooltipEl.style.display = "block";
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.style.display = "none";
  }
}




/**
 * Обрабатывает правый клик по ячейкам с грузами.
 * Показывает меню с опциями:
 * - "Не учитывать в гросс"
 * - "Консолидировать грузы" (только если выделена хотя бы одна)
 */

let selectedLoadCell = null;
let selectedConsolidationCells = [];


function bindLoadContextMenuHandlers() {
  const menu = document.getElementById("loadContextMenu");
  const excludeBtn = document.getElementById("excludeFromGrossBtn");
  const consolidateBtn = document.getElementById("consolidateLoadsBtn");

  let selectedLoadCell = null;

  document.addEventListener("contextmenu", function (e) {
    const cell = e.target.closest(".load-cell");
    if (!cell) return;

    // Проверка: есть ли внутри хоть что-то относящееся к грузам
    const hasDeliveryText = cell.textContent.trim() !== "";
    const hasDropdown = cell.querySelector(".dropdown");
    const hasDeliveryItem = cell.querySelector(".delivery-item");

    if (!hasDeliveryText && !hasDropdown && !hasDeliveryItem) return;

    e.preventDefault();
    selectedLoadCell = cell;

    // --- ВАЖНО: считаем выделенные ЧИПЫ грузов, а не ячейки ---
    const selectedDeliveries = Array.from(document.querySelectorAll(".delivery-item.selected-delivery"));

    // Уникальные load_id среди выбранных чипов
    const uniqueLoadIds = Array.from(
      new Set(
        selectedDeliveries
          .map(it => it.dataset.loadId)
          .filter(Boolean)
      )
    );

    // Уникальные водители среди выбранных чипов
    const uniqueDriverIds = Array.from(
      new Set(
        selectedDeliveries
          .map(it => it.dataset.driverId)
          .filter(Boolean)
      )
    );

    // Водитель строки, по которой кликнули правой кнопкой
    const clickedRow = cell.closest(".driver-row");
    const clickedDriverId = clickedRow?.dataset.driverId || null;

    // Условие: выбрано ≥2 разных грузов, все у одного водителя,
    // и правый клик был в строке этого же водителя
    const canConsolidate =
      uniqueLoadIds.length >= 2 &&
      uniqueDriverIds.length === 1 &&
      clickedDriverId &&
      uniqueDriverIds[0] === clickedDriverId;

    // Показ/скрытие опции "Консолидировать грузы"
    consolidateBtn.style.display = canConsolidate ? "block" : "none";

    // Показ контекстного меню у курсора
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;
    menu.style.display = "block";

    // Сохраняем актуальный набор load_ids для обработчика кнопки
    menu.dataset.consolidateLoadIds = JSON.stringify(uniqueLoadIds);
  });

  // Клик вне — закрываем меню
  document.addEventListener("click", function () {
    menu.style.display = "none";
  });

  // 🚫 Не учитывать в гросс — помечаем именно ячейку, как и раньше
  excludeBtn.addEventListener("click", () => {
    if (!selectedLoadCell) return;

    selectedLoadCell.classList.add("excluded-from-gross");
    selectedLoadCell.dataset.excludeFromGross = "true";

    console.log("🚫 Исключена ячейка из gross");
    menu.style.display = "none";
  });

  // 🔗 Консолидировать грузы — используем load_ids из выбранных ЧИПов
  consolidateBtn.addEventListener("click", () => {
    const serialized = menu.dataset.consolidateLoadIds || "[]";
    let allLoadIds = [];
    try {
      allLoadIds = JSON.parse(serialized);
    } catch (e) {
      allLoadIds = [];
    }

    if (!allLoadIds.length) return;

    console.log("🔗 Консолидация грузов:", allLoadIds);
    startConsolidationModal(allLoadIds);

    menu.style.display = "none";
  });
}



//модалка консолидации грузов
function startConsolidationModal(loadIds) {
  if (!Array.isArray(loadIds) || loadIds.length === 0) {
    console.warn("🚫 Нет loadIds для консолидации");
    return;
  }

  const modal = document.getElementById("consolidationModalDispatch");
  const backdrop = document.getElementById("consolidationBackdropDispatch");
  const pickupList = document.getElementById("pickupListDispatch");
  const deliveryList = document.getElementById("deliveryListDispatch");
  const saveBtn = document.getElementById("saveConsolidationBtnDispatch");
  const loadsTableBody = document.getElementById("consolidatedLoadsBody");

  // Очистка
  pickupList.innerHTML = "";
  deliveryList.innerHTML = "";
  loadsTableBody.innerHTML = "";
  saveBtn.style.display = "none";

  // Показ модалки
  modal.classList.add("show");
  backdrop.classList.add("show");

  // Стили для бейджей порядка (один раз на страницу)
  if (!document.getElementById("order-badge-styles")) {
    const style = document.createElement("style");
    style.id = "order-badge-styles";
    style.textContent = `
      .order-badge{
        margin-left:8px;
        display:inline-flex;align-items:center;justify-content:center;
        min-width:20px;height:20px;padding:0 6px;border-radius:999px;
        background:#0d6efd;color:#fff;font-weight:600;font-size:12px;
      }
    `;
    document.head.appendChild(style);
  }

  console.log("📤 Отправка запроса на /api/consolidation/prep с load_ids:", loadIds);

  fetch("/api/consolidation/prep", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ load_ids: loadIds }),
  })
    .then(res => res.json())
    .then(data => {
      console.log("📥 Ответ от /api/consolidation/prep:", data);

      if (!data.success) {
        alert("❌ Ошибка загрузки данных для консолидации");
        return;
      }

      const pickups = data.pickup_points || [];
      const deliveries = data.delivery_points || [];
      const loads = data.loads || [];

      // ➜ Рисуем списки с учётом order (если он пришёл)
      const makeLi = (point) => {
        const li = document.createElement("li");
        li.className = "list-group-item";
        // Оставляем только адрес (как и раньше), не добавляя дату в текст,
        // чтобы не ломать текущую логику извлечения scheduled_at.
        li.textContent = point.address || "";
        li.dataset.id = point.load_id || "";
        if (point.order != null) {
          li.dataset.order = String(point.order);
          const badge = document.createElement("span");
          badge.className = "order-badge";
          badge.innerText = String(point.order);
          li.appendChild(badge);
        }
        return li;
      };

      pickups.forEach(p => pickupList.appendChild(makeLi(p)));
      deliveries.forEach(d => deliveryList.appendChild(makeLi(d)));

      if (pickups.length > 0 || deliveries.length > 0) {
        // Отрисовать таблицу грузов — без изменений
        loads.forEach((load, idx) => {
          const tr = document.createElement("tr");
          const id = load._id || load.id || "—";
          const broker = load.broker?.name || "—";
          const price = parseFloat(load.total_price ?? load.price ?? 0);
          const miles = parseFloat(load.miles ?? 0);
          const rpm = miles ? (price / miles).toFixed(2) : "—";

          const pickupAddresses = [
            ...(load.extra_pickup || []),
            ...(load.pickup ? [load.pickup] : [])
          ].map(p => p.address).join(" → ") || "—";

          const deliveryAddresses = [
            ...(load.delivery ? [load.delivery] : []),
            ...(load.extra_delivery || [])
          ].map(d => d.address).join(" → ") || "—";

          tr.innerHTML = `
            <td>${id}</td>
            <td>${broker}</td>
            <td>${pickupAddresses}</td>
            <td>${deliveryAddresses}</td>
            <td>${rpm}</td>
            <td>$${price.toFixed(2)}</td>
          `;
          loadsTableBody.appendChild(tr);
        });
      }

      renderConsolidatedLoadsTable(loads);
      initSortableListsDispatch();

      // ⬇️ ВАЖНО: инициализируем обработчики кликов с автосидированием порядка из бэка
      setupPointClickOrderingDispatch(true);
    })
    .catch(err => {
      console.error("❌ Ошибка при получении грузов для консолидации:", err);
    });
}


function closeConsolidationModalDispatch() {
  document.getElementById("consolidationModalDispatch").classList.remove("show");
  document.getElementById("consolidationBackdropDispatch").classList.remove("show");
}

function initSortableListsDispatch() {
  new Sortable(document.getElementById("pickupListDispatch"), {
    animation: 150,
    ghostClass: 'sortable-ghost'
  });

  new Sortable(document.getElementById("deliveryListDispatch"), {
    animation: 150,
    ghostClass: 'sortable-ghost'
  });
}

function renderConsolidatedLoadsTable(loads) {
  const tbody = document.getElementById("consolidatedLoadsBody");
  tbody.innerHTML = "";

  loads.forEach(load => {
    const row = document.createElement("tr");

    const pickupAddresses = [
      ...(load.extra_pickup || []).map(p => p.address),
      load.pickup?.address
    ].filter(Boolean).join("<br>");

    const deliveryAddresses = [
      ...(load.extra_delivery || []).map(d => d.address),
      load.delivery?.address
    ].filter(Boolean).join("<br>");

    // Надёжное вычисление RPM
    const rpm = load.RPM ? parseFloat(load.RPM).toFixed(2) : "—";

    row.innerHTML = `
      <td>${load.load_id || ""}</td>
      <td>${load.broker_load_id || ""}</td>
      <td>${pickupAddresses}</td>
      <td>${deliveryAddresses}</td>
      <td>${rpm}</td>
      <td>${parseFloat(load.total_price || load.price || 0).toFixed(2)}</td>
    `;
    tbody.appendChild(row);
  });
}

function setupPointClickOrderingDispatch(seedFromBackend = false) {
  const allItems = Array.from(document.querySelectorAll('#pickupListDispatch li, #deliveryListDispatch li'));
  const saveBtn = document.getElementById('saveConsolidationBtnDispatch');

  // Текущее выбранное упорядочивание
  const selectionOrder = [];

  // Проставляет бейджи согласно текущему selectionOrder
  function redrawBadges() {
    // Снимаем старые бейджи
    allItems.forEach(li => li.querySelector('.order-badge')?.remove());
    // Рендерим новые по порядку selectionOrder
    selectionOrder.forEach((li, idx) => {
      const badge = document.createElement('span');
      badge.className = 'order-badge';
      badge.innerText = String(idx + 1);
      li.appendChild(badge);
    });
  }

  // ——— Автосидирование из бэка (если order пришёл) ———
  if (seedFromBackend) {
    const withOrder = allItems.filter(li => li.dataset.order != null && li.dataset.order !== "");
    const withoutOrder = allItems.filter(li => !(li.dataset.order != null && li.dataset.order !== ""));

    // Сортируем элементы с order по возрастанию
    withOrder.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));

    // Наполняем selectionOrder сначала бэковским порядком, далее — как кликнут пользователь
    withOrder.forEach(li => selectionOrder.push(li));

    // Отрисовываем бейджи 1..N согласно текущему selectionOrder
    redrawBadges();

    // Если бэк дал порядок на все точки — сразу показываем кнопку "Сохранить"
    saveBtn.style.display = (selectionOrder.length === allItems.length) ? 'inline-block' : 'none';

    // Остальные остаются без номера до клика пользователя
    // (никаких бейджей не добавляем для них на этом шаге)
  } else {
    // По умолчанию — скрыть кнопку, пока пользователь не отметит все точки
    saveBtn.style.display = 'none';
  }

  // ——— Логика кликов пользователя (добавить/удалить из порядка) ———
  allItems.forEach(item => {
    item.addEventListener('click', () => {
      const i = selectionOrder.indexOf(item);
      if (i !== -1) {
        // Удаляем из порядка
        selectionOrder.splice(i, 1);
      } else {
        // Добавляем в конец
        selectionOrder.push(item);
      }

      redrawBadges();
      saveBtn.style.display = selectionOrder.length === allItems.length ? 'inline-block' : 'none';
    });
  });

  // ——— Кнопка "Сохранить": формируем payload из selectionOrder ———
  saveBtn.addEventListener('click', () => {
    const result = selectionOrder.map(li => ({
      // адрес оставляем как раньше
      address: li.innerText.replace(/\s+—\s+\d{2}\/\d{2}\/\d{4}$/, '').trim(),
      // пытаемся выдернуть дату из текста, как и было
      scheduled_at: li.innerText.match(/\d{2}\/\d{2}\/\d{4}$/)?.[0],
      load_id: li.dataset.id
    }));

    submitConsolidationOrderDispatch(result);
  });
}


async function submitConsolidationOrderDispatch(orderedPoints) {
  const cleanedPoints = orderedPoints
    .map(p => ({
      address: p.address?.trim(),
      scheduled_at: p.scheduled_at || p.date || '',
      load_id: p.load_id || null
    }))
    .filter(p => p.load_id && p.address);

  const loadIds = [...new Set(cleanedPoints.map(p => p.load_id))];

  if (!loadIds.length) {
    alert("❌ Нет валидных грузов для консолидации.");
    return;
  }

  try {
    const res = await fetch('/api/consolidation/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        load_ids: loadIds,
        route_points: cleanedPoints
      })
    });

    const json = await res.json();
    if (json.success) {
      closeConsolidationModalDispatch();
      alert(`✅ Грузы успешно консолидированы\n🚚 Miles: ${json.miles}\n📊 RPM: ${json.rpm}`);
    } else {
      alert("Ошибка сервера: " + json.error);
    }
  } catch (err) {
    console.error(err);
    alert("❌ Ошибка отправки запроса на сервер.");
  }
}




