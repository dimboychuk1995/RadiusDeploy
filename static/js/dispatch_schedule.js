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
  const routeList = document.getElementById("routeListDispatch");
  const saveBtn = document.getElementById("saveConsolidationBtnDispatch");
  const loadsTableBody = document.getElementById("consolidatedLoadsBody");

  // Очистка
  routeList.innerHTML = "";
  loadsTableBody.innerHTML = "";
  if (saveBtn) saveBtn.style.display = "none";

  // Показ модалки
  modal.classList.add("show");
  backdrop.classList.add("show");

  // Стили (если ещё не добавлялись)
  if (!document.getElementById("order-badge-styles")) {
    const style = document.createElement("style");
    style.id = "order-badge-styles";
    style.textContent = `
      .order-badge{
        margin-left:8px; display:inline-flex; align-items:center; justify-content:center;
        min-width:20px; height:20px; padding:0 6px; border-radius:999px;
        background:#0d6efd; color:#fff; font-weight:600; font-size:12px;
      }
      .route-line{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
      .route-line .muted{ color:#6c757d; }
      .route-line .chip{ padding:2px 8px; border-radius:12px; background:#eef2ff; color:#374151; }
      .list-group-item.route-item{ display:flex; justify-content:space-between; align-items:center; }
    `;
    document.head.appendChild(style);
  }

  // Хелперы отображения
  const typeLabel = t => t === "pickup" ? "Пикап" : "Доставка";
  const safeBrokerName = b =>
    (b && typeof b === "object" && b.name) ? b.name :
    (typeof b === "string" ? b : "—");

  // Запрос к бэку
  fetch("/api/consolidation/prep", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ load_ids: loadIds }),
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      alert("❌ Ошибка загрузки данных для консолидации");
      return;
    }

    const loads = data.loads || [];
    const routePoints = Array.isArray(data.route_points) ? data.route_points : [];

    // Индекс груза по OID
    const byOid = {};
    loads.forEach(l => { byOid[String(l._id)] = l; });

    // Список маршрута
    routePoints.forEach(pt => {
      const li = document.createElement("li");
      li.className = "list-group-item route-item";

      const load = byOid[String(pt.load_id)] || {};
      const brokerName = safeBrokerName(load.broker);
      const loadNum = load.load_id || load.broker_load_id || "—";

      const left = document.createElement("div");
      left.className = "route-line";
      left.innerHTML = `
        <span class="addr"><strong>${pt.address || "—"}</strong></span>
        <span class="muted">—</span>
        <span class="date">${pt.date_text || "—"}</span>
        <span class="muted">—</span>
        <span class="time">${pt.time_text || ""}</span>
        <span class="muted">—</span>
        <span class="chip">${typeLabel(pt.type)}</span>
        <span class="muted">—</span>
        <span class="broker">${brokerName}</span>
        <span class="muted">—</span>
        <span class="load-num">${loadNum}</span>
      `;

      if (pt.order != null) {
        const badge = document.createElement("span");
        badge.className = "order-badge";
        badge.textContent = String(pt.order);
        left.appendChild(badge);
        li.dataset.order = String(pt.order);
      }

      // dataset для сохранения/карты/расчётов
      li.dataset.id          = String(pt.load_id || "");
      li.dataset.address     = String(pt.address || "");
      li.dataset.type        = String(pt.type || "");
      li.dataset.dateFromIso = String(pt.date_from_iso || "");
      li.dataset.dateToIso   = String(pt.date_to_iso || "");
      li.dataset.timeFrom    = String(pt.time_from || "");
      li.dataset.timeTo      = String(pt.time_to || "");
      li.dataset.lng         = (pt.lng != null ? String(pt.lng) : "");
      li.dataset.lat         = (pt.lat != null ? String(pt.lat) : "");

      li.appendChild(left);
      routeList.appendChild(li);
    });

    // Таблица грузов
    loads.forEach(load => {
      const tr = document.createElement("tr");
      const pickupAddresses = [
        ...(load.extra_pickup || []).map(p => p.address),
        load.pickup?.address
      ].filter(Boolean).join("<br>") || "—";
      const deliveryAddresses = [
        ...(load.extra_delivery || []).map(d => d.address),
        load.delivery?.address
      ].filter(Boolean).join("<br>") || "—";
      const price = parseFloat(load.total_price ?? load.price ?? 0);
      const miles = parseFloat(load.miles ?? 0);
      const rpm = miles ? (price / miles).toFixed(2) : "—";

      tr.innerHTML = `
        <td>${load.load_id || load.broker_load_id || load._id || "—"}</td>
        <td>${safeBrokerName(load.broker)}</td>
        <td>${pickupAddresses}</td>
        <td>${deliveryAddresses}</td>
        <td>${rpm}</td>
        <td>$${price.toFixed(2)}</td>
      `;
      loadsTableBody.appendChild(tr);
    });

    // Грузы для суммирования цены
    window.__consolidationLoads = loads;

    // Карта + DnD + линия + сводка
    initConsolidationMap()
      .then(() => {
        initSortableListsDispatch();
        setupPointClickOrderingDispatch();
        updateConsolidationMapRoute();
      })
      .catch(err => {
        console.error("Map init error:", err);
        initSortableListsDispatch();
        setupPointClickOrderingDispatch();
      });
  }) // ← закрываем .then(data => { ... })
  .catch(err => {
    console.error("❌ Ошибка при получении данных для консолидации:", err);
  });
}


function closeConsolidationModalDispatch() {
  document.getElementById("consolidationModalDispatch").classList.remove("show");
  document.getElementById("consolidationBackdropDispatch").classList.remove("show");
}

function initSortableListsDispatch() {
  const list = document.getElementById("routeListDispatch");
  if (!list) return;

  renumberRouteList();           // проставит бейджи 1..N
  updateConsolidationMapRoute(); // сразу построим линию и сводку

  new Sortable(list, {
    animation: 150,
    ghostClass: "sortable-ghost",
    onSort() {
      renumberRouteList();
      updateConsolidationMapRoute(); // пересчёт после dnd
    },
    onEnd() {
      renumberRouteList();
      updateConsolidationMapRoute();
    }
  });
}

function renumberRouteList() {
  const list = document.getElementById("routeListDispatch");
  const items = Array.from(list?.querySelectorAll("li.list-group-item.route-item") || []);
  const saveBtn = document.getElementById("saveConsolidationBtnDispatch");

  items.forEach((li, idx) => {
    li.dataset.order = String(idx + 1);
    // удалить старый бейдж
    li.querySelector(".order-badge")?.remove();
    // добавить новый бейдж в конец левой части
    const badge = document.createElement("span");
    badge.className = "order-badge";
    badge.textContent = String(idx + 1);
    li.querySelector(".route-line")?.appendChild(badge);
  });

  if (saveBtn) {
    saveBtn.style.display = items.length ? "inline-block" : "none";
  }
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

function setupPointClickOrderingDispatch() {
  const list = document.getElementById("routeListDispatch");
  const saveBtn = document.getElementById("saveConsolidationBtnDispatch");
  if (!list || !saveBtn) return;

  // Нумерация уже делает initSortableListsDispatch → renumberRouteList()

  saveBtn.onclick = () => {
    const items = Array.from(list.querySelectorAll("li.list-group-item.route-item"));

    // Формируем orderedPoints в текущем порядке
    const orderedPoints = items.map(li => ({
      address: li.dataset.address || "",
      // отдаём начало окна как scheduled_at (совместимо с текущим /save)
      scheduled_at: li.dataset.dateFromIso || li.dataset.scheduledAt || "",
      load_id: li.dataset.id || ""
      // при необходимости можно расширить: date_to_iso, time_from, time_to, type
    }));

    submitConsolidationOrderDispatch(orderedPoints);
  };
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




//all for consolidation 
// Глобальное состояние карты консолидации
let CONSOLIDATION_MAP = null;
let CONSOLIDATION_ROUTE_SOURCE_ID = "consolidation-route";
let CONSOLIDATION_ROUTE_LAYER_ID  = "consolidation-route-layer";
let CONSOLIDATION_MARKERS = [];

async function initConsolidationMap(center = [-89.4, 40.5], zoom = 4) {
  await ensureMapboxToken(); // ← ВАЖНО: токен до создания карты

  const container = document.getElementById("consolidationMap");
  if (!container) return;

  // Пересоздание карты, если была
  if (CONSOLIDATION_MAP) {
    try { CONSOLIDATION_MAP.remove(); } catch (e) {}
    CONSOLIDATION_MAP = null;
    CONSOLIDATION_MARKERS = [];
  }

  CONSOLIDATION_MAP = new mapboxgl.Map({
    container: "consolidationMap",
    style: "mapbox://styles/mapbox/streets-v12",
    center,
    zoom
  });

  // Дождаться загрузки стиля и добавить слои
  await new Promise((resolve) => {
    CONSOLIDATION_MAP.on("load", () => {
      if (!CONSOLIDATION_MAP.getSource(CONSOLIDATION_ROUTE_SOURCE_ID)) {
        CONSOLIDATION_MAP.addSource(CONSOLIDATION_ROUTE_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] }
        });
      }
      if (!CONSOLIDATION_MAP.getLayer(CONSOLIDATION_ROUTE_LAYER_ID)) {
        CONSOLIDATION_MAP.addLayer({
          id: CONSOLIDATION_ROUTE_LAYER_ID,
          type: "line",
          source: CONSOLIDATION_ROUTE_SOURCE_ID,
          paint: { "line-color": "#0d6efd", "line-width": 4 }
        });
      }
      resolve();
    });
  });
}

async function updateConsolidationMapRoute() {
  const map = CONSOLIDATION_MAP;
  const list = document.getElementById("routeListDispatch");
  if (!map || !list) return;

  // Собираем точки в текущем порядке DOM
  const pts = Array.from(list.querySelectorAll("li.list-group-item.route-item")).map(li => {
    const lng = parseFloat(li.dataset.lng || "NaN");
    const lat = parseFloat(li.dataset.lat || "NaN");
    return {
      type: li.dataset.type || "",
      address: li.dataset.address || "",
      load_oid: li.dataset.id || "",
      date_from_iso: li.dataset.dateFromIso || "",
      date_to_iso: li.dataset.dateToIso || "",
      time_from: li.dataset.timeFrom || "",
      time_to: li.dataset.timeTo || "",
      lng, lat
    };
  });

  // Снимаем старые маркеры
  CONSOLIDATION_MARKERS.forEach(m => { try { m.marker.remove(); } catch(e) {} });
  CONSOLIDATION_MARKERS = [];

  // Маркеры: пикапы — зелёные, деливери — красные
  const bounds = new mapboxgl.LngLatBounds();

  pts.forEach(p => {
    if (isFinite(p.lng) && isFinite(p.lat)) {
      const color = (p.type === "pickup") ? "#22c55e" : "#ef4444";
      const el = document.createElement("div");
      el.style.width = "12px";
      el.style.height = "12px";
      el.style.borderRadius = "50%";
      el.style.background = color;
      el.style.boxShadow = "0 0 0 2px #fff";
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
      CONSOLIDATION_MARKERS.push({ marker, type: p.type });
      bounds.extend([p.lng, p.lat]);
    }
  });

  // Подгоняем камеру
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 40, duration: 300 });
  }

  // Рисуем линию маршрута по дорогам (Mapbox Directions). Если координат <2 — очищаем.
  const coords = pts.filter(p => isFinite(p.lng) && isFinite(p.lat)).map(p => [p.lng, p.lat]);

  let miles = 0;
  if (coords.length >= 2) {
    const geojson = await fetchDirectionsGeoJSON(coords); // едет по дорогам
    if (geojson) {
      map.getSource(CONSOLIDATION_ROUTE_SOURCE_ID)?.setData(geojson);
      miles = (geojson.properties?.distance_miles) || 0;
    } else {
      // fallback: прямая линия по шаровой дистанции
      miles = haversineTotalMiles(coords);
      map.getSource(CONSOLIDATION_ROUTE_SOURCE_ID)?.setData({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {}
        }]
      });
    }
  } else {
    map.getSource(CONSOLIDATION_ROUTE_SOURCE_ID)?.setData({ type: "FeatureCollection", features: [] });
  }

  // Считаем RPM = сумма цен / мили (цены берём по уникальным грузам из таблицы loads, сохранённой при открытии модалки)
  const priceTotal = getConsolidationTotalPrice();
  const rpm = miles > 0 ? (priceTotal / miles) : 0;

  // Обновляем сводку
  document.getElementById("summaryMiles").textContent = miles.toFixed(2);
  document.getElementById("summaryRPM").textContent   = isFinite(rpm) ? rpm.toFixed(2) : "—";
}


async function fetchDirectionsGeoJSON(coords) {
  try {
    // Mapbox Directions: максимум 25 точек. Если больше — можно чанкать, но обычно хватает.
    const accessToken = mapboxgl.accessToken;
    const coordStr = coords.map(c => `${c[0]},${c[1]}`).join(";");
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&access_token=${accessToken}`;
    const res = await fetch(url);
    const json = await res.json();
    const route = (json.routes && json.routes[0]) || null;
    if (!route) return null;

    const meters = route.distance || 0;
    const miles = meters * 0.000621371;

    return {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: route.geometry,
        properties: { distance_miles: miles }
      }],
      properties: { distance_miles: miles }
    };
  } catch (e) {
    console.error("Directions error:", e);
    return null;
  }
}

function haversineTotalMiles(coords) {
  const R = 3958.7613; // радиус Земли в милях
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    total += R * c;
  }
  return total;
}

// Сумма цен по уникальным грузам (берём из таблицы, которую рисуем в модалке)
function getConsolidationTotalPrice() {
  // Можем хранить в глобале, установленном в startConsolidationModal
  if (window.__consolidationLoads && Array.isArray(window.__consolidationLoads)) {
    const byOid = {};
    window.__consolidationLoads.forEach(l => {
      const oid = String(l._id || l.id || "");
      if (!oid) return;
      if (!byOid[oid]) {
        const price = parseFloat(l.total_price ?? l.price ?? 0) || 0;
        byOid[oid] = price;
      }
    });
    return Object.values(byOid).reduce((a,b) => a+b, 0);
  }
  return 0;
}


async function ensureMapboxToken() {
  // 1) проверяем наличие Mapbox GL
  if (typeof window === "undefined" || typeof window.mapboxgl === "undefined") {
    throw new Error("Mapbox GL JS is not loaded");
  }

  // 2) если токен уже есть — вернуть его
  if (mapboxgl.accessToken && String(mapboxgl.accessToken).trim().length > 0) {
    return mapboxgl.accessToken;
  }

  // 3) пробуем разные источники токена
  var token = "";

  // A) глобальная переменная из шаблона
  if (window.MAPBOX_TOKEN && String(window.MAPBOX_TOKEN).trim().length > 0) {
    token = String(window.MAPBOX_TOKEN).trim();
  }

  // B) <meta name="mapbox-token" content="...">
  if (!token) {
    var meta = document.querySelector('meta[name="mapbox-token"]');
    if (meta && meta.content && meta.content.trim().length > 0) {
      token = meta.content.trim();
    }
  }

  // C) API: /api/integrations/mapbox_token
  if (!token) {
    var res = await fetch("/api/integrations/mapbox_token", {
      method: "GET",
      headers: { "Accept": "application/json" },
      credentials: "same-origin"
    });

    if (!res.ok) {
      var text = "";
      try { text = await res.text(); } catch (e) {}
      throw new Error("Mapbox token fetch failed: HTTP " + res.status + " " + (text ? text.slice(0,120) : ""));
    }

    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error("Mapbox token fetch returned non-JSON");
    }

    var apiToken = data && data.token ? String(data.token).trim() : "";
    var success = data && data.success ? true : false;

    if (!success || !apiToken) {
      var errMsg = (data && data.error) ? data.error : "empty token";
      throw new Error("Mapbox token missing: " + errMsg);
    }

    token = apiToken;
  }

  // 4) устанавливаем токен и возвращаем
  mapboxgl.accessToken = token;
  return token;
}