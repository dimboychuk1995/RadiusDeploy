document.addEventListener("DOMContentLoaded", () => {
    initDriverFilter();
    initClickableRows();
    initDriverModalActions();
});

function initDriverFilter() {
    const nameInput = document.getElementById("searchNameInput");
    const unitInput = document.getElementById("searchUnitNumberInput");
    const dispatcherSelect = document.getElementById("searchDispatcherSelect");
    const table = document.getElementById("driversTable");

    if (!nameInput || !unitInput || !dispatcherSelect || !table) return;

    const filterDrivers = () => {
        const name = nameInput.value.toLowerCase();
        const unit = unitInput.value.toLowerCase();
        const dispatcher = dispatcherSelect.value.toLowerCase();

        table.querySelectorAll("tbody tr").forEach(row => {
            const rowName = row.querySelector(".driver-name")?.textContent.toLowerCase() || "";
            const rowUnit = row.querySelector(".truck-unit")?.textContent.toLowerCase() || "";
            const rowDispatcher = row.querySelector(".dispatcher-name")?.textContent.toLowerCase() || "";

            const matches = rowName.includes(name) && rowUnit.includes(unit) && rowDispatcher.includes(dispatcher);
            row.style.display = matches ? "" : "none";
        });
    };

    nameInput.addEventListener("input", filterDrivers);
    unitInput.addEventListener("input", filterDrivers);
    dispatcherSelect.addEventListener("change", filterDrivers);
}

function initClickableRows() {
    document.querySelectorAll(".clickable-row").forEach(row => {
        const href = row.getAttribute("data-href");
        if (href) {
            row.addEventListener("click", () => {
                loadDriverDetailsFragment(href);
            });
        }
    });
}

function initDriverModalActions() {
    const modal = document.getElementById("driverModal");
    const form = document.getElementById("driverForm");
    const title = document.getElementById("driverModalTitle");

    window.openDriverModal = () => {
        form.reset();
        form.action = "/add_driver";
        title.textContent = "Добавить водителя";
        modal.classList.add("open");
    };

    window.openEditDriverModal = function (driverId) {
        const row = document.getElementById(`driver-${driverId}`);
        if (!row) return;

        form.name.value = row.querySelector(".driver-name")?.textContent.trim();
        form.license_number.value = row.querySelector(".driver-license")?.textContent.trim();
        form.contact_number.value = row.querySelector(".driver-phone")?.textContent.trim();
        form.address.value = row.querySelector(".driver-address")?.textContent.trim();
        form.email.value = row.querySelector(".driver-email")?.textContent.trim();
        form.dob.value = row.querySelector(".driver-dob")?.textContent.trim();
        form.driver_type.value = row.querySelector(".driver-type")?.textContent.trim();

        const truckId = row.getAttribute("data-truck-id");
        const dispatcherId = row.getAttribute("data-dispatcher-id");
        if (truckId) form.truck.value = truckId;
        if (dispatcherId) form.dispatcher.value = dispatcherId;

        form.action = `/edit_driver/${driverId}`;
        title.textContent = "Редактировать водителя";
        modal.classList.add("open");
    };

    window.deleteDriver = function (driverId) {
        if (confirm("Удалить водителя?")) {
            fetch(`/delete_driver/${driverId}`, { method: "POST" }).then(res => {
                if (res.ok) {
                    document.getElementById(`driver-${driverId}`)?.remove();
                } else {
                    alert("Ошибка при удалении");
                }
            });
        }
    };

    window.closeDriverModal = () => {
        modal.classList.remove("open");
    };
}

function loadDriverDetailsFragment(href) {
    fetch(href)
        .then(response => response.text())
        .then(html => {
            document.getElementById("section-drivers").style.display = "none";
            const details = document.getElementById("driver-details");
            details.innerHTML = html;
            details.style.display = "block";

            const script = document.createElement("script");
            script.src = "/static/js/driver_detail.js";
            script.onload = () => {
                if (typeof initDriverDetailActions === "function") {
                    initDriverDetailActions();
                }
            };
            document.body.appendChild(script);
        })
        .catch(error => {
            console.error("Ошибка загрузки данных водителя:", error);
        });
}

function highlightExpiringDrivers() {
  const rows = document.querySelectorAll('#driversTable tbody tr');
  const today = new Date();

  rows.forEach(row => {
    const status = row.children[6]?.innerText.trim();
    const expDateStr = row.children[12]?.innerText.trim();

    if (status !== 'Active' || !expDateStr) return;

    const [month, day, year] = expDateStr.split('/');
    if (!month || !day || !year) return;

    const expDate = new Date(`${year}-${month}-${day}`);
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays <= 30) {
      // 💡 добавляем bootstrap-класс и свой класс
      row.classList.add('table-warning', 'expiring-highlight');

      // Тултип по всей строке
      row.setAttribute('data-bs-toggle', 'tooltip');
      row.setAttribute('title', '⚠️ Driver License Expiring Soon');
    }
  });

  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipTriggerList.forEach(el => {
    new bootstrap.Tooltip(el, {
      trigger: 'hover',
      placement: 'top',
      customClass: 'expiring-tooltip'
    });
  });
}