// static/js/dates.js
console.log('dates.js called')
function generateWeekRanges(weeksCount = 12) {
    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() + diffToMonday);

    const ranges = [];

    for (let i = 0; i < weeksCount; i++) {
        const monday = new Date(lastMonday);
        monday.setDate(lastMonday.getDate() - i * 7);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const rangeStr = `${formatDate(monday)} - ${formatDate(sunday)}`;
        const valueStr = `${monday.toISOString().split('T')[0]}_${sunday.toISOString().split('T')[0]}`;

        ranges.push({ label: rangeStr, value: valueStr });
    }

    return ranges;
}

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

function populateWeekSelect(selector) {
    const weekOptions = generateWeekRanges();
    const $weekSelect = $(selector);
    $weekSelect.empty().append('<option value="">Выберите неделю...</option>');

    weekOptions.forEach(week => {
        $weekSelect.append(`<option value="${week.value}">${week.label}</option>`);
    });
}
