function initIFTA() {
  console.log("🔧 initIFTA() called — инициализация IFTA секции");

  const tbody = document.querySelector("#ifta-table tbody");
  if (!tbody) {
    console.warn("⚠️ Таблица IFTA не найдена в DOM");
    return;
  }

  fetch("/api/ifta/integrations")
    .then(response => {
      if (!response.ok) throw new Error("Ошибка при получении данных IFTA");
      return response.json();
    })
    .then(data => {
      tbody.innerHTML = "";

      data.forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.name}</td>
          <td>${item.parent_name}</td>
          <td>
            <button class="btn btn-sm btn-primary">Посчитать ifta</button>
          </td>
        `;

        const btn = row.querySelector("button");
        btn.addEventListener("click", () => openIftaModal(item));  // ← важно: item передаётся

        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error("❌ Ошибка загрузки IFTA интеграций:", err);
    });
}

function openIftaModal(item) {
  const modal = document.getElementById("calculateIftaModal");
  const content = document.getElementById("iftaModalContent");

  if (!modal || !content) return;

  modal.classList.add("show");

  content.innerHTML = `
    <p><strong>Интеграция:</strong> ${item.name}</p>
    <p><strong>Источник:</strong> ${item.parent_name}</p>

    <div class="d-flex align-items-end flex-wrap gap-3 mt-3">
      <div class="form-group mb-0">
        <label for="iftaDateRange">Выберите диапазон дат:</label>
        <input type="text" id="iftaDateRange" class="form-control" style="min-width: 240px; max-width: 260px;">
      </div>
      <div class="mb-2">
        <button id="calculateIftaBtn" class="btn btn-success">Посчитать IFTA</button>
      </div>
    </div>

    <div id="truckListContainer" class="mt-4">
      <div class="text-muted">Загружаем список траков...</div>
    </div>
  `;

  initIftaDatePicker();

  fetch(`/api/ifta/trucks/${encodeURIComponent(item.parent_name)}/${encodeURIComponent(item.name)}`)
    .then(res => {
      if (!res.ok) throw new Error("Ошибка получения траков");
      return res.json();
    })
    .then(trucks => {
      const container = document.getElementById("truckListContainer");

      if (!Array.isArray(trucks) || trucks.length === 0) {
        container.innerHTML = `<div class="text-warning">Нет доступных траков</div>`;
        return;
      }

      const rows = trucks.map(truck => `
        <tr>
          <td><input type="checkbox" class="form-check-input truck-checkbox" data-truck-id="${truck.truckId}"></td>
          <td>${truck.truckId || "—"}</td>
          <td>${truck.truckNumber || "—"}</td>
          <td>${truck.make || "—"}</td>
          <td>${truck.model || "—"}</td>
          <td>${truck.modelYear || "—"}</td>
          <td>${truck.vin || "—"}</td>
          <td>${truck.status || "—"}</td>
        </tr>
      `).join('');

      container.innerHTML = `
        <div class="d-flex justify-content-end mb-2">
          <button id="selectAllBtn" class="btn btn-sm btn-outline-primary">Выбрать все</button>
        </div>
        <table class="table table-bordered table-sm">
          <thead class="table-light">
            <tr>
              <th></th>
              <th>ID #</th>
              <th>Truck #</th>
              <th>Make</th>
              <th>Model</th>
              <th>Year</th>
              <th>VIN</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      // Кнопка "Выбрать все"
      const selectAllBtn = document.getElementById("selectAllBtn");
      let allSelected = false;

      selectAllBtn.addEventListener("click", () => {
        const checkboxes = container.querySelectorAll(".truck-checkbox");
        allSelected = !allSelected;
        checkboxes.forEach(cb => cb.checked = allSelected);
        selectAllBtn.textContent = allSelected ? "Снять выделение" : "Выбрать все";
      });

      // Кнопка "Посчитать IFTA"
      document.getElementById("calculateIftaBtn").addEventListener("click", async () => {
        const checkboxes = container.querySelectorAll(".truck-checkbox:checked");
        const selectedTrucks = [];

        checkboxes.forEach(cb => {
          const row = cb.closest("tr");
          const tds = row.querySelectorAll("td");
          selectedTrucks.push({
            truckId: tds[1].textContent.trim(),
            truckNumber: tds[2].textContent.trim(),
            make: tds[3].textContent.trim(),
            model: tds[4].textContent.trim(),
            modelYear: tds[5].textContent.trim(),
            vin: tds[6].textContent.trim(),
            status: tds[7].textContent.trim(),
            api_key: item.api_key  // передаём токен
          });
        });

        const dateRange = $("#iftaDateRange").data("daterangepicker");
        const startDate = dateRange.startDate.format("YYYY-MM-DD");
        const endDate = dateRange.endDate.format("YYYY-MM-DD");

        try {
          const res = await fetch("/api/ifta/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parent_name: item.parent_name,
              start_date: startDate,
              end_date: endDate,
              trucks: selectedTrucks
            })
          });

          const data = await res.json();
          openIftaResultModal(data);
        } catch (err) {
          alert("Ошибка при расчёте IFTA");
          console.error(err);
        }
      });
    })
    .catch(err => {
      const container = document.getElementById("truckListContainer");
      container.innerHTML = `<div class="text-danger">❌ ${err.message}</div>`;
    });
}


function closeIftaModal() {
  const modal = document.getElementById("calculateIftaModal");
  if (modal) {
    modal.classList.remove("show");  // тот же класс, что и в open
  }
}

function initIftaDatePicker() {
  const input = document.getElementById("iftaDateRange");
  if (!input) return;

  const now = moment();
  const currentYear = now.year();
  const lastYear = currentYear - 1;

  // Функция для квартала
  function getQuarterRange(year, quarter) {
    const start = moment(`${year}-01-01`).quarter(quarter).startOf('quarter');
    const end = moment(start).endOf('quarter');
    return [start, end];
  }

  // Получить последний завершённый квартал текущего года
  let defaultStart, defaultEnd;
  for (let q = 4; q >= 1; q--) {
    const [start, end] = getQuarterRange(currentYear, q);
    if (end.isBefore(now)) {
      defaultStart = start;
      defaultEnd = end;
      break;
    }
  }

  // Формируем список доступных диапазонов
  const ranges = {};

  for (let year of [currentYear, lastYear]) {
    for (let q = 1; q <= 4; q++) {
      const [start, end] = getQuarterRange(year, q);
      if (end.isBefore(now)) {
        ranges[`Q${q} ${year}`] = [start, end];
      }
    }
  }

  ranges["Reset"] = [moment(), moment()];

  // Инициализация
  $(input).daterangepicker({
    startDate: defaultStart,
    endDate: defaultEnd,
    showDropdowns: true,
    autoApply: false,
    linkedCalendars: false,
    alwaysShowCalendars: true,
    opens: 'center',
    showCustomRangeLabel: true,
    locale: {
      format: 'MM / DD / YYYY',
      applyLabel: 'APPLY',
      cancelLabel: 'CANCEL',
      daysOfWeek: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      monthNames: moment.months(),
      firstDay: 1
    },
    ranges: ranges
  });

  $(input).on('apply.daterangepicker', function(ev, picker) {
    const startIso = picker.startDate.toISOString();
    const endIso = picker.endDate.toISOString();

    const isReset = picker.startDate.isSame(moment(), 'day') && picker.endDate.isSame(moment(), 'day');
    if (isReset) {
      console.log("⛔ Reset selected");
      return;
    }

    console.log("📅 Выбранный диапазон:", startIso, endIso);
    // Здесь можно вызвать расчёт IFTA
  });
}

function openIftaResultModal(results) {
  const modal = document.getElementById("iftaResultModal");
  const container = document.getElementById("iftaResultsContainer");
  modal.classList.add("show");

  let totalMiles = 0;
  let totalGallons = 0;

  const cardsHTML = results.map(result => {
    if (result.error) {
      return `<div class="alert alert-danger">Ошибка для трака ${result.truckId}: ${result.error}</div>`;
    }

    const stateMap = result.data?.diesel?.fuelDataByStateMap || {};
    const rows = Object.entries(stateMap).map(([state, info]) => {
      const miles = parseFloat(info.totalDistanceDriven) || 0;
      const gallons = parseFloat(info.fuelVolumePurchased) || 0;
      totalMiles += miles;
      totalGallons += gallons;

      return `
        <tr>
          <td>${state}</td>
          <td>${miles.toFixed(2)}</td>
          <td>${gallons.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card mb-3">
        <div class="card-header"><strong>Truck ID: ${result.truckId}</strong></div>
        <div class="card-body p-2">
          <table class="table table-bordered table-sm mb-0">
            <thead class="table-light">
              <tr>
                <th>State</th>
                <th>Miles</th>
                <th>Gallons Purchased</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  const totalHTML = `
    <div class="alert alert-info mt-4">
      <strong>ИТОГО:</strong><br>
      Общие мили: ${totalMiles.toFixed(2)}<br>
      Всего галлонов: ${totalGallons.toFixed(2)}
    </div>
  `;

  container.innerHTML = cardsHTML + totalHTML;
}

function closeIftaResultModal() {
  const modal = document.getElementById("iftaResultModal");
  if (modal) modal.classList.remove("show");
}

