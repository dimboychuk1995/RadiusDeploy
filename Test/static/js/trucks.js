document.addEventListener("DOMContentLoaded", function () {
    initTruckModalActions();
    initTruckSearch();
});

// === ПОИСК ПО ЮНИТУ ===
function initTruckSearch() {
    const searchInput = document.getElementById("search-unit-number");
    const truckTable = document.getElementById("trucks-table");

    if (searchInput && truckTable) {
        searchInput.addEventListener("input", function () {
            const filter = searchInput.value.toLowerCase();
            const rows = truckTable.getElementsByTagName("tr");

            Array.from(rows).forEach(row => {
                const unitCell = row.querySelector(".truck-unit");
                if (unitCell) {
                    const text = unitCell.textContent.toLowerCase();
                    row.style.display = text.includes(filter) ? "" : "none";
                }
            });
        });
    }
}

// === МОДАЛКА ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ ===
function initTruckModalActions() {
    const truckModal = document.getElementById("truckModal");
    const addTruckBtn = document.getElementById("addTruckBtn");
    const truckSpan = document.getElementById("truckCloseBtn");
    const truckForm = document.getElementById("truckForm");
    const truckModalTitle = document.getElementById("truckModalTitle");

    window.openEditTruckModal = function (truckId) {
        const row = document.getElementById(`truck-${truckId}`);
        if (!row) return;

        truckForm.unit_number.value = row.querySelector(".truck-unit")?.textContent.trim() || "";
        truckForm.year.value = row.querySelector(".truck-year")?.textContent.trim() || "";
        truckForm.make.value = row.querySelector(".truck-make")?.textContent.trim() || "";
        truckForm.model.value = row.querySelector(".truck-model")?.textContent.trim() || "";
        truckForm.mileage.value = row.querySelector(".truck-mileage")?.textContent.trim() || "";
        truckForm.vin.value = row.querySelector(".truck-vin")?.textContent.trim() || "";

        const type = row.querySelector(".truck-type")?.textContent.trim() || "";
        const typeSelect = truckForm.querySelector("select[name='type']");
        if (typeSelect) {
            for (let i = 0; i < typeSelect.options.length; i++) {
                if (typeSelect.options[i].text === type) {
                    typeSelect.selectedIndex = i;
                    break;
                }
            }
        }

        truckForm.action = `/edit_truck/${truckId}`;
        truckModalTitle.textContent = "Редактировать грузовик";
        truckModal.style.display = "block";
    };

    window.deleteTruck = function (truckId) {
        if (confirm("Вы уверены, что хотите удалить этот грузовик?")) {
            fetch(`/delete_truck/${truckId}`, {
                method: "POST",
            }).then(response => {
                if (response.ok) {
                    document.getElementById(`truck-${truckId}`).remove();
                } else {
                    alert("Ошибка при удалении грузовика.");
                }
            });
        }
    };

    if (addTruckBtn && truckModal) {
        addTruckBtn.addEventListener("click", () => {
            truckForm.reset();
            truckForm.action = "/add_truck";
            truckModalTitle.textContent = "Добавить грузовик";
            truckModal.style.display = "block";
        });
    }

    if (truckSpan) {
        truckSpan.addEventListener("click", () => {
            truckModal.style.display = "none";
        });
    }

    window.addEventListener("click", (event) => {
        if (event.target === truckModal) {
            truckModal.style.display = "none";
        }
    });
}

// Функция для открытия модалки
function openTruckModal() {
  const modal = document.getElementById("truckModal");
  modal.classList.add("show");  // Показываем модалку с анимацией
}

// Функция для закрытия модалки
document.getElementById("truckCloseBtn").addEventListener("click", function() {
  const modal = document.getElementById("truckModal");
  modal.classList.remove("show");  // Закрываем модалку с анимацией
});

// Открытие модалки при клике на кнопку "Добавить грузовик"
document.getElementById("addTruckBtn").addEventListener("click", openTruckModal);
