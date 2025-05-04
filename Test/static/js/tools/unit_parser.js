// unit_parser.js

function initTruckParser() {
  console.log('✅ initTruckParser called');

  const truckPdfInput = document.getElementById("truckPdfInput");

  if (truckPdfInput) {
    truckPdfInput.addEventListener("change", () => {
      const file = truckPdfInput.files[0];
      if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;

      const formData = new FormData();
      formData.append("file", file);

      console.log("📤 Отправляем PDF в /api/parse_truck_pdf", file.name);

      fetch("/api/parse_truck_pdf", {
        method: "POST",
        body: formData
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            alert("Ошибка: " + data.error);
            return;
          }
          autofillTruckForm(data);
        })
        .catch(err => {
          console.error("❌ Ошибка при анализе PDF:", err);
          alert("Ошибка при анализе файла.");
        });
    });
  } else {
    console.warn("⚠️ truckPdfInput не найден");
  }
}

function autofillTruckForm(data) {
  const form = document.getElementById("truckForm");
  if (!form) {
    console.warn("⚠️ truckForm не найден");
    return;
  }

  form.unit_number.value = data["Unit Number"] || "";
  form.make.value = data["Make"] || "";
  form.model.value = data["Model"] || "";
  form.year.value = data["Year"] || "";
  form.mileage.value = data["Mileage"] || "";
  form.vin.value = data["VIN"] || "";

  form.registration_plate.value = data["License Plate"] || "";
  form.registration_exp.value = parseDate(data["Registration Expiration"]);
  form.inspection_exp.value = parseDate(data["Inspection Expiration"]);

  form.insurance_provider.value = data["Insurance Provider"] || "";
  form.insurance_policy.value = data["Insurance Policy Number"] || "";
  form.insurance_exp.value = parseDate(data["Insurance Expiration"]);
}

function parseDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toISOString().split("T")[0]; // формат YYYY-MM-DD
}
