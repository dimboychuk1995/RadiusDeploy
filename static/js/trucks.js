document.addEventListener("DOMContentLoaded", function () {
  initTruckModalActions();
  initTruckSearch();
});

// === ПОИСК ===
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

// === МОДАЛКА ===
function initTruckModalActions() {
  const truckForm = document.getElementById("truckForm");
  const truckModalTitle = document.getElementById("truckModalTitle");

  window.openEditTruckModal = function (truckId) {
    const row = document.getElementById(`truck-${truckId}`);
    if (!row || !truckForm) return;

    truckForm.unit_number.value = row.querySelector(".truck-unit")?.textContent.trim() || "";
    truckForm.year.value = row.querySelector(".truck-year")?.textContent.trim() || "";
    truckForm.make.value = row.querySelector(".truck-make")?.textContent.trim() || "";
    truckForm.model.value = row.querySelector(".truck-model")?.textContent.trim() || "";
    truckForm.mileage.value = row.querySelector(".truck-mileage")?.textContent.trim() || "";
    truckForm.vin.value = row.querySelector(".truck-vin")?.textContent.trim() || "";

    truckForm.action = `/edit_truck/${truckId}`;
    truckModalTitle.textContent = "Редактировать грузовик";
    openTruckModal();
  };

  window.deleteTruck = function (truckId) {
    if (confirm("Вы уверены, что хотите удалить этот грузовик?")) {
      fetch(`/delete_truck/${truckId}`, { method: "POST" })
        .then(response => {
          if (response.ok) {
            document.getElementById(`truck-${truckId}`)?.remove();
          } else {
            alert("Ошибка при удалении грузовика.");
          }
        });
    }
  };

  document.getElementById("addTruckBtn")?.addEventListener("click", () => {
    if (truckForm && truckModalTitle) {
      truckForm.reset();
      truckForm.action = "/add_truck";
      truckModalTitle.textContent = "Добавить грузовик";
      openTruckModal();
    }
  });
}

function openTruckModal() {
  document.getElementById("truckModal")?.classList.add("show");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.add("show");
  initTruckParser(); // 👈 Добавь сюда
}

function closeTruckModal() {
  document.getElementById("truckModal")?.classList.remove("show");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.remove("show");
}
