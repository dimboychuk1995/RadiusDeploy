// === initLoads ===
function initLoads() {
  const typeSelect = document.querySelector('select[name="type"]');
  const descBlock = document.getElementById("description-block");
  const vehiclesBlock = document.getElementById("vehicles-block");

  function updateVisibility() {
    const selected = typeSelect.value;
    if (selected === "vehicle") {
      descBlock.style.display = "none";
      vehiclesBlock.style.display = "block";
    } else {
      descBlock.style.display = "block";
      vehiclesBlock.style.display = "none";
    }
  }

  if (typeSelect && descBlock && vehiclesBlock) {
    updateVisibility();
    typeSelect.addEventListener("change", updateVisibility);
  }

  const modal = document.getElementById("createLoadModal");
  if (modal) {
    const observer = new MutationObserver(() => {
      if (modal.classList.contains("show")) {
        updateVisibility();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  expandAllCompanySections();

}

// === Extra Pickup ===
function addExtraPickup() {
  const container = document.getElementById("extra-pickups-container");
  const index = container.children.length;
  const html = `
    <div class="border p-3 mb-2 bg-light rounded">
      <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_pickup[${index}][company]"></div>
      <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_pickup[${index}][address]"></div>
      <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_pickup[${index}][date]"></div>
      <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_pickup[${index}][instructions]"></textarea></div>
      <div class="form-group"><label>Контактное лицо</label><input type="text" class="form-control" name="extra_pickup[${index}][contact_person]"></div>
      <div class="form-group"><label>Телефон</label><input type="text" class="form-control" name="extra_pickup[${index}][contact_phone_number]"></div>
      <div class="form-group"><label>Email</label><input type="email" class="form-control" name="extra_pickup[${index}][contact_email]"></div>
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить</button>
    </div>`;
  container.insertAdjacentHTML("beforeend", html);
}

// === Extra Delivery ===
function addExtraDelivery() {
  const container = document.getElementById("extra-deliveries-container");
  const index = container.children.length;
  const html = `
    <div class="border p-3 mb-2 bg-light rounded">
      <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_delivery[${index}][company]"></div>
      <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_delivery[${index}][address]"></div>
      <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_delivery[${index}][date]"></div>
      <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_delivery[${index}][instructions]"></textarea></div>
      <div class="form-group"><label>Контактное лицо</label><input type="text" class="form-control" name="extra_delivery[${index}][contact_person]"></div>
      <div class="form-group"><label>Телефон</label><input type="text" class="form-control" name="extra_delivery[${index}][contact_phone_number]"></div>
      <div class="form-group"><label>Email</label><input type="email" class="form-control" name="extra_delivery[${index}][contact_email]"></div>
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить</button>
    </div>`;
  container.insertAdjacentHTML("beforeend", html);
}

// === Vehicles ===
function addVehicle() {
  const container = document.getElementById("vehicle-entries");
  const index = container.children.length;
  const html = `
    <div class="border p-3 mb-3 bg-light rounded">
      <h6>Авто #${index + 1}</h6>
      <div class="form-group"><label>Year</label><input type="text" class="form-control" name="vehicles[${index}][year]"></div>
      <div class="form-group"><label>Make</label><input type="text" class="form-control" name="vehicles[${index}][make]"></div>
      <div class="form-group"><label>Model</label><input type="text" class="form-control" name="vehicles[${index}][model]"></div>
      <div class="form-group"><label>VIN</label><input type="text" class="form-control" name="vehicles[${index}][vin]"></div>
      <div class="form-group"><label>Mileage</label><input type="text" class="form-control" name="vehicles[${index}][mileage]"></div>
      <div class="form-group"><label>Description</label><textarea class="form-control" name="vehicles[${index}][description]"></textarea></div>
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить авто</button>
    </div>`;
  container.insertAdjacentHTML("beforeend", html);
}

// === Открытие/закрытие модалки ===
function openLoadModal() {
  const modal = document.getElementById("createLoadModal");
  const backdrop = document.querySelector(".custom-offcanvas-backdrop");
  if (modal) modal.classList.add("open");
  if (backdrop) backdrop.classList.add("show");
}

function closeLoadModal() {
  const modal = document.getElementById("createLoadModal");
  const backdrop = document.querySelector(".custom-offcanvas-backdrop");
  if (modal) modal.classList.remove("open");
  if (backdrop) backdrop.classList.remove("show");
}


function initBrokerCustomerSelect() {
  const typeSelect = document.querySelector('[name="broker_customer_type"]');
  const brokerSelect = $('#brokerSelect');
  const emailInput = document.querySelector('[name="broker_email"]');
  const phoneInput = document.querySelector('[name="broker_phone_number"]');

  let currentOptions = [];

  function loadOptions(type) {
    brokerSelect.empty().append(new Option("Загрузка...", ""));
    fetch(`/api/${type}s_list`)
      .then(res => res.json())
      .then(data => {
        currentOptions = data;
        brokerSelect.empty().append(new Option("", ""));
        data.forEach(item => {
          brokerSelect.append(new Option(item.name, item.name));
        });
      });
  }

  brokerSelect.select2({
    placeholder: "Введите или выберите...",
    allowClear: true,
    tags: true,  // ✅ Разрешает ручной ввод
    width: '100%'
  });

  brokerSelect.on('change', function () {
    const selectedName = this.value;
    const found = currentOptions.find(o => o.name === selectedName);

    if (found) {
      if (emailInput) emailInput.value = found.email || "";
      if (phoneInput) phoneInput.value = found.phone || "";
    } else {
      if (emailInput) emailInput.value = "";
      if (phoneInput) phoneInput.value = "";
    }
  });

  typeSelect?.addEventListener("change", () => {
    const type = typeSelect.value;
    if (type === "broker" || type === "customer") {
      loadOptions(type);
    }
  });

  if (typeSelect?.value === "broker" || typeSelect?.value === "customer") {
    loadOptions(typeSelect.value);
  }
}

function deleteLoad(loadId) {
  if (!confirm("Вы уверены, что хотите удалить этот груз?")) return;

  fetch(`/api/delete_load/${loadId}`, {
    method: 'DELETE'
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert("Груз удалён");
        location.reload();
      } else {
        alert("Ошибка: " + data.message);
      }
    })
    .catch(err => {
      console.error("Ошибка при удалении:", err);
      alert("Произошла ошибка при удалении груза");
    });
}

document.addEventListener("DOMContentLoaded", () => {
  initLoads();
});

// === Назначение водителя ===
function openAssignDriverModal(loadId, currentDriverId = null) {
  const modal = document.getElementById("assignDriverModal");
  const backdrop = document.getElementById("assignDriverBackdrop");
  const input = document.getElementById("assign-load-id");
  const select = document.getElementById("assign-driver-select");

  if (input) input.value = loadId;

  // Установить выбранного водителя, если он есть
  if (select && currentDriverId) {
    select.value = currentDriverId;
  } else if (select) {
    select.value = "";
  }

  modal.classList.add("open");
  backdrop.classList.add("show");
}

function closeAssignDriverModal() {
  const modal = document.getElementById("assignDriverModal");
  const backdrop = document.getElementById("assignDriverBackdrop");

  modal.classList.remove("open");
  backdrop.classList.remove("show");
}

function submitAssignDriver() {
  closeAssignDriverModal(); // 👉 СРАЗУ закрываем
  const loadId = document.getElementById("assign-load-id").value;
  const driverId = document.getElementById("assign-driver-select").value;

  fetch(`/api/assign_driver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ load_id: loadId, driver_id: driverId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert("Водитель назначен");
      location.reload();
    } else {
      alert("Ошибка: " + data.message);
    }
  })
  .catch(err => {
    console.error("Ошибка при назначении:", err);
    alert("Произошла ошибка");
  });
}


function toggleCompanySection(companyId) {
  const section = document.getElementById(`section-${companyId}`);
  const icon = document.getElementById(`icon-${companyId}`);

  const isVisible = section.style.display !== "none";

  if (isVisible) {
    section.style.display = "none";
    icon.innerHTML = "&#9654;"; // ▶
  } else {
    section.style.display = "block";
    icon.innerHTML = "&#9660;"; // ▼
  }
}

function expandAllCompanySections() {
  document.querySelectorAll(".company-section").forEach(section => {
    section.style.display = "block";
  });
  document.querySelectorAll(".toggle-icon").forEach(icon => {
    icon.innerHTML = "&#9660;"; // ▼
  });
}

// More loads
function showMoreLoads(companyId) {
  const rows = document.querySelectorAll(`.company-row-${companyId}`);
  const offset = rows.length;

  fetch(`/fragment/more_loads/${companyId}?offset=${offset}`)
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector(`#company-table-${companyId} tbody`);
      tbody.insertAdjacentHTML("beforeend", data.html);

      if (!data.has_more) {
        const button = document.querySelector(`#show-more-btn-${companyId}`);
        if (button) button.remove();
      }
    })
    .catch(err => {
      console.error("Ошибка загрузки:", err);
    });
}

// search loads 
  let globalSearchTimer = null;

  function searchAllLoads() {
    const query = document.getElementById("global-load-search").value.trim();
    const container = document.getElementById("loads-result-container");

    if (globalSearchTimer) {
      clearTimeout(globalSearchTimer);
    }

    globalSearchTimer = setTimeout(() => {
      if (query === "") {
        // Перезагрузим фрагмент без фильтра — GET на loads_fragment
        fetch('/fragment/loads_fragment')
          .then(res => res.text())
          .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const fresh = doc.getElementById("loads-result-container");
            if (fresh) container.innerHTML = fresh.innerHTML;
          });
        return;
      }

      fetch(`/fragment/search_all_loads?q=${encodeURIComponent(query)}`)
        .then(res => res.text())
        .then(html => {
          container.innerHTML = html;
        })
        .catch(err => {
          console.error("Ошибка при глобальном поиске:", err);
        });
    }, 300);  // debounce 300ms
  }