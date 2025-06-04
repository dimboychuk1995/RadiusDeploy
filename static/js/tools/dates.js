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
        ranges.push({ label: rangeStr, value: rangeStr });
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

function formatDateMMDDYYYY(date) {
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
}

function populateWeekSelect(selector) {
    const weekOptions = generateWeekRanges();
    const $weekSelect = $(selector);
    $weekSelect.empty().append('<option value="">Выберите неделю...</option>');

    // Вычисляем ПОНЕДЕЛЬНИК и ВОСКРЕСЕНЬЕ предыдущей завершённой недели
    const today = new Date();
    const day = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - (day === 0 ? 7 : day)); // прошлое воскресенье
    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6); // его понедельник

    const defaultValue = `${formatDateMMDDYYYY(lastMonday)} - ${formatDateMMDDYYYY(lastSunday)}`;

    weekOptions.forEach(week => {
        const isDefault = week.label === defaultValue ? 'selected' : '';
        $weekSelect.append(`<option value="${week.label}" ${isDefault}>${week.label}</option>`);
    });
}


