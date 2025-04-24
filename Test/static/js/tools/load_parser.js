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

function autofillLoadForm(data) {
  if (!data) return;

  document.querySelector('[name="load_id"]').value = data["Load Number"] || "";
  document.querySelector('[name="broker_load_id"]').value = data["Broker Name"] || "";

  const pickup = data["Pickup Locations"]?.[0];
  if (pickup) {
    document.querySelector('[name="pickup_address"]').value = pickup["Address"] || "";
    document.querySelector('[name="pickup_date"]').value = pickup["Date"] || "";
    document.querySelector('[name="pickup_instructions"]').value = pickup["Instructions"] || "";
  }

  const delivery = data["Delivery Locations"]?.[0];
  if (delivery) {
    document.querySelector('[name="delivery_address"]').value = delivery["Address"] || "";
    document.querySelector('[name="delivery_date"]').value = delivery["Date"] || "";
    document.querySelector('[name="delivery_instructions"]').value = delivery["Instructions"] || "";
  }
}

// 👇 Делаем функцию доступной глобально
window.initLoadParser = initLoadParser;
