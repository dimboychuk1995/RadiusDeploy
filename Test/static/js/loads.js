console.log('loads.js loaded')

function initLoads() {
  console.log("✅ initLoads запущен");

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

  const modal = document.getElementById("addLoadModal");
  if (modal) {
    const observer = new MutationObserver(() => {
      if (modal.classList.contains("show")) {
        updateVisibility();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
}


document.addEventListener("DOMContentLoaded", () => {
    console.log('loads.js loaded')
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

  if (typeSelect) {
    updateVisibility();
    typeSelect.addEventListener("change", updateVisibility);
  }

  // Обновляем видимость при открытии модального окна
  const modal = document.getElementById("addLoadModal");
  if (modal) {
    modal.addEventListener("shown.bs.modal", () => {
      updateVisibility();
    });
  }
});

function addExtraPickup() {
    console.log('loads.js loaded')
  const container = document.getElementById("extra-pickups-container");
  const index = container.children.length;
  const html = `
    <div class="border p-3 mb-2 bg-light rounded">
      <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_pickup[${index}][company]"></div>
      <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_pickup[${index}][address]"></div>
      <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_pickup[${index}][date]"></div>
      <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_pickup[${index}][instructions]"></textarea></div>
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить</button>
    </div>`;
  container.insertAdjacentHTML("beforeend", html);
}

function addExtraDelivery() {
    console.log('loads.js loaded')
  const container = document.getElementById("extra-deliveries-container");
  const index = container.children.length;
  const html = `
    <div class="border p-3 mb-2 bg-light rounded">
      <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_delivery[${index}][company]"></div>
      <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_delivery[${index}][address]"></div>
      <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_delivery[${index}][date]"></div>
      <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_delivery[${index}][instructions]"></textarea></div>
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить</button>
    </div>`;
  container.insertAdjacentHTML("beforeend", html);
}

function addVehicle() {
    console.log('loads.js loaded')
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


// Fallback для показа полей при открытии модального окна без jQuery
const modal = document.getElementById("addLoadModal");
console.log('loads.js loaded')
if (modal) {
  const observer = new MutationObserver(() => {
    if (modal.classList.contains("show")) {
      const typeSelect = document.querySelector('select[name="type"]');
      const descBlock = document.getElementById("description-block");
      const vehiclesBlock = document.getElementById("vehicles-block");
      const selected = typeSelect.value;

      if (selected === "vehicle") {
        descBlock.style.display = "none";
        vehiclesBlock.style.display = "block";
      } else {
        descBlock.style.display = "block";
        vehiclesBlock.style.display = "none";
      }
    }
  });

  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}