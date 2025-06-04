function initSamsaraMileage() {
  document.querySelectorAll('.mileage-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      // Удаляем активные классы
      document.querySelectorAll('.mileage-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.mileage-section').forEach(sec => sec.style.display = 'none');

      // Назначаем активную вкладку
      btn.classList.add('active');
      const target = document.querySelector(btn.dataset.target);
      if (target) target.style.display = 'block';
    });
  });
}

function loadSamsaraDrivers() {
  fetch('/api/samsara/drivers')
    .then(res => res.json())
    .then(drivers => {
      const container = document.getElementById('driversList');
      container.innerHTML = '';

      drivers.forEach(d => {
        const tagNames = Array.isArray(d.tags)
          ? d.tags.map(t => t.name).join(', ')
          : '';

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
        if (!hasTruck) {
          card.classList.add('no-truck');
        }

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
    .catch(err => {
      console.error("Ошибка при загрузке водителей:", err);
    });
}

function loadSamsaraVehicles() {
  fetch('/api/samsara/vehicles')
    .then(res => res.json())
    .then(vehicles => {
      const container = document.getElementById('vehiclesList');
      container.innerHTML = '';

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
    .catch(err => {
      console.error("Ошибка при загрузке траков:", err);
    });
}
