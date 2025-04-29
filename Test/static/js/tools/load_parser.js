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

  if (data["Weight"]) {
    document.querySelector('[name="weight"]').value = data["Weight"];
  }

  const pickups = data["Pickup Locations"] || [];
  if (pickups.length > 0) {
    const firstPickup = pickups[0];
    document.querySelector('[name="pickup_address"]').value = firstPickup["Address"] || "";
    document.querySelector('[name="pickup_date"]').value = formatDateToInput(firstPickup["Date"]) || "";
    document.querySelector('[name="pickup_instructions"]').value = firstPickup["Instructions"] || "";
  }

  const deliveries = data["Delivery Locations"] || [];
  if (deliveries.length > 0) {
    const firstDelivery = deliveries[0];
    document.querySelector('[name="delivery_address"]').value = firstDelivery["Address"] || "";
    document.querySelector('[name="delivery_date"]').value = formatDateToInput(firstDelivery["Date"]) || "";
    document.querySelector('[name="delivery_instructions"]').value = firstDelivery["Instructions"] || "";
  }

  if (pickups.length > 1) {
    const container = document.getElementById('extra-pickups-container');
    pickups.slice(1).forEach((pickup, index) => {
      const idx = Date.now() + index;
      const html = `
        <div class="extra-pickup-block mb-3" data-idx="${idx}">
          <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_pickup[${idx}][company]" value=""></div>
          <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_pickup[${idx}][address]" value="${pickup["Address"] || ""}"></div>
          <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_pickup[${idx}][date]" value="${formatDateToInput(pickup["Date"]) || ""}"></div>
          <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_pickup[${idx}][instructions]">${pickup["Instructions"] || ""}</textarea></div>
        </div>
      `;
      container.insertAdjacentHTML("beforeend", html);
    });
  }

  if (deliveries.length > 1) {
    const container = document.getElementById('extra-deliveries-container');
    deliveries.slice(1).forEach((delivery, index) => {
      const idx = Date.now() + index;
      const html = `
        <div class="extra-delivery-block mb-3" data-idx="${idx}">
          <div class="form-group"><label>Компания</label><input type="text" class="form-control" name="extra_delivery[${idx}][company]" value=""></div>
          <div class="form-group"><label>Адрес</label><input type="text" class="form-control" name="extra_delivery[${idx}][address]" value="${delivery["Address"] || ""}"></div>
          <div class="form-group"><label>Дата</label><input type="date" class="form-control" name="extra_delivery[${idx}][date]" value="${formatDateToInput(delivery["Date"]) || ""}"></div>
          <div class="form-group"><label>Инструкции</label><textarea class="form-control" name="extra_delivery[${idx}][instructions]">${delivery["Instructions"] || ""}</textarea></div>
        </div>
      `;
      container.insertAdjacentHTML("beforeend", html);
    });
  }

  console.log("✅ Форма полностью автозаполнена по данным GPT!");
}

window.initLoadParser = initLoadParser;
