document.addEventListener("DOMContentLoaded", () => {
    initDriverFilter();
    initDriverModalActions();
    bindAssignmentForm(); // ← ЭТОГО НЕ ХВАТАЕТ
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

window.showDriverDetails = function(href) {
    loadDriverDetailsFragment(href);
};

function highlightExpiringDrivers() {
    const rows = document.querySelectorAll('#driversTable tbody tr');
    const today = new Date();

    rows.forEach(row => {
        const status = row.children[6]?.innerText.trim();
        if (status !== 'Active') return;

        const warnings = [];
        let rowClass = '';

        const checks = [
            { label: 'Driver License', index: 12 },
            { label: 'Medical Card', index: 15 },
            { label: 'Drug Test', index: 17 }
        ];

        for (const check of checks) {
            const dateStr = row.children[check.index]?.innerText.trim();
            if (!dateStr) continue;

            const [month, day, year] = dateStr.split('/');
            if (!month || !day || !year) continue;

            const expDate = new Date(`${year}-${month}-${day}`);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                rowClass = 'table-danger';
                warnings.push(`❌ ${check.label} Expired`);
            } else if (diffDays <= 30) {
                if (rowClass !== 'table-danger') rowClass = 'table-warning';
                warnings.push(`⚠️ ${check.label} Expiring Soon`);
            }
        }

        if (rowClass) {
            row.classList.add(rowClass);
            row.setAttribute('data-toggle', 'tooltip');
            row.setAttribute('data-html', 'true');
            row.setAttribute('title', warnings.join('<br>'));
        }
    });

    $('[data-toggle="tooltip"]').tooltip({
        trigger: 'hover',
        placement: 'top',
        container: 'body',
        html: true
    });
}

function openAssignmentModal(driverId, event) {
  if (event) event.stopPropagation();

  const modal = document.getElementById("assignmentModal");
  const backdrop = modal.nextElementSibling;

  if (!modal || !backdrop) return;

  modal.classList.remove("hidden");
  requestAnimationFrame(() => {
    modal.classList.add("open");
    backdrop.classList.add("show");
  });

  // Устанавливаем ID водителя в скрытое поле
  document.getElementById("assignmentDriverId").value = driverId;

  // 🔍 Найдём строку водителя
  const row = document.getElementById(`driver-${driverId}`);
  if (!row) return;

  const truckId = row.getAttribute("data-truck-id");
  const dispatcherId = row.getAttribute("data-dispatcher-id");

  // Устанавливаем значения в селекты
  const truckSelect = modal.querySelector("select[name='truck']");
  const dispatcherSelect = modal.querySelector("select[name='dispatcher']");

  if (truckSelect) truckSelect.value = truckId || "";
  if (dispatcherSelect) dispatcherSelect.value = dispatcherId || "";

  // Обязательно привязать сабмит после вставки
  bindAssignmentForm();
}


function closeAssignmentModal() {
    const modal = document.getElementById("assignmentModal");
    const backdrop = modal.nextElementSibling;

    if (!modal || !backdrop) return;

    modal.classList.remove("open");
    backdrop.classList.remove("show");

    setTimeout(() => {
        modal.classList.add("hidden");
    }, 300);
}

function bindAssignmentForm() {
    const form = document.getElementById("assignmentForm");

    if (!form) {
        console.warn("⚠️ assignmentForm not found in DOM.");
        return; // ❌ форма ещё не загружена — ничего не делаем
    }

    // Защита от двойного навешивания
    if (form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const formData = new FormData(form);

        try {
            const response = await fetch("/api/driver/assign", {
                method: "POST",
                body: formData,
            });

            if (response.ok) {
                closeAssignmentModal();
                location.reload();
            } else {
                alert("Ошибка при сохранении назначения");
            }
        } catch (error) {
            console.error("Ошибка при отправке:", error);
            alert("Ошибка при отправке формы");
        }
    });
}
