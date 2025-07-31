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

function formatTimeToInput(timeStr) {
  if (!timeStr) return "";
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":");
  if (modifier === "PM" && hours !== "12") hours = parseInt(hours) + 12;
  if (modifier === "AM" && hours === "12") hours = "00";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

// === Вспомогательные функции ===
function determineTimeMode(stop) {
  if (stop.date_from && stop.date_to && stop.time_from && stop.time_to) return "date_time_range";
  if (stop.date && stop.date_to && stop.time_from && !stop.time_to) return "date_range";
  if (stop.date && stop.time_from && stop.time_to) return "date_time_range";
  if (stop.date && stop.time_from) return stop.appointment ? "appointment" : "date";
  if (stop.date) return "date";
  return "appointment"; // fallback
}

function applyTimeModeToBlock(blockElement, stop) {
  const select = blockElement.querySelector(".time-mode-select");
  if (!select) return;

  const mode = determineTimeMode(stop);
  select.value = mode;
  handleTimeModeChange(select);
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

  // --- Pickup ---
  const pickups = data["Pickup Locations"] || [];
  if (pickups.length > 0) {
    const p = pickups[0];
    document.querySelector('[name="pickup_company"]').value = p["Company"] || "";
    document.getElementById("pickup-autocomplete").value = p["Address"] || "";
    document.querySelector('[name="pickup_date"]').value = formatDateToInput(p["date"] || p["Date"]);
    document.querySelector('[name="pickup_date_to"]').value = formatDateToInput(p["date_to"]);
    document.querySelector('[name="pickup_time_from"]').value = formatTimeToInput(p["time_from"]);
    document.querySelector('[name="pickup_time_to"]').value = formatTimeToInput(p["time_to"]);
    document.querySelector('[name="pickup_instructions"]').value = p["Instructions"] || "";
    document.querySelector('[name="pickup_contact_person"]').value = p["Contact Person"] || "";
    document.querySelector('[name="pickup_contact_phone_number"]').value = p["Location Phone Number"] || "";
    document.querySelector('[name="pickup_contact_email"]').value = p["Contact Email"] || "";

    // Выбор режима времени
    const mode = determineTimeMode(p);
    const select = document.querySelector('[name="pickup_appointment"]').closest(".time-block").querySelector(".time-mode-select");
    if (select) {
      select.value = mode;
      handleTimeModeChange(select);
    }
  }

  // --- Extra Pickup ---
  if (pickups.length > 1) {
    const container = document.getElementById('extra-pickups-container');
    pickups.slice(1).forEach((p, index) => {
      addExtraPickup();  // добавляем блок через функцию
      const block = container.children[index];
      block.querySelector(`[name="extra_pickup[${index}][company]"]`).value = p["Company"] || "";
      block.querySelector(`[name="extra_pickup[${index}][address]"]`).value = p["Address"] || "";
      block.querySelector(`[name="extra_pickup[${index}][date]"]`).value = formatDateToInput(p["date"]);
      block.querySelector(`[name="extra_pickup[${index}][date_to]"]`).value = formatDateToInput(p["date_to"]);
      block.querySelector(`[name="extra_pickup[${index}][time_from]"]`).value = formatTimeToInput(p["time_from"]);
      block.querySelector(`[name="extra_pickup[${index}][time_to]"]`).value = formatTimeToInput(p["time_to"]);
      block.querySelector(`[name="extra_pickup[${index}][instructions]"]`).value = p["Instructions"] || "";
      block.querySelector(`[name="extra_pickup[${index}][contact_person]"]`).value = p["Contact Person"] || "";
      block.querySelector(`[name="extra_pickup[${index}][contact_phone_number]"]`).value = p["Location Phone Number"] || "";
      block.querySelector(`[name="extra_pickup[${index}][contact_email]"]`).value = p["Contact Email"] || "";

      const select = block.querySelector(".time-mode-select");
      if (select) {
        select.value = determineTimeMode(p);
        handleTimeModeChange(select);
      }
    });
  }

  // --- Delivery ---
  const deliveries = data["Delivery Locations"] || [];
  if (deliveries.length > 0) {
    const d = deliveries[0];
    document.querySelector('[name="delivery_company"]').value = d["Company"] || "";
    document.getElementById("delivery-autocomplete").value = d["Address"] || "";
    document.querySelector('[name="delivery_date"]').value = formatDateToInput(d["date"] || d["Date"]);
    document.querySelector('[name="delivery_date_to"]').value = formatDateToInput(d["date_to"]);
    document.querySelector('[name="delivery_time_from"]').value = formatTimeToInput(d["time_from"]);
    document.querySelector('[name="delivery_time_to"]').value = formatTimeToInput(d["time_to"]);
    document.querySelector('[name="delivery_instructions"]').value = d["Instructions"] || "";
    document.querySelector('[name="delivery_contact_person"]').value = d["Contact Person"] || "";
    document.querySelector('[name="delivery_contact_phone_number"]').value = d["Location Phone Number"] || "";
    document.querySelector('[name="delivery_contact_email"]').value = d["Contact Email"] || "";

    const select = document.querySelector('[name="delivery_appointment"]').closest(".time-block").querySelector(".time-mode-select");
    if (select) {
      select.value = determineTimeMode(d);
      handleTimeModeChange(select);
    }
  }

  // --- Extra Delivery ---
  if (deliveries.length > 1) {
    const container = document.getElementById('extra-deliveries-container');
    deliveries.slice(1).forEach((d, index) => {
      addExtraDelivery();
      const block = container.children[index];
      block.querySelector(`[name="extra_delivery[${index}][company]"]`).value = d["Company"] || "";
      block.querySelector(`[name="extra_delivery[${index}][address]"]`).value = d["Address"] || "";
      block.querySelector(`[name="extra_delivery[${index}][date]"]`).value = formatDateToInput(d["date"]);
      block.querySelector(`[name="extra_delivery[${index}][date_to]"]`).value = formatDateToInput(d["date_to"]);
      block.querySelector(`[name="extra_delivery[${index}][time_from]"]`).value = formatTimeToInput(d["time_from"]);
      block.querySelector(`[name="extra_delivery[${index}][time_to]"]`).value = formatTimeToInput(d["time_to"]);
      block.querySelector(`[name="extra_delivery[${index}][instructions]"]`).value = d["Instructions"] || "";
      block.querySelector(`[name="extra_delivery[${index}][contact_person]"]`).value = d["Contact Person"] || "";
      block.querySelector(`[name="extra_delivery[${index}][contact_phone_number]"]`).value = d["Location Phone Number"] || "";
      block.querySelector(`[name="extra_delivery[${index}][contact_email]"]`).value = d["Contact Email"] || "";

      const select = block.querySelector(".time-mode-select");
      if (select) {
        select.value = determineTimeMode(d);
        handleTimeModeChange(select);
      }
    });
  }

  // --- Vehicles ---
  const vehicles = data["vehicles"] || [];
  if (vehicles.length > 0) {
    const vehicleBlock = document.getElementById("vehicles-block");
    if (vehicleBlock) vehicleBlock.style.display = "block";

    for (let i = 0; i < vehicles.length; i++) addVehicle();

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

  // --- Расчёт RPM ---
  const allAddrs = [...(pickups || []).map(p => p["Address"]), ...(deliveries || []).map(d => d["Address"])];
  const price = parseFloat(document.querySelector('[name="price"]').value);
  const rpmInput = document.querySelector('[name="RPM"]');
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
