function initSamsaraMileage() {
  document.querySelectorAll('.mileage-tab').forEach(btn => {
    // Обработчик клика по вкладке
    btn.addEventListener('click', () => {
      // Удаляем active со всех и скрываем секции
      document.querySelectorAll('.mileage-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.mileage-section').forEach(sec => sec.style.display = 'none');

      // Активируем выбранную вкладку и показываем её контент
      btn.classList.add('active');
      const target = document.querySelector(btn.dataset.target);
      if (target) {
        target.style.display = 'block';

        // Загрузка данных при активации определённых вкладок
        if (btn.dataset.target === "#mileage-stats") {
          loadSamsaraDevices();
        }

        if (btn.dataset.target === "#units-mileage") {
          initUnitsMileage();
        }
      }
    });
  });

  // Привязка формы создания водителя
  bindSamsaraDriverForm();
}


// Загрузка водителей из Samsara API
function loadSamsaraDrivers() {
  fetch('/api/samsara/drivers')
    .then(res => res.json())
    .then(drivers => {
      const container = document.getElementById('driversList');
      container.innerHTML = '';

      // Создание карточек водителей
      drivers.forEach(d => {
        const tagNames = Array.isArray(d.tags) ? d.tags.map(t => t.name).join(', ') : '';
        const truck = d.staticAssignedVehicle?.name || '';
        const phone = d.phone || '-';
        const email = d.email || '-';
        const license = d.licenseNumber || '-';
        const status = d.driverActivationStatus || '-';
        const name = d.name || '';
        const username = d.username || '';
        const hasTruck = !!truck;

        const card = document.createElement('div');
        card.className = 'list-group-item list-group-item-action';
        if (!hasTruck) card.classList.add('no-truck');

        card.innerHTML = `
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="d-flex align-items-center">
              <div class="avatar bg-primary text-white rounded-circle me-3"
                   style="width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                ${name.charAt(0)}
              </div>
              <div>
                <div class="fw-bold fs-5">${name}</div>
                <div class="text-muted small">${username}</div>
              </div>
            </div>
            <span class="badge bg-success">${status}</span>
          </div>
          <div class="row px-3 pb-2 text-muted">
            <div class="col-md-6 col-lg-4"><strong>Phone:</strong> ${phone}</div>
            <div class="col-md-6 col-lg-4"><strong>Email:</strong> ${email}</div>
            <div class="col-md-6 col-lg-4"><strong>Truck:</strong> ${truck || '<span class="text-warning fw-bold">Не назначен</span>'}</div>
            <div class="col-md-6 col-lg-4"><strong>License:</strong> ${license}</div>
            <div class="col-md-6 col-lg-8"><strong>Tags:</strong> ${tagNames}</div>
          </div>
        `;
        container.appendChild(card);
      });
    })
    .catch(err => console.error("Ошибка при загрузке водителей:", err));
}

// Загрузка траков из Samsara API
function loadSamsaraVehicles() {
  fetch('/api/samsara/vehicles')
    .then(res => res.json())
    .then(vehicles => {
      const container = document.getElementById('vehiclesList');
      container.innerHTML = '';

      // Рендер карточек траков
      vehicles.forEach(v => {
        const hasDriver = !!v.staticAssignedDriver?.name;
        const tagNames = Array.isArray(v.tags) ? v.tags.map(t => t.name).join(', ') : '';
        const driverName = hasDriver ? v.staticAssignedDriver.name : 'No driver';
        const licensePlate = v.licensePlate || '';
        const vin = v.vin || '';
        const make = v.make || '';
        const model = v.model || '';
        const year = v.year || '';
        const regMode = v.vehicleRegulationMode || '';

        const card = document.createElement('div');
        card.className = `card shadow-sm ${!hasDriver ? 'bg-warning-subtle' : ''}`;

        card.innerHTML = `
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5 class="mb-0 fw-bold">${v.name || '(No name)'}</h5>
              <span class="badge bg-secondary">${regMode}</span>
            </div>
            <div class="mb-1"><strong>Make:</strong> ${make} ${model} ${year}</div>
            <div class="mb-1"><strong>VIN:</strong> ${vin}</div>
            <div class="mb-1"><strong>Plate:</strong> ${licensePlate}</div>
            <div class="mb-1"><strong>Driver:</strong> ${driverName}</div>
            <div class="mb-1"><strong>Tags:</strong> ${tagNames}</div>
          </div>
        `;

        container.appendChild(card);
      });
    })
    .catch(err => console.error("Ошибка при загрузке траков:", err));
}

// Загрузка информации об устройствах Samsara (Gateways)
function loadSamsaraDevices() {
  fetch("/api/samsara/gateways")
    .then(res => res.json())
    .then(devices => {
      const container = document.getElementById("mileage-stats");
      container.innerHTML = "";

      // Генерация карточек устройств
      devices.forEach(device => {
        const serial = device.serial || "-";
        const model = device.model || "-";
        const status = device.connectionStatus?.healthStatus || "Unknown";
        const accessories = Array.isArray(device.accessoryDevices)
          ? device.accessoryDevices.map(acc => `${acc.model} (${acc.serial})`).join(", ")
          : "—";

        const card = document.createElement("div");
        card.className = "card shadow-sm mb-2";

        card.innerHTML = `
          <div class="card-body">
            <h6 class="mb-2 fw-bold">📟 Serial: ${serial}</h6>
            <div><strong>Model:</strong> ${model}</div>
            <div><strong>Status:</strong> ${status}</div>
            <div><strong>Accessory Devices:</strong> ${accessories}</div>
          </div>
        `;

        container.appendChild(card);
      });
    })
    .catch(err => console.error("Ошибка при загрузке устройств:", err));
}

// Открытие модального окна добавления водителя
function openAddSamsaraDriverModal() {
  document.getElementById("addSamsaraDriverModal")?.classList.add("show");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.add("show");
  loadDriverOptions(); // Загружаем список водителей
}

// Закрытие модального окна
function closeAddSamsaraDriverModal() {
  document.getElementById("addSamsaraDriverModal")?.classList.remove("show");
  document.querySelector(".custom-offcanvas-backdrop")?.classList.remove("show");
}

// Загрузка опций водителей для селекта и автозаполнение формы
function loadDriverOptions() {
  const select = document.getElementById('driverSelect');
  const detailsBlock = document.getElementById('driverDetails');

  if (!select || !detailsBlock) return;

  select.innerHTML = '<option value="">-- Выберите --</option>';
  detailsBlock.style.display = 'none';
  document.getElementById('driverName').value = '';
  document.getElementById('driverPhone').value = '';
  document.getElementById('driverLicense').value = '';

  fetch('/api/drivers_dropdown')
    .then(res => res.json())
    .then(drivers => {
      drivers.forEach(driver => {
        const option = document.createElement('option');
        option.value = driver._id;
        option.textContent = driver.name;
        select.appendChild(option);
      });

      if ($(select).hasClass("select2-hidden-accessible")) {
        $(select).select2('destroy');
      }

      $(select).select2({
        theme: 'bootstrap4',
        placeholder: 'Выберите водителя',
        width: '100%'
      });

      // При выборе водителя заполняем поля формы
      $(select).off('change').on('change', async function () {
        const driverId = this.value;
        if (!driverId) {
          detailsBlock.style.display = 'none';
          return;
        }

        try {
          const res = await fetch(`/api/driver/${driverId}`);
          const data = await res.json();
          console.log("🔍 Driver details:", data);

          document.getElementById('driverName').value = data.name || '';
          document.getElementById('driverPhone').value = data.phone || data.contact_number || '';
          document.getElementById('driverLicense').value = typeof data.license === 'string'
            ? data.license
            : (data.license?.number || '');
          detailsBlock.style.display = 'block';
        } catch (err) {
          console.error('Ошибка при загрузке водителя:', err);
          detailsBlock.style.display = 'none';
        }
      });
    });
}

// Обработка формы добавления водителя в Samsara
function bindSamsaraDriverForm() {
  const form = document.getElementById('addSamsaraDriverForm');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const formData = new FormData(form);
    const data = {
      driverId: formData.get('driverId'),
      name: document.getElementById('driverName').value,
      phone: document.getElementById('driverPhone').value,
      license: document.getElementById('driverLicense').value,
      username: formData.get('username'),
      password: formData.get('password')
    };

    try {
      const res = await fetch('/api/samsara/create_driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();
      if (res.ok && result.success) {
        alert('✅ Водитель успешно создан в Samsara');
        closeAddSamsaraDriverModal();
        loadSamsaraDrivers(); // Обновим список
      } else {
        console.error(result);
        alert('❌ Ошибка: ' + (result.details || 'неизвестная ошибка'));
      }
    } catch (err) {
      console.error("Ошибка при отправке формы:", err);
      alert('❌ Ошибка сети');
    }
  });
}
