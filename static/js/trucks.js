document.addEventListener("DOMContentLoaded", function () {
  initTruckModalActions();
});


// === МОДАЛКА ===
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
}

function openTruckModal() {
  document.getElementById("truckModal")?.classList.add("show");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.add("show");
  initTruckParser?.();
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

function openAssignmentModal(truckId) {
  document.getElementById("assignmentTruckId").value = truckId;
  document.getElementById("assignmentModal").classList.add("show");
  document.getElementById("assignmentBackdrop").classList.add("show");

  // Позже добавим загрузку водителей и логику назначения
}

function closeAssignmentModal() {
  document.getElementById("assignmentModal").classList.remove("show");
  document.getElementById("assignmentBackdrop").classList.remove("show");
}