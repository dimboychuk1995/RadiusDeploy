console.log('load_highlight.js loaded (строковое сравнение дат)');

// Показывает только грузы в диапазоне: неделя + 2 дня (до вторника включительно)
function filterLoadsByDateRange(startDateStr, endDateStr) {
    // Преобразуем endStr в строку +2 дня (в формате YYYY-MM-DD)
    const endDate = new Date(endDateStr);
    endDate.setDate(endDate.getDate() + 2);
    const extendedEndStr = endDate.toISOString().split('T')[0];

    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');

    rows.forEach(row => {
        const deliveryCell = row.querySelector('[data-delivery-date]');
        if (!deliveryCell) return;

        const deliveryStr = deliveryCell.dataset.deliveryDate.trim();

        row.style.display = (deliveryStr >= startDateStr && deliveryStr <= extendedEndStr) ? '' : 'none';
    });
}

// Подсвечивает грузы в пределах основной недели (ПН–ВС)
function highlightWeekLoads(startDateStr, endDateStr) {
    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');

    rows.forEach(row => {
        const deliveryCell = row.querySelector('[data-delivery-date]');
        if (!deliveryCell) return;

        const deliveryStr = deliveryCell.dataset.deliveryDate.trim();

        if (deliveryStr >= startDateStr && deliveryStr <= endDateStr) {
            row.classList.add('table-success');
        } else {
            row.classList.remove('table-success');
        }
    });
}

window.filterLoadsByDateRange = filterLoadsByDateRange;
window.highlightWeekLoads = highlightWeekLoads;
