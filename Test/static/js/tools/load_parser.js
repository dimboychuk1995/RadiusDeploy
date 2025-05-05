function initLoadParser() {
  console.log("✅ initLoadParser вызван");

  setTimeout(() => {
    const rateConInput = document.getElementById("rateConInput");
    if (!rateConInput) {
      console.warn("❌ rateConInput не найден (initLoadParser)");
      return;
    }

    rateConInput.addEventListener("change", () => {
      const file = rateConInput.files[0];
      console.log("📁 Выбран файл:", file);

      if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;

      const formData = new FormData();
      formData.append("file", file);

      console.log("📤 Отправка на /api/parse_load_pdf...");

      fetch("/api/parse_load_pdf", {
        method: "POST",
        body: formData
      })
        .then(res => res.json())
        .then(data => {
          console.log("✅ Ответ от API:", data);
          autofillLoadForm(data);
        })
        .catch(err => {
          console.error("❌ Ошибка при fetch:", err);
          alert("Ошибка при отправке файла на сервер.");
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

  const pickups = data["Pickup Locations"] || [];
  if (pickups.length > 0) {
    const p = pickups[0];
    document.querySelector('[name="pickup_company"]').value = p["Company"] || "";
    document.querySelector('[name="pickup_address"]').value = p["Address"] || "";
    document.querySelector('[name="pickup_date"]').value = formatDateToInput(p["Date"]);
    document.querySelector('[name="pickup_instructions"]').value = p["Instructions"] || "";
    document.querySelector('[name="pickup_contact_person"]').value = p["Contact Person"] || "";
    document.querySelector('[name="pickup_contact_phone_number"]').value = p["Location Phone Number"] || "";
    document.querySelector('[name="pickup_contact_email"]').value = p["Contact Email"] || "";
  }

  if (pickups.length > 1) {
    const container = document.getElementById('extra-pickups-container');
    pickups.slice(1).forEach((p, index) => {
      const idx = Date.now() + index;
      const html = `
        <div class="extra-pickup-block mb-3" data-idx="${idx}">
          <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_pickup[${idx}][company]" value="${p["Company"] || ""}"></div>
          <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_pickup[${idx}][address]" value="${p["Address"] || ""}"></div>
          <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_pickup[${idx}][date]" value="${formatDateToInput(p["Date"]) || ""}"></div>
          <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_pickup[${idx}][instructions]">${p["Instructions"] || ""}</textarea></div>
          <div class="form-group"><label>Контактное лицо</label><input type="text" class="form-control" name="extra_pickup[${idx}][contact_person]" value="${p["Contact Person"] || ""}"></div>
          <div class="form-group"><label>Телефон</label><input type="text" class="form-control" name="extra_pickup[${idx}][contact_phone_number]" value="${p["Location Phone Number"] || ""}"></div>
          <div class="form-group"><label>Email</label><input type="email" class="form-control" name="extra_pickup[${idx}][contact_email]" value="${p["Contact Email"] || ""}"></div>
        </div>`;
      container.insertAdjacentHTML("beforeend", html);
    });
  }

  const deliveries = data["Delivery Locations"] || [];
  if (deliveries.length > 0) {
    const d = deliveries[0];
    document.querySelector('[name="delivery_company"]').value = d["Company"] || "";
    document.querySelector('[name="delivery_address"]').value = d["Address"] || "";
    document.querySelector('[name="delivery_date"]').value = formatDateToInput(d["Date"]);
    document.querySelector('[name="delivery_instructions"]').value = d["Instructions"] || "";
    document.querySelector('[name="delivery_contact_person"]').value = d["Contact Person"] || "";
    document.querySelector('[name="delivery_contact_phone_number"]').value = d["Location Phone Number"] || "";
    document.querySelector('[name="delivery_contact_email"]').value = d["Contact Email"] || "";
  }

  if (deliveries.length > 1) {
    const container = document.getElementById('extra-deliveries-container');
    deliveries.slice(1).forEach((d, index) => {
      const idx = Date.now() + index;
      const html = `
        <div class="extra-delivery-block mb-3" data-idx="${idx}">
          <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_delivery[${idx}][company]" value="${d["Company"] || ""}"></div>
          <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_delivery[${idx}][address]" value="${d["Address"] || ""}"></div>
          <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_delivery[${idx}][date]" value="${formatDateToInput(d["Date"]) || ""}"></div>
          <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_delivery[${idx}][instructions]">${d["Instructions"] || ""}</textarea></div>
          <div class="form-group"><label>Контактное лицо</label><input type="text" class="form-control" name="extra_delivery[${idx}][contact_person]" value="${d["Contact Person"] || ""}"></div>
          <div class="form-group"><label>Телефон</label><input type="text" class="form-control" name="extra_delivery[${idx}][contact_phone_number]" value="${d["Location Phone Number"] || ""}"></div>
          <div class="form-group"><label>Email</label><input type="email" class="form-control" name="extra_delivery[${idx}][contact_email]" value="${d["Contact Email"] || ""}"></div>
        </div>`;
      container.insertAdjacentHTML("beforeend", html);
    });
  }

  console.log("✅ Все поля автозаполнены!");
}

window.initLoadParser = initLoadParser;
