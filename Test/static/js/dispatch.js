function initDispatchCalendar() {
    const container = document.getElementById("dispatchContainer");
    if (!container) return;

    let drivers = [];
    try {
        drivers = JSON.parse(container.dataset.drivers || "[]");
    } catch (e) {
        console.error("Failed to parse drivers:", e);
    }

    // теперь drivers доступен как массив
    let currentStartDate = new Date();

    function renderEmptyCalendar() {
        const tbody = document.getElementById("calendarBody");
        const weekLabel = document.getElementById("currentWeek");
        if (!tbody || !weekLabel) return;

        const weekDates = getWeekDates(currentStartDate);
        weekLabel.textContent = formatWeekRange(weekDates);
        tbody.innerHTML = "";

        drivers.forEach(driver => {
            const driverName = driver.name || "—";
            const row = document.createElement("tr");
            row.innerHTML = `<td>${driverName}</td>` + weekDates.map(() => {
                return `<td></td><td></td><td></td>`; // только 3 ячейки на день
            }).join("");
            tbody.appendChild(row);
        });
    }

    function changeWeek(deltaDays) {
        currentStartDate.setDate(currentStartDate.getDate() + deltaDays);
        renderEmptyCalendar();
    }

    function getWeekDates(startDate) {
        const date = new Date(startDate);
        const day = date.getDay(); // 0 (Sun) - 6 (Sat)
        const monday = new Date(date);
        monday.setDate(date.getDate() - ((day + 6) % 7)); // гарантированно Пн

        const result = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            result.push(d);
        }
        return result;
    }

    function formatWeekRange(dates) {
        const options = { month: "2-digit", day: "2-digit" };
        const start = dates[0].toLocaleDateString("en-US", options);
        const end = dates[6].toLocaleDateString("en-US", options);
        return `${start} - ${end}`;
    }

    const prevBtn = document.getElementById("prevWeekBtn");
    const nextBtn = document.getElementById("nextWeekBtn");
    if (prevBtn && nextBtn) {
        prevBtn.addEventListener("click", () => changeWeek(-7));
        nextBtn.addEventListener("click", () => changeWeek(7));
    }

    renderEmptyCalendar();
}
