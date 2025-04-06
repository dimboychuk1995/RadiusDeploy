// static/js/tools/load_highlight.js
console.log('load_highlight.js loaded')
function highlightLoadsByWeek(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999); // включаем весь день

    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');

    rows.forEach(row => {
        const deliveryCell = row.querySelector('[data-delivery-date]');
        if (!deliveryCell) return;

        const deliveryDate = new Date(deliveryCell.dataset.deliveryDate);

        if (deliveryDate >= start && deliveryDate <= end) {
            row.classList.add('table-success'); // Bootstrap green
        } else {
            row.classList.remove('table-success');
        }
    });
}

// Делаем глобально доступной
window.highlightLoadsByWeek = highlightLoadsByWeek;
