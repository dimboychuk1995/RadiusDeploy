function parseDate(str) {
  // Формат MM/DD/YYYY
  const [mm, dd, yyyy] = str.split('/');
  return new Date(`${yyyy}-${mm}-${dd}`);
}

function filterLoadsByDateRange(startDateStr, endDateStr) {
    console.log('filterLoadsByDateRange', startDateStr, endDateStr);
    const [mm, dd, yyyy] = endDateStr.split('/');
    const endDatePlus2 = new Date(`${yyyy}-${mm}-${dd}`);
    endDatePlus2.setDate(endDatePlus2.getDate() + 2);
    const extendedEndStr = `${(endDatePlus2.getMonth() + 1).toString().padStart(2, '0')}/${endDatePlus2.getDate().toString().padStart(2, '0')}/${endDatePlus2.getFullYear()}`;

    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');
    console.log('Строк найдено:', rows.length);

    rows.forEach(row => {
        const deliveryStr = row.querySelector('[data-delivery-date]')?.dataset.deliveryDate.trim();
        if (!deliveryStr) return;

        const visible = deliveryStr >= startDateStr && deliveryStr <= extendedEndStr;
        console.log(`Load delivery date: ${deliveryStr}, visible: ${visible}`);

        row.style.display = visible ? '' : 'none';
    });
}


function highlightWeekLoads(startDateStr, endDateStr) {
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);

    console.log('highlightWeekLoads', startDateStr, endDateStr);
    const rows = document.querySelectorAll('#driverLoadsContent tbody tr');
    console.log('Строк найдено:', rows.length);

    rows.forEach(row => {
        const deliveryStr = row.querySelector('[data-delivery-date]')?.dataset.deliveryDate?.trim();
        if (!deliveryStr) return;

        const deliveryDate = parseDate(deliveryStr);

        row.classList.toggle(
            'table-success',
            deliveryDate >= startDate && deliveryDate <= endDate
        );
    });
}

window.filterLoadsByDateRange = filterLoadsByDateRange;
window.highlightWeekLoads = highlightWeekLoads;
