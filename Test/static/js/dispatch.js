function initDispatcherCalendars() {
    const blocks = document.querySelectorAll(".dispatch-dispatcher-block");
    blocks.forEach(block => {
        initDispatchCalendar(block);
    });
}

function initDispatchCalendar(containerElement) {
    if (!containerElement) return;

    let drivers = [];
    let loads = [];

    try {
        drivers = JSON.parse(containerElement.dataset.drivers || "[]");
        loads = JSON.parse(containerElement.dataset.loads || "[]");
    } catch (e) {
        console.error("Failed to parse drivers or loads:", e);
        return;
    }

    let currentStartDate = new Date();

    const tbody = containerElement.querySelector(".calendarBody");
    const weekLabel = containerElement.querySelector(".currentWeekLabel");
    const prevBtn = containerElement.querySelector(".prevWeekBtn");
    const nextBtn = containerElement.querySelector(".nextWeekBtn");

    if (!tbody || !weekLabel) return;

    function renderCalendar() {
        const weekDates = getWeekDates(currentStartDate);
        weekLabel.textContent = formatWeekRange(weekDates);
        tbody.innerHTML = "";

        const driverRows = {};

        drivers.forEach(driver => {
            const driverName = driver.name || "—";
            const row = document.createElement("tr");
            row.innerHTML = `<td>${driverName}</td>` + weekDates.map(() => {
                return `<td></td><td></td><td></td>`; // Утро, День, Вечер
            }).join("");
            tbody.appendChild(row);
            driverRows[driver._id] = row;
        });

        const driverIds = Object.keys(driverRows);
        const relevantLoads = loads.filter(load => driverIds.includes(load.assigned_driver));

        paintLoadCells(driverRows, weekDates, relevantLoads);
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

    function paintLoadCells(driverRows, weekDates, loads) {
        const formatDateKey = (date) => {
            const yyyy = date.getUTCFullYear();
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(date.getUTCDate()).padStart(2, '0');
            return `${mm}/${dd}/${yyyy}`;
        };

        const parseDate = (str) => {
            if (!str || typeof str !== 'string') return null;
            const [mm, dd, yyyy] = str.split('/');
            const parsed = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
            return isNaN(parsed.getTime()) ? null : parsed;
        };

        const dateToIndex = {};
        weekDates.forEach((date, i) => {
            const key = formatDateKey(date);
            dateToIndex[key] = i;
        });

        const oneDay = 86400000;

        loads.forEach(load => {
            const driverId = load.assigned_driver;
            if (!driverId) return;

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
                        cell.setAttribute('data-bs-toggle', 'tooltip');
                        cell.setAttribute('data-bs-html', 'true');
                        cell.setAttribute('title', `
<b>ID:</b> ${load.load_id}<br>
<b>From:</b> ${load.pickup?.address || '—'}<br>
<b>To:</b> ${load.delivery?.address || '—'}<br>
<b>Status:</b> ${load.status || '—'}
                        `.trim());
                    }
                }
            }
        });

        // Инициализация тултипов
        const tooltipTriggerList = [].slice.call(containerElement.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
    }

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener("click", () => {
            currentStartDate.setDate(currentStartDate.getDate() - 7);
            renderCalendar();
        });

        nextBtn.addEventListener("click", () => {
            currentStartDate.setDate(currentStartDate.getDate() + 7);
            renderCalendar();
        });
    }

    renderCalendar();
}
