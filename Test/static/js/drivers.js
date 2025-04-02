document.addEventListener("DOMContentLoaded", function () {
    // Клик по строке
    document.querySelectorAll("tr.clickable-row").forEach(function (row) {
        row.addEventListener("click", function () {
            const href = this.dataset.href;
            if (href) {
                window.location.href = href;
            }
        });
    });

    // Фильтрация по имени и юнит номеру
    const nameInput = document.getElementById("searchName");
    const unitInput = document.getElementById("searchUnit");
    const rows = document.querySelectorAll("#driversTable tbody tr");

    function filterTable() {
        const nameValue = nameInput.value.toLowerCase();
        const unitValue = unitInput.value.toLowerCase();

        rows.forEach(row => {
            const nameText = row.querySelector(".col-name")?.textContent.toLowerCase() || "";
            const unitText = row.querySelector(".col-unit")?.textContent.toLowerCase() || "";

            const matchesName = nameText.includes(nameValue);
            const matchesUnit = unitText.includes(unitValue);

            if (matchesName && matchesUnit) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }
        });
    }

    nameInput.addEventListener("input", filterTable);
    unitInput.addEventListener("input", filterTable);
});
