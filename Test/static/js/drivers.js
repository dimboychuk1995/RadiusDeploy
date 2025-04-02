function initClickableRows() {
    document.querySelectorAll("tr.clickable-row").forEach(row => {
        row.addEventListener("click", () => {
            const href = row.dataset.href;
            if (href) {
                window.location.href = href;
            }
        });
    });
}

function initDriverFilter() {
    const nameInput = document.getElementById("searchName");
    const unitInput = document.getElementById("searchUnit");
    const rows = document.querySelectorAll("#driversTable tbody tr");

    if (!nameInput || !unitInput || rows.length === 0) return;

    const filterTable = () => {
        const nameVal = nameInput.value.toLowerCase();
        const unitVal = unitInput.value.toLowerCase();

        rows.forEach(row => {
            const name = row.querySelector(".col-name")?.textContent.toLowerCase() || "";
            const unit = row.querySelector(".col-unit")?.textContent.toLowerCase() || "";
            const visible = name.includes(nameVal) && unit.includes(unitVal);
            row.style.display = visible ? "" : "none";
        });
    };

    nameInput.addEventListener("input", filterTable);
    unitInput.addEventListener("input", filterTable);
}

function initEditMode() {
    const editBtn = document.getElementById("editBtn");
    const saveBtn = document.getElementById("saveBtn");
    const form = document.querySelector("form");

    if (!editBtn || !saveBtn || !form) return;

    editBtn.addEventListener("click", () => {
        form.querySelectorAll("input, select").forEach(el => {
            el.removeAttribute("readonly");
            el.removeAttribute("disabled");
        });
        editBtn.classList.add("d-none");
        saveBtn.classList.remove("d-none");
    });
}

function initTabs() {
    const btnInfo = document.getElementById("btn-info");
    const btnLoads = document.getElementById("btn-loads");
    const infoSection = document.getElementById("info-section");
    const loadsSection = document.getElementById("loads-section");

    if (!btnInfo || !btnLoads || !infoSection || !loadsSection) return;

    btnInfo.addEventListener("click", () => {
        infoSection.style.display = "block";
        loadsSection.style.display = "none";
        btnInfo.classList.add("active");
        btnLoads.classList.remove("active");
    });

    btnLoads.addEventListener("click", () => {
        infoSection.style.display = "none";
        loadsSection.style.display = "block";
        btnLoads.classList.add("active");
        btnInfo.classList.remove("active");
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initClickableRows();
    initDriverFilter();
    initEditMode();
    initTabs();
});
