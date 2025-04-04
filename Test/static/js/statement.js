function initStatementEvents() {
    console.log('initStatementEvents (Select2 version)');

    const select = $('#driverSelect');
    const createBtn = document.getElementById("createStatementBtn");

    if (!select.length || !createBtn) return;

    // Инициализация Select2
    select.select2({
        dropdownParent: $('#createStatementModal'),
        placeholder: 'Выберите водителя',
        width: 'resolve',
        allowClear: true
    });

    select.on('change', function () {
        const driverId = this.value;
        if (driverId) {
            createBtn.disabled = false;
            createBtn.dataset.driverId = driverId;
        } else {
            createBtn.disabled = true;
            delete createBtn.dataset.driverId;
        }
    });
}
