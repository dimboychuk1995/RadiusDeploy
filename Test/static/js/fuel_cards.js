// 🔹 Основная точка входа — вызывается при загрузке фрагмента
function initFuelCards() {
    setupOpenModalButton();        // Настраивает кнопку "Создать"
    setupFuelCardFormSubmit();     // Настраивает отправку формы
    loadFuelCards(); // 🔹 Загружаем список при инициализации
}

// 🔹 Настраивает поведение кнопки "Создать"
function setupOpenModalButton() {
    document.getElementById('btn-open-fuel-card-modal')?.addEventListener('click', () => {
        resetFuelCardForm();
        loadDriverOptions();
        $('#fuelCardModal').modal('show'); // ✅ Bootstrap 4 способ
    });
}
// 🔹 Настраивает отправку формы карты
function setupFuelCardFormSubmit() {
    document.getElementById('fuel-card-form')?.addEventListener('submit', function (e) {
        e.preventDefault();                           // Предотвращает перезагрузку страницы
        const data = collectFuelCardFormData();       // Собирает данные формы
        submitFuelCard(data);                         // Отправляет на сервер
    });
}

// 🔹 Очищает поля формы
function resetFuelCardForm() {
    document.getElementById('fuel-card-form').reset();
}

// 🔹 Собирает данные из полей формы и возвращает объект
function collectFuelCardFormData() {
    return {
        provider: document.getElementById('provider').value,
        card_number: document.getElementById('card_number').value,
        driver_id: document.getElementById('driver_id').value,
        vehicle_id: document.getElementById('vehicle_id').value,
        assigned_driver: document.getElementById('assigned_driver').value
    };
}

// 🔹 Отправляет данные карты на сервер
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
            $('#fuelCardModal').modal('hide'); // ✅ Bootstrap 4 способ
        } else {
            console.error('Ошибка при создании карты:', result.error);
        }
    })
    .catch(err => {
        console.error('Ошибка запроса:', err);
    });
}


// 🔹 Загружает список водителей с backend'а
function loadDriverOptions() {
    fetch('/fuel_cards/drivers')
        .then(res => res.json())
        .then(drivers => {
            populateDriverSelect(drivers); // Заполняет селект водителями
        })
        .catch(err => {
            console.error("Ошибка при загрузке водителей:", err);
        });
}

// 🔹 Добавляет опции в селект Assigned Driver
function populateDriverSelect(drivers) {
    const select = document.getElementById('assigned_driver');
    select.innerHTML = ''; // очищаем текущие опции

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
    tbody.innerHTML = ''; // очищаем

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