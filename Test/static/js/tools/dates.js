// static/js/dates.js

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
    return `${month}/${day}/${year}`;
}

function populateWeekSelect(selector) {
    const weekOptions = generateWeekRanges();
    const $weekSelect = $(selector);
    $weekSelect.empty().append('<option value="">Выберите неделю...</option>');

    // 👉 Вычисляем ПОНЕДЕЛЬНИК предыдущей завершённой недели
    const today = new Date();
    const day = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - (day === 0 ? 7 : day)); // прошлое воскресенье
    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6); // его понедельник

    const defaultValue = `${lastMonday.toISOString().split('T')[0]}_${lastSunday.toISOString().split('T')[0]}`;

    weekOptions.forEach(week => {
        const selected = week.value === defaultValue ? 'selected' : '';
        $weekSelect.append(`<option value="${week.value}" ${selected}>${week.label}</option>`);
    });
}

