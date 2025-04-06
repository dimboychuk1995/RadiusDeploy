// static/js/tools/load_highlight.js


console.log('load_highlight.js loaded')
//подсвечивает грузы ы выводит грузы из диапазона
function highlightLoadsByWeek(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);

    const extendedEnd = new Date(end);
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

        // Подсветка
        if (deliveryDate >= start && deliveryDate <= end) {
            row.classList.add('table-success');
        } else {
            row.classList.remove('table-success');
        }

        // Отображение
        if (deliveryDate >= start && deliveryDate <= extendedEnd) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}
// Делаем глобально доступной
window.highlightLoadsByWeek = highlightLoadsByWeek;
