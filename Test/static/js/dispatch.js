function initDispatchCalendar() {
    const container = document.getElementById("dispatchContainer");
    if (!container) return;

    let drivers = [];
    let loads = [];

    try {
        drivers = JSON.parse(container.dataset.drivers || "[]");
        loads = JSON.parse(container.dataset.loads || "[]");
    } catch (e) {
        console.error("Failed to parse drivers or loads:", e);
    }

    let currentStartDate = new Date();

    function renderEmptyCalendar() {
        const tbody = document.getElementById("calendarBody");
        const weekLabel = document.getElementById("currentWeek");
        if (!tbody || !weekLabel) return;

        const weekDates = getWeekDates(currentStartDate);
        weekLabel.textContent = formatWeekRange(weekDates);
        tbody.innerHTML = "";

        const driverRows = {};

        drivers.forEach(driver => {
            const driverName = driver.name || "—";
            const row = document.createElement("tr");
            row.innerHTML = `<td>${driverName}</td>` + weekDates.map(() => {
                return `<td></td><td></td><td></td>`;
            }).join("");
            tbody.appendChild(row);
            driverRows[driver._id] = row;
        });

        paintLoadCells(driverRows, weekDates);
    }

    function changeWeek(deltaDays) {
        currentStartDate.setDate(currentStartDate.getDate() + deltaDays);
        renderEmptyCalendar();
    }

    function getWeekDates(startDate) {
        const date = new Date(startDate);
        const day = date.getUTCDay();
        const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        monday.setUTCDate(monday.getUTCDate() - ((day + 6) % 7));
        const result = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setUTCDate(monday.getUTCDate() + i);
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

    function paintLoadCells(driverRows, weekDates) {
        const formatDateKey = (date) => {
            const yyyy = date.getUTCFullYear();
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(date.getUTCDate()).padStart(2, '0');
            return `${mm}/${dd}/${yyyy}`;
        };

        const parseDate = (str) => {
            if (!str || typeof str !== 'string') return null;
            const [mm, dd, yyyy] = str.split('/');
            return new Date(Date.UTC(+yyyy, +mm - 1, +dd));
        };

        const dateToIndex = {};
        weekDates.forEach((date, i) => {
            const key = formatDateKey(date);
            dateToIndex[key] = i;
        });

        const oneDay = 86400000;

        loads.forEach(load => {
            const driverId = load.assigned_driver;
            const row = driverRows[driverId];
            if (!row) return;

            const pickupDate = parseDate(load.pickup?.date);
            const deliveryDate = parseDate(load.delivery?.date);

            if (!pickupDate || !deliveryDate) return;

            const start = pickupDate.getTime();
            const end = deliveryDate.getTime();

            for (let ts = start; ts <= end; ts += oneDay) {
                const d = new Date(ts);
                const key = formatDateKey(d);

                if (!(key in dateToIndex)) continue;

                const dayIndex = dateToIndex[key];
                const baseCellIndex = 1 + dayIndex * 3;

                for (let i = 0; i < 3; i++) {
                    const cell = row.children[baseCellIndex + i];
                    if (cell) {
                        cell.style.backgroundColor = "#cfe2ff";
                        cell.title = `Load ${load.load_id}`;
                    }
                }
            }
        });
    }

    const prevBtn = document.getElementById("prevWeekBtn");
    const nextBtn = document.getElementById("nextWeekBtn");
    if (prevBtn && nextBtn) {
        prevBtn.addEventListener("click", () => changeWeek(-7));
        nextBtn.addEventListener("click", () => changeWeek(7));
    }

    renderEmptyCalendar();
}
