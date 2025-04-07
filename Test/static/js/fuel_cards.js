function initFuelCards() {
    const modal = new bootstrap.Modal(document.getElementById('fuelCardModal'));

    // 🔹 Открытие модалки
    document.getElementById('btn-open-fuel-card-modal')?.addEventListener('click', () => {
        document.getElementById('fuel-card-form').reset(); // очищаем форму
        loadDriverOptions(); // загружаем водителей
        modal.show();
    });

    // 🔹 Отправка формы
    document.getElementById('fuel-card-form')?.addEventListener('submit', function (e) {
        e.preventDefault();

        const data = {
            provider: document.getElementById('provider').value,
            card_number: document.getElementById('card_number').value,
            driver_id: document.getElementById('driver_id').value,
            vehicle_id: document.getElementById('vehicle_id').value,
            assigned_driver: document.getElementById('assigned_driver').value
        };

        // Временно просто логируем
        console.log("Отправка формы карты:", data);

        // modal.hide(); // потом добавим после успешной отправки
    });
}

// 🔹 Подгружаем водителей из backend'а
function loadDriverOptions() {
    fetch('/fuel_cards/drivers')
        .then(res => res.json())
        .then(drivers => {
            const select = document.getElementById('assigned_driver');
            select.innerHTML = ''; // очищаем

            drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver._id;
                option.textContent = driver.name;
                select.appendChild(option);
            });
        })
        .catch(err => {
            console.error("Ошибка при загрузке водителей:", err);
        });
}
