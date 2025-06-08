document.addEventListener("DOMContentLoaded", function () {
  initTruckModalActions();
});

// === МОДАЛКА ДОБАВЛЕНИЯ ГРУЗОВИКА ===
function initTruckModalActions() {
  const truckForm = document.getElementById("truckForm");
  const truckModalTitle = document.getElementById("truckModalTitle");

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

  document.getElementById("assignmentForm")?.addEventListener("submit", function (e) {
    e.preventDefault();

    const formData = new FormData(this);

    fetch("/api/driver/assign", {
      method: "POST",
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          closeAssignmentModal();
          location.reload(); // Или обновить только строку — если нужно, скажи
        } else {
          alert("Ошибка при сохранении назначения");
        }
      })
      .catch(err => {
        console.error("Ошибка при назначении:", err);
        alert("Ошибка сети");
      });
  });
}

// === ОТКРЫТЬ/ЗАКРЫТЬ truckModal ===
function openTruckModal() {
  document.getElementById("truckModal")?.classList.add("show");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.add("show");
  initTruckParser?.(); // если используешь парсинг
}

function closeTruckModal() {
  document.getElementById("truckModal")?.classList.remove("show");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.remove("show");
}

// === Показать детали юнита ===
function showUnitDetails(truckId) {
  fetch(`/fragment/unit_details/${truckId}`)
    .then(response => response.text())
    .then(html => {
      const section = document.getElementById("section-trucks");
      const details = document.getElementById("unit_details_fragment");

      if (section && details) {
        section.style.display = "none";
        details.innerHTML = html;
        details.style.display = "block";
      }
    })
    .catch(err => {
      console.error("Ошибка загрузки деталей юнита:", err);
      alert("Не удалось загрузить детали.");
    });
}

// === Модалка назначения ===
function openAssignmentModal(truckId, driverId = "", companyId = "") {
  document.getElementById("assignmentTruckId").value = truckId;

  const driverSelect = document.getElementById("assignmentDriver");
  const companySelect = document.getElementById("assignmentCompany");

  if (driverSelect) {
    Array.from(driverSelect.options).forEach(option => {
      option.selected = option.value === driverId;
    });
  }

  if (companySelect) {
    Array.from(companySelect.options).forEach(option => {
      option.selected = option.value === companyId;
    });
  }

  document.getElementById("assignmentModal")?.classList.add("show");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.add("show");
}

function closeAssignmentModal() {
  document.getElementById("assignmentModal")?.classList.remove("show");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.remove("show");
}
