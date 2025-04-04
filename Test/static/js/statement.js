function initStatementEvents() {
    console.log('initStatementEvents (Select2 version)');

    const select = $('#driverSelect');
    const createBtn = document.getElementById("createStatementBtn");
    const detailsBlock = document.getElementById("statementDetails");
    const loadsBlock = document.getElementById("driverLoadsBlock");
    const loadsContent = document.getElementById("driverLoadsContent");

    if (!select.length || !createBtn || !detailsBlock || !loadsBlock || !loadsContent) return;

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

            // подгрузка грузов
            fetch(`/statement/driver_loads/${driverId}`)
                .then(res => res.text())
                .then(html => {
                    loadsBlock.style.display = 'block';
                    loadsContent.innerHTML = html;
                })
                .catch(err => {
                    loadsContent.innerHTML = '<p class="text-danger">Ошибка загрузки грузов</p>';
                });
        } else {
            createBtn.disabled = true;
            delete createBtn.dataset.driverId;
            detailsBlock.style.display = 'none';
            loadsBlock.style.display = 'none';
        }
    });
}