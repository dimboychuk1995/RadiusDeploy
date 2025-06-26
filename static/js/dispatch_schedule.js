function initDispatchSchedule() {
  bindDispatcherToggleHandlers();
  bindDriverContextMenuHandlers();
  bindLoadCellClicks();
  initDriverScheduleWeekNavigation();
}

function initDriverScheduleWeekNavigation() {
  let currentWeekStart = moment().startOf('isoWeek');

  function renderWeekHeaders() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const headerRow = document.querySelector("table thead tr");
    if (!headerRow) return;

    // Удаляем старые day-ячейки (оставляем первые 4)
    while (headerRow.children.length > 4) {
      headerRow.removeChild(headerRow.lastChild);
    }

    for (let i = 0; i < 7; i++) {
      const date = moment(currentWeekStart).add(i, 'days');
      const th = document.createElement("th");
      th.style.width = "9%";
      th.innerHTML = `${date.format("MM/DD/YYYY")}<br>${days[i]}<br><a href="#">Send list</a>`;
      headerRow.appendChild(th);
    }

    const rangeLabel = document.getElementById("weekRangeLabel");
    if (rangeLabel) {
      rangeLabel.textContent = `${moment(currentWeekStart).format("MMM D")} – ${moment(currentWeekStart).add(6, 'days').format("MMM D, YYYY")}`;
    }
  }

  // Навешиваем обработчики
  const prevBtn = document.getElementById("prevWeekBtn");
  const nextBtn = document.getElementById("nextWeekBtn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      currentWeekStart.subtract(7, 'days');
      renderWeekHeaders();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      currentWeekStart.add(7, 'days');
      renderWeekHeaders();
    });
  }

  // Первый запуск
  renderWeekHeaders();
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
    const row = e.target.closest(".driver-row");
    if (!row) return;

    e.preventDefault();

    selectedDriverId = row.dataset.driverId || null;
    if (!selectedDriverId) return;

    // Позиционируем меню
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;
    menu.style.display = "block";
  });

  // Скрытие меню при клике вне
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
  const rows = document.querySelectorAll("tr.driver-row");

  let currentDriverRow = null;

  rows.forEach(row => {
    const cells = row.querySelectorAll("td");
    cells.forEach((td, index) => {
      if (index < 4) return;

      const value = td.innerText.trim();
      if (!value || value === '>') return;

      if (td.dataset.bound === "true") return;
      td.dataset.bound = "true";
      td.style.cursor = "pointer";

      td.addEventListener("click", () => {
        const rowEl = td.closest("tr");

        // Если клик по другой строке — сбросить всё
        if (currentDriverRow && currentDriverRow !== rowEl) {
          document.querySelectorAll("tr.driver-row td[data-bound='true']").forEach(cell => {
            cell.style.outline = "";
            cell.style.outlineOffset = "";
            cell.style.borderRadius = "";
            cell.classList.remove("selected-load-cell");
          });
        }

        currentDriverRow = rowEl;

        // Переключить выделение у ячейки
        const isSelected = td.classList.contains("selected-load-cell");

        if (isSelected) {
          td.classList.remove("selected-load-cell");
          td.style.outline = "";
          td.style.outlineOffset = "";
          td.style.borderRadius = "";
        } else {
          td.classList.add("selected-load-cell");
          td.style.outline = "3px solid #0d6efd";
          td.style.outlineOffset = "-3px";
          td.style.borderRadius = "4px";
        }
      });
    });
  });
}



