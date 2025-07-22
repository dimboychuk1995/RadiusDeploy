let lastCreatedAt = null;
let currentSearch = '';

function initFuelCards() {
    console.log('init Fuel Cards called');
    setupOpenModalButton();
    setupFuelCardFormSubmit();
    loadFuelCards();
    setupTransactionUpload();
    setupUploadTransactionsModalButton();

    // 🆕 Добавь это:
    document.getElementById('btn-show-more')?.addEventListener('click', () => {
        loadFuelCards(false);
    });

    document.getElementById('fuel-card-search')?.addEventListener('input', function () {
        currentSearch = this.value.trim();
        lastCreatedAt = null; // сбрасываем пагинацию
        loadFuelCards(true);
    });

}

// === Кнопки ===

function setupOpenModalButton() {
    const btn = document.getElementById('btn-open-fuel-card-modal');
    console.log("🔍 Кнопка найдена?", !!btn);
    if (!btn) return;

    btn.addEventListener('click', () => {
        console.log("🎯 Кнопка нажата");
        resetFuelCardForm();
        openFuelCardModal();
        loadFuelCardDriverOptions();  // ← новое имя
    });
}

function setupUploadTransactionsModalButton() {
    document.getElementById('btn-upload-transactions')?.addEventListener('click', () => {
        openUploadTransactionsModal();
    });
}

// === Создание карты ===

function setupFuelCardFormSubmit() {
    document.getElementById('fuel-card-form')?.addEventListener('submit', function (e) {
        e.preventDefault();
        const data = collectFuelCardFormData();
        submitFuelCard(data);
    });
}

function resetFuelCardForm() {
    document.getElementById('fuel-card-form').reset();
}

function collectFuelCardFormData() {
    return {
        provider: document.getElementById('provider').value,
        card_number: document.getElementById('card_number').value,
        driver_id: document.getElementById('driver_id').value,
        vehicle_id: document.getElementById('vehicle_id').value,
        assigned_driver: document.getElementById('assigned_driver').value
    };
}

function submitFuelCard(data) {
    fetch('/fuel_cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            console.log('✅ Карта успешно создана');
            closeFuelCardModal();
            loadFuelCards();
        } else {
            console.error('❌ Ошибка при создании карты:', result.error);
        }
    })
    .catch(err => {
        console.error('❌ Ошибка запроса:', err);
    });
}

// === Загрузка водителей ===

function loadFuelCardDriverOptions() {
    console.log("📡 loadFuelCardDriverOptions CALLED");

    fetch('/fuel_cards/drivers')
        .then(res => {
            console.log("✅ Ответ получен:", res.status);
            return res.json();
        })
        .then(drivers => {
            console.log("🚀 Загружаем водителей...", drivers);
            populateDriverSelect(drivers);
        })
        .catch(err => {
            console.error("❌ Ошибка при загрузке водителей:", err);
        });
}

function populateDriverSelect(drivers) {
    const select = document.getElementById('assigned_driver');
    if (!select) {
        console.error("❌ <select id='assigned_driver'> не найден");
        return;
    }

    select.innerHTML = '';
    drivers.forEach(driver => {
        const option = document.createElement('option');
        option.value = driver._id;
        option.textContent = driver.name;
        select.appendChild(option);
    });

    console.log("✅ Водители добавлены в select");
}





// === Загрузка и отображение списка карт ===
function loadFuelCards(isInitial = true) {
    let url = '/fuel_cards/list';
    const params = new URLSearchParams();

    if (!isInitial && lastCreatedAt) {
        params.append('after', lastCreatedAt);
    }
    if (currentSearch) {
        params.append('search', currentSearch);
    }

    if ([...params].length > 0) {
        url += '?' + params.toString();
    }

    fetch(url)
        .then(res => res.json())
        .then(cards => {
            if (cards.length === 0 && !isInitial) {
                document.getElementById('btn-show-more')?.classList.add("d-none");
                return;
            }

            populateFuelCardTable(cards, isInitial);
            const last = cards[cards.length - 1];
            lastCreatedAt = last?.created_at || null;
        })
        .catch(err => {
            console.error("Ошибка при загрузке карт:", err);
        });
}

function populateFuelCardTable(cards, isInitial) {
    const tbody = document.querySelector('#fuel-cards-table tbody');
    if (isInitial) tbody.innerHTML = ''; // сброс если первый раз

    cards.forEach(card => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${card.provider || ''}</td>
            <td>${card.card_number || ''}</td>
            <td>${card.driver_id || ''}</td>
            <td>${card.vehicle_id || ''}</td>
            <td>${card.assigned_driver_name || '-'}</td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('btn-show-more')?.classList.remove("d-none");
}

// === Загрузка PDF-транзакций ===

function setupTransactionUpload() {
    document.getElementById('upload-transactions-form')?.addEventListener('submit', function (e) {
        e.preventDefault();

        const overlay = document.getElementById("pdfOverlay");
        overlay?.classList.remove("d-none"); // ⏳ Показать лоадер

        const formData = new FormData(this);

        fetch('/fuel_cards/upload_transactions', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(result => {
            try {
                if (result.success) {
                    let html = `<div class="alert alert-info mt-3"><strong>Загружено транзакций:</strong> ${result.count}</div>`;
                    if (result.summary_by_card?.length) {
                        html += `<ul class="list-group mt-2">`;
                        result.summary_by_card.forEach(entry => {
                            html += `
                                <li class="list-group-item">
                                    (Card ${entry.card_number} - ${entry.driver_name}) 
                                    Qty: ${entry.qty}, 
                                    Retail: $${entry.retail}, 
                                    Invoice: $${entry.invoice}
                                </li>
                            `;
                        });
                        html += `</ul>`;
                    }
                    document.getElementById('upload-summary-container').innerHTML = html;
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Ошибка',
                        text: result.error || 'Что-то пошло не так при загрузке'
                    });
                }
            } catch (parseError) {
                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка обработки ответа',
                    text: 'Не удалось корректно обработать данные от сервера.'
                });
            }
        })
        .catch(() => {
            Swal.fire({
                icon: 'error',
                title: 'Сетевая ошибка',
                text: 'Не удалось отправить файл. Проверьте соединение.'
            });
        })
        .finally(() => {
            overlay?.classList.add("d-none"); // ✅ Скрыть лоадер в любом случае
        });
    });
}

// === Модалки ===

function openFuelCardModal() {
    document.getElementById("fuelCardModal").classList.add("show");
    document.querySelector(".custom-offcanvas-backdrop")?.classList.add("show");
}

function closeFuelCardModal() {
    document.getElementById("fuelCardModal").classList.remove("show");
    document.querySelector(".custom-offcanvas-backdrop")?.classList.remove("show");
}

function openUploadTransactionsModal() {
    document.getElementById("uploadTransactionsModal").classList.add("show");
    document.querySelector(".custom-offcanvas-backdrop")?.classList.add("show");
}

function closeUploadTransactionsModal() {
    document.getElementById("uploadTransactionsModal").classList.remove("show");
    document.querySelector(".custom-offcanvas-backdrop")?.classList.remove("show");
}


function initFuelCardsDateRange(context) {
  const input = document.getElementById("fuelCardsDateRange");
  if (!input) return;

  const lastWeekStart = moment().subtract(1, 'weeks').startOf('isoWeek');
  const lastWeekEnd = moment().subtract(1, 'weeks').endOf('isoWeek');

  $(input).daterangepicker({
    startDate: lastWeekStart,
    endDate: lastWeekEnd,
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
    ranges: {
      'Last Week': [lastWeekStart, lastWeekEnd],
      'Reset': [moment(), moment()]
    }
  });

  $(input).on('apply.daterangepicker', function(ev, picker) {
    const startIso = picker.startDate.toISOString();
    const endIso = picker.endDate.toISOString();
    const isReset = picker.startDate.isSame(moment(), 'day') && picker.endDate.isSame(moment(), 'day');

    const target = context === 'summary'
      ? document.getElementById("summaryResultsBody")
      : document.getElementById("transactionsResultsBody");

    if (isReset) {
      if (target) target.innerHTML = "";
      return;
    }

    if (target) {
      target.innerHTML = `<div class="text-muted">Loading ${context} from ${startIso} to ${endIso}...</div>`;
    }

    fetchFuelSummaryData(startIso, endIso);

    // Пока просто выводим в консоль
    console.log(`📅 Selected range for ${context}:`, startIso, endIso);
  });
}

function initFuelCardsSummary() {
  initFuelCardsDateRange('summary');

  const input = document.getElementById('summarySearch');
  if (input) {
    input.addEventListener('input', (e) => {
      summarySearchTerm = e.target.value.trim().toLowerCase();
      showAll = false;
      renderFuelSummaryTable();
    });
  }

  // Загружаем начальную таблицу
  fetchFuelSummaryData();
}


let showAll = false;
let cachedFuelSummaryData = [];
let summarySearchTerm = '';

function fetchFuelSummaryData(startIso, endIso) {
  fetch('/fuel_cards/summary_by_driver')
    .then(res => res.json())
    .then(data => {
      cachedFuelSummaryData = data || [];
      showAll = false;
      renderFuelSummaryTable();
    })
    .catch(err => {
      console.error("Ошибка при получении summary:", err);
    });
}

function renderFuelSummaryTable() {
  const container = document.getElementById("summaryResultsBody");
  if (!container) return;

  const search = summarySearchTerm.toLowerCase();

  let filtered = cachedFuelSummaryData.filter(row => {
    const driver = row.driver_name?.toLowerCase() || '';
    const truck = row.unit_number?.toLowerCase() || '';
    return driver.includes(search) || truck.includes(search);
  });

  const dataToRender = showAll ? filtered : filtered.slice(0, 15);

  if (!filtered.length) {
    container.innerHTML = `<div class="alert alert-warning">Нет данных</div>`;
    return;
  }

  let html = `
    <table class="table table-bordered">
      <thead>
        <tr>
          <th>Водитель</th>
          <th>Трак</th>
          <th>Qty</th>
          <th>Retail $</th>
          <th>Invoice $</th>
        </tr>
      </thead>
      <tbody>
  `;

  dataToRender.forEach(row => {
    html += `
      <tr>
        <td>${row.driver_name}</td>
        <td>${row.unit_number || '-'}</td>
        <td>${row.qty}</td>
        <td>$${row.retail}</td>
        <td>$${row.invoice}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;

  if (!showAll && filtered.length > 15) {
    html += `
      <div class="text-center mt-3">
        <button id="btn-show-more-summary" class="btn btn-primary">Показать ещё</button>
      </div>
    `;
  }

  container.innerHTML = html;

  const btn = document.getElementById("btn-show-more-summary");
  if (btn) {
    btn.addEventListener("click", () => {
      showAll = true;
      renderFuelSummaryTable();
    });
  }
}

// 🔍 Подключение поля поиска
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('summarySearch');
  if (input) {
    input.addEventListener('input', (e) => {
      summarySearchTerm = e.target.value.trim();
      showAll = false;
      renderFuelSummaryTable();
    });
  }
});




function initFuelCardTransactions() {
  initFuelCardsDateRange('transactions');
}