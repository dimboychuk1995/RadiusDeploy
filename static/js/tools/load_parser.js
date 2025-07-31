function initLoadParser() {
  setTimeout(() => {
    const rateConInput = document.getElementById("rateConInput");
    if (!rateConInput) return;

    rateConInput.addEventListener("change", () => {
      const file = rateConInput.files[0];
      if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;

      const formData = new FormData();
      formData.append("file", file);

      const overlay = document.getElementById("pdfOverlay");
      if (overlay) overlay.classList.remove("d-none");

      fetch("/api/parse_load_pdf", {
        method: "POST",
        body: formData
      })
        .then(res => res.json())
        .then(data => {
          autofillLoadForm(data);
        })
        .catch(() => {
          alert("Ошибка при отправке файла на сервер.");
        })
        .finally(() => {
          if (overlay) overlay.classList.add("d-none");
        });
    });
  }, 100);
}


function formatDateToInput(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
}

function autofillLoadForm(data) {
  if (!data) return;

  document.getElementById('extra-pickups-container').innerHTML = "";
  document.getElementById('extra-deliveries-container').innerHTML = "";

  document.querySelector('[name="load_id"]').value = data["Load Number"] || "";
  document.querySelector('[name="broker_load_id"]').value = data["Broker Name"] || "";

  const brokerSelect = $('#brokerSelect');
  const brokerName = data["Broker Name"] || "";

  if (brokerSelect.length && brokerName) {
    if (brokerSelect.find(`option[value="${brokerName}"]`).length === 0) {
      brokerSelect.append(new Option(brokerName, brokerName, true, true)).trigger("change");
    } else {
      brokerSelect.val(brokerName).trigger("change");
    }
  }

  document.querySelector('[name="type"]').value = data["Type Of Load"] || "";
  document.querySelector('[name="price"]').value = data["Price"] || "";
  document.querySelector('[name="weight"]').value = data["Weight"] || "";
  document.querySelector('[name="load_description"]').value = data["Load Description"] || "";

  const brokerPhone = document.querySelector('[name="broker_phone_number"]');
  if (brokerPhone) brokerPhone.value = data["Broker Phone Number"] || "";

  const brokerEmail = document.querySelector('[name="broker_email"]');
  if (brokerEmail) brokerEmail.value = data["Broker Email"] || "";

  const totalMiles = document.querySelector('[name="total_miles"]');
  if (totalMiles) totalMiles.value = data["Total Miles"] || "";

  // --- Автозаполнение Pickup Locations ---
  const pickups = data["Pickup Locations"] || [];
  if (pickups.length > 0) {
    const p = pickups[0];
    document.querySelector('[name="pickup_company"]').value = p["Company"] || "";
    document.getElementById("pickup-autocomplete").value = p["Address"] || "";
    document.querySelector('[name="pickup_date"]').value = formatDateToInput(p["date"] || p["Date"]);
    document.querySelector('[name="pickup_instructions"]').value = p["Instructions"] || "";
    document.querySelector('[name="pickup_contact_person"]').value = p["Contact Person"] || "";
    document.querySelector('[name="pickup_contact_phone_number"]').value = p["Location Phone Number"] || "";
    document.querySelector('[name="pickup_contact_email"]').value = p["Contact Email"] || "";
  }
  if (pickups.length > 1) {
    const container = document.getElementById('extra-pickups-container');
    pickups.slice(1).forEach((p, index) => {
      const html = `
        <div class="border p-3 mb-2 bg-light rounded">
          <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_pickup[${index}][company]" value="${p["Company"] || ""}"></div>
          <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_pickup[${index}][address]" value="${p["Address"] || ""}"></div>
          <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_pickup[${index}][date]" value="${formatDateToInput(p["date"] || p["Date"]) || ""}"></div>
          <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_pickup[${index}][instructions]">${p["Instructions"] || ""}</textarea></div>
          <div class="form-group"><label>Контактное лицо</label><input type="text" class="form-control" name="extra_pickup[${index}][contact_person]" value="${p["Contact Person"] || ""}"></div>
          <div class="form-group"><label>Телефон</label><input type="text" class="form-control" name="extra_pickup[${index}][contact_phone_number]" value="${p["Location Phone Number"] || ""}"></div>
          <div class="form-group"><label>Email</label><input type="email" class="form-control" name="extra_pickup[${index}][contact_email]" value="${p["Contact Email"] || ""}"></div>
          <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить</button>
        </div>`;
      container.insertAdjacentHTML("beforeend", html);
    });
  }

  // --- Автозаполнение Delivery Locations ---
  const deliveries = data["Delivery Locations"] || [];
  if (deliveries.length > 0) {
    const d = deliveries[0];
    document.querySelector('[name="delivery_company"]').value = d["Company"] || "";
    document.getElementById("delivery-autocomplete").value = d["Address"] || "";
    document.querySelector('[name="delivery_date"]').value = formatDateToInput(d["date"] || d["Date"]);
    document.querySelector('[name="delivery_instructions"]').value = d["Instructions"] || "";
    document.querySelector('[name="delivery_contact_person"]').value = d["Contact Person"] || "";
    document.querySelector('[name="delivery_contact_phone_number"]').value = d["Location Phone Number"] || "";
    document.querySelector('[name="delivery_contact_email"]').value = d["Contact Email"] || "";
  }
  if (deliveries.length > 1) {
    const container = document.getElementById('extra-deliveries-container');
    deliveries.slice(1).forEach((d, index) => {
      const html = `
        <div class="border p-3 mb-2 bg-light rounded">
          <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_delivery[${index}][company]" value="${d["Company"] || ""}"></div>
          <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_delivery[${index}][address]" value="${d["Address"] || ""}"></div>
          <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_delivery[${index}][date]" value="${formatDateToInput(d["date"] || d["Date"]) || ""}"></div>
          <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_delivery[${index}][instructions]">${d["Instructions"] || ""}</textarea></div>
          <div class="form-group"><label>Контактное лицо</label><input type="text" class="form-control" name="extra_delivery[${index}][contact_person]" value="${d["Contact Person"] || ""}"></div>
          <div class="form-group"><label>Телефон</label><input type="text" class="form-control" name="extra_delivery[${index}][contact_phone_number]" value="${d["Location Phone Number"] || ""}"></div>
          <div class="form-group"><label>Email</label><input type="email" class="form-control" name="extra_delivery[${index}][contact_email]" value="${d["Contact Email"] || ""}"></div>
          <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить</button>
        </div>`;
      container.insertAdjacentHTML("beforeend", html);
    });
  }

  // --- Автозаполнение транспортных средств ---
  const vehicles = data["vehicles"] || [];
  if (vehicles.length > 0) {
    const vehicleBlock = document.getElementById("vehicles-block");
    if (vehicleBlock) vehicleBlock.style.display = "block";

    for (let i = 0; i < vehicles.length; i++) {
      addVehicle();
    }

    vehicles.forEach((v, i) => {
      const vehicleDiv = document.querySelectorAll("#vehicle-entries > div")[i];
      if (!vehicleDiv) return;

      vehicleDiv.querySelector(`[name="vehicles[${i}][year]"]`).value = v["year"] || "";
      vehicleDiv.querySelector(`[name="vehicles[${i}][make]"]`).value = v["make"] || "";
      vehicleDiv.querySelector(`[name="vehicles[${i}][model]"]`).value = v["model"] || "";
      vehicleDiv.querySelector(`[name="vehicles[${i}][vin]"]`).value = v["VIN"] || "";
      vehicleDiv.querySelector(`[name="vehicles[${i}][mileage]"]`).value = v["mileage"] || "";
      vehicleDiv.querySelector(`[name="vehicles[${i}][description]"]`).value = v["color"] || "";
    });
  }

  // === Расчёт Rate Per Mile ===
  const pickupAddrs = (data["Pickup Locations"] || []).map(p => p["Address"]);
  const deliveryAddrs = (data["Delivery Locations"] || []).map(d => d["Address"]);
  const allAddrs = [...pickupAddrs, ...deliveryAddrs];
  const price = parseFloat(document.querySelector('[name="price"]').value);
  const rpmInput = document.querySelector('[name="RPM"]');

  if (price && allAddrs.length >= 2 && rpmInput) {
    calculateTotalMiles(allAddrs).then(totalMiles => {
      if (totalMiles > 0) {
        const rpm = price / totalMiles;
        rpmInput.value = rpm.toFixed(2);
      }
    });
  }

  const totalMilesInput = document.querySelector('[name="total_miles"]');

  if (price && allAddrs.length >= 2 && rpmInput && totalMilesInput) {
    calculateTotalMiles(allAddrs).then(totalMiles => {
      if (totalMiles > 0) {
        const rpm = price / totalMiles;
        rpmInput.value = rpm.toFixed(2);
        totalMilesInput.value = totalMiles;
      }
    });
  }
}





window.initLoadParser = initLoadParser;

async function calculateTotalMiles(addresses) {
  const cleanedAddresses = addresses.filter(a => a && a.trim() !== "");
  if (cleanedAddresses.length < 2) return 0;

  let totalMiles = 0;

  for (let i = 0; i < cleanedAddresses.length - 1; i++) {
    const origin = cleanedAddresses[i];
    const destination = cleanedAddresses[i + 1];

    try {
      const res = await fetch("/api/get_mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination })
      });

      const data = await res.json();
      if (data.miles) {
        totalMiles += data.miles;
        console.log(`✅ ${origin} → ${destination}: ${data.miles} mi`);
      } else {
        console.warn("❌ Ошибка маршрута:", data);
      }
    } catch (err) {
      console.warn("❌ Ошибка при запросе к API сервера:", err);
    }
  }

  return Math.round(totalMiles);
}

window.initLoadParser = initLoadParser;
