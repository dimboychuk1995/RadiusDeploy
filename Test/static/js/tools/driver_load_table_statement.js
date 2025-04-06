console.log('driver_load_table_statement.js loaded')

// ⬅️ Скрывает строки вне диапазона ПН–ВС + 2 дня
function filterLoadsByDateRange(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);

    const extendedEnd = new Date(endDateStr);
    extendedEnd.setDate(extendedEnd.getDate() + 2);
    extendedEnd.setHours(23, 59, 59, 999);

    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');

    rows.forEach(row => {
        const deliveryCell = row.querySelector('[data-delivery-date]');
        if (!deliveryCell) return;

        const parts = deliveryCell.dataset.deliveryDate.split("-");
        const deliveryDate = new Date(
            parseInt(parts[0]),
            parseInt(parts[1]) - 1,
            parseInt(parts[2])
        );

        row.style.display = (deliveryDate >= start && deliveryDate <= extendedEnd) ? '' : 'none';
    });
}

// ⬅️ Подсвечивает грузы в основной неделе ПН–ВС
function highlightWeekLoads(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);

    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');

    rows.forEach(row => {
        const deliveryCell = row.querySelector('[data-delivery-date]');
        if (!deliveryCell) return;

        const parts = deliveryCell.dataset.deliveryDate.split("-");
        const deliveryDate = new Date(
            parseInt(parts[0]),
            parseInt(parts[1]) - 1,
            parseInt(parts[2])
        );

        if (deliveryDate >= start && deliveryDate <= end) {
            row.classList.add('table-success');
        } else {
            row.classList.remove('table-success');
        }
    });
}

// Экспорт
window.filterLoadsByDateRange = filterLoadsByDateRange;
window.highlightWeekLoads = highlightWeekLoads;
