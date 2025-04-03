console.log('accounting.js вызван');

function initAccountingButtons() {
    console.log('инициализация кнопок');

    const btnDriversList = document.getElementById('btn-drivers-list');
    const btnTrucksList = document.getElementById('btn-trucks-list');

    if (btnDriversList && btnTrucksList) {
        btnDriversList.addEventListener('click', function () {
            document.getElementById('drivers-list').style.display = 'block';
            document.getElementById('trucks-list').style.display = 'none';
            this.classList.add('active');
            btnTrucksList.classList.remove('active');
        });

        btnTrucksList.addEventListener('click', function () {
            document.getElementById('drivers-list').style.display = 'none';
            document.getElementById('trucks-list').style.display = 'block';
            this.classList.add('active');
            btnDriversList.classList.remove('active');
        });
    } else {
        console.warn('Кнопки не найдены — возможно, фрагмент еще не загружен');
    }
}

// делаем функцию доступной глобально
window.initAccountingButtons = initAccountingButtons;
