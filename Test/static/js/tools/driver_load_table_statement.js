// Показывает только грузы в диапазоне: неделя + 2 дня (до вторника включительно)
function filterLoadsByDateRange(startDateStr, endDateStr) {
    const [mm, dd, yyyy] = endDateStr.split('/');
    const endDatePlus2 = new Date(`${yyyy}-${mm}-${dd}`);
    endDatePlus2.setDate(endDatePlus2.getDate() + 2);
    const extendedEndStr = `${(endDatePlus2.getMonth() + 1).toString().padStart(2, '0')}/${endDatePlus2.getDate().toString().padStart(2, '0')}/${endDatePlus2.getFullYear()}`;

    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');

    rows.forEach(row => {
        const deliveryStr = row.querySelector('[data-delivery-date]')?.dataset.deliveryDate.trim();
        if (!deliveryStr) return;

        row.style.display = (deliveryStr >= startDateStr && deliveryStr <= extendedEndStr) ? '' : 'none';
    });
}

// Подсвечивает грузы в пределах основной недели (ПН–ВС)
function highlightWeekLoads(startDateStr, endDateStr) {
    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');

    rows.forEach(row => {
        const deliveryStr = row.querySelector('[data-delivery-date]')?.dataset.deliveryDate.trim();
        if (!deliveryStr) return;

        row.classList.toggle(
            'table-success',
            deliveryStr >= startDateStr && deliveryStr <= endDateStr
        );
    });
}

window.filterLoadsByDateRange = filterLoadsByDateRange;
window.highlightWeekLoads = highlightWeekLoads;
