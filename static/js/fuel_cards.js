function initFuelCards() {
    console.log('init Fuel Cards called');
    setupOpenModalButton();
    setupFuelCardFormSubmit();
    loadFuelCards();
    setupTransactionUpload();
    setupFuelCardTransactionsButton();
    setupUploadTransactionsModalButton();
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

function setupFuelCardTransactionsButton() {
    document.getElementById('btn-open-fuel-transactions')?.addEventListener('click', () => {
        const section = document.getElementById('fuel-card-transactions-section');
        if (!section) {
            console.error("❌ Блок транзакций не найден");
            return;
        }
        section.style.display = 'block';
        loadFuelCardTransactions();
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

function loadFuelCards() {
    fetch('/fuel_cards/list')
        .then(res => res.json())
        .then(cards => {
            populateFuelCardTable(cards);
        })
        .catch(err => {
            console.error("Ошибка при загрузке карт:", err);
        });
}

function populateFuelCardTable(cards) {
    const tbody = document.querySelector('#fuel-cards-table tbody');
    tbody.innerHTML = '';

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
}

// === Загрузка PDF-транзакций ===

function setupTransactionUpload() {
    document.getElementById('upload-transactions-form')?.addEventListener('submit', function (e) {
        e.preventDefault();
        const formData = new FormData(this);

        fetch('/fuel_cards/upload_transactions', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(result => {
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
                alert('Ошибка: ' + result.error);
            }
        })
        .catch(err => {
            console.error('Ошибка загрузки файла:', err);
        });
    });
}

// === Загрузка транзакций из базы ===

function loadFuelCardTransactions() {
    fetch('/fuel_cards/transactions')
        .then(res => res.json())
        .then(transactions => {
            const tbody = document.querySelector('#transactions-table tbody');
            tbody.innerHTML = '';

            transactions.forEach(tx => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${tx.billing_range || ''}</td>
                    <td>${tx.date || ''}</td>
                    <td>${tx.card_number || ''}</td>
                    <td>${tx.driver_id || ''}</td>
                    <td>${tx.vehicle_id || ''}</td>
                    <td>${tx.qty ?? ''}</td>
                    <td>${tx.fuel_total ?? ''}</td>
                    <td>${tx.retail_price ?? ''}</td>
                    <td>${tx.invoice_total ?? ''}</td>
                    <td>${tx.driver_name || ''}</td>
                `;
                tbody.appendChild(row);
            });
        })
        .catch(err => {
            console.error('Ошибка загрузки транзакций:', err);
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
