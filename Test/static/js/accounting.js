console.log('accounting.js вызван');

function initAccountingButtons() {
    console.log('инициализация кнопок');

    const btnDriversList = document.getElementById('btn-drivers-list');
    const btnTrucksList = document.getElementById('btn-trucks-list');
    const driversList = document.getElementById('drivers-list');
    const trucksList = document.getElementById('trucks-list');

    if (btnDriversList && btnTrucksList && driversList && trucksList) {
        btnDriversList.addEventListener('click', function () {
            driversList.style.display = 'block';
            trucksList.style.display = 'none';
            this.classList.add('active');
            btnTrucksList.classList.remove('active');
        });

        btnTrucksList.addEventListener('click', function () {
            driversList.style.display = 'none';
            trucksList.style.display = 'block';
            this.classList.add('active');
            btnDriversList.classList.remove('active');
        });
    }
}

window.initAccountingButtons = initAccountingButtons;
