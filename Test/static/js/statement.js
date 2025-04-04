function initStatementEvents() {
    console.log('initStatementEvents (Select2 version)');

    const select = $('#driverSelect');
    const createBtn = document.getElementById("createStatementBtn");
    const detailsBlock = document.getElementById("statementDetails");

    if (!select.length || !createBtn || !detailsBlock) return;

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
            detailsBlock.style.display = 'block';
        } else {
            createBtn.disabled = true;
            delete createBtn.dataset.driverId;
            detailsBlock.style.display = 'none';
        }
    });
}
