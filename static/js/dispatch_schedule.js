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

  const modal = document.getElementById("driverBreakModalDispatch");
  const backdrop = document.getElementById("driverBreakBackdropDispatch");

  modal.classList.add("show");
  backdrop.classList.add("show");

  initDriverBreakDateRangeDispatch();
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
    const startIso = picker.startDate.toISOString();
    const endIso = picker.endDate.toISOString();
    const isReset = picker.startDate.isSame(moment(), 'day') && picker.endDate.isSame(moment(), 'day');

    if (isReset) {
      input.value = '';
      return;
    }

    console.log(`📅 Break range selected: ${startIso} to ${endIso}`);
  });
}

function bindLoadCellClicks() {
  // CSS внутри JS
  const style = document.createElement('style');
  style.textContent = `
    .selected-delivery {
      background-color: #0d6efd !important;
      color: white !important;
    }
    .selected-load-cell {
      outline: 3px solid #0d6efd;
      outline-offset: -3px;
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);

  let currentDriverId = null;

  const allCells = document.querySelectorAll("td.load-cell");

  allCells.forEach(cell => {
    const row = cell.closest("tr.driver-row");
    if (!row) return;
    const driverId = row.dataset.driverId;
    const hasDropdown = cell.querySelector(".dropdown");

    if (!hasDropdown) {
      // одиночная доставка
      const text = cell.textContent.trim();
      if (!text || cell.dataset.bound === "true") return;

      cell.dataset.bound = "true";
      cell.style.cursor = "pointer";

      cell.addEventListener("click", () => {
        // если переключили на другого водителя — сбросить всё
        if (currentDriverId && currentDriverId !== driverId) {
          clearAllSelections();
        }
        currentDriverId = driverId;

        cell.classList.toggle("selected-load-cell");
      });
    }
  });

  // dropdown deliveries
  document.querySelectorAll(".delivery-item").forEach(item => {
    if (item.dataset.bound === "true") return;
    item.dataset.bound = "true";

    item.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();

      const cell = item.closest("td");
      const row = cell.closest("tr.driver-row");
      const driverId = row.dataset.driverId;

      if (currentDriverId && currentDriverId !== driverId) {
        clearAllSelections();
      }
      currentDriverId = driverId;

      item.classList.toggle("selected-delivery");

      const anySelected = cell.querySelectorAll(".selected-delivery").length > 0;
      if (anySelected) {
        cell.classList.add("selected-load-cell");
      } else {
        cell.classList.remove("selected-load-cell");
      }
    });
  });

  function clearAllSelections() {
    document.querySelectorAll("td.load-cell").forEach(c => {
      c.classList.remove("selected-load-cell");
    });
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


//Правый клик на грузах
let selectedLoadCell = null;

function bindLoadContextMenuHandlers() {
  const menu = document.getElementById("loadContextMenu");

  document.addEventListener("contextmenu", function (e) {
    const cell = e.target.closest(".load-cell");
    if (!cell) return;

    // Проверка: есть ли груз (либо текст, либо .dropdown, либо .delivery-item)
    const hasDeliveryText = cell.textContent.trim() !== "";
    const hasDropdown = cell.querySelector(".dropdown");
    const hasDeliveryItem = cell.querySelector(".delivery-item");

    if (!hasDeliveryText && !hasDropdown && !hasDeliveryItem) return;

    e.preventDefault();
    selectedLoadCell = cell;

    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;
    menu.style.display = "block";
  });

  document.addEventListener("click", function () {
    menu.style.display = "none";
  });

  document.getElementById("excludeFromGrossBtn").addEventListener("click", () => {
    if (!selectedLoadCell) return;

    selectedLoadCell.classList.add("excluded-from-gross");
    selectedLoadCell.dataset.excludeFromGross = "true";

    console.log("🚫 Excluded load-cell from gross");

    menu.style.display = "none";
  });
}




