function initFuelCards() {
    setupOpenModalButton();
    setupFuelCardFormSubmit();
    loadFuelCards();
    setupTransactionUpload();
    setupFuelCardTransactionsButton();
    setupUploadTransactionsModalButton();
}

function setupOpenModalButton() {
    document.getElementById('btn-open-fuel-card-modal')?.addEventListener('click', () => {
        resetFuelCardForm();
        loadDriverOptions();
        $('#fuelCardModal').modal('show');
    });
}

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
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            console.log('Карта успешно создана');
            $('#fuelCardModal').modal('hide');
        } else {
            console.error('Ошибка при создании карты:', result.error);
        }
    })
    .catch(err => {
        console.error('Ошибка запроса:', err);
    });
}

function loadDriverOptions() {
    fetch('/fuel_cards/drivers')
        .then(res => res.json())
        .then(drivers => {
            populateDriverSelect(drivers);
        })
        .catch(err => {
            console.error("Ошибка при загрузке водителей:", err);
        });
}

function populateDriverSelect(drivers) {
    const select = document.getElementById('assigned_driver');
    select.innerHTML = '';

    drivers.forEach(driver => {
        const option = document.createElement('option');
        option.value = driver._id;
        option.textContent = driver.name;
        select.appendChild(option);
    });
}

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

function setupUploadTransactionsModalButton() {
    document.getElementById('btn-upload-transactions')?.addEventListener('click', () => {
        $('#uploadTransactionsModal').modal('show');
    });
}

function setupFuelCardTransactionsButton() {
    document.getElementById('btn-open-fuel-transactions')?.addEventListener('click', () => {
        console.log('Открытие транзакций — в разработке');
    });
}
