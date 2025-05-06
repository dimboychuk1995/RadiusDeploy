// driver_parser.js

function initDriverParser() {
  console.log('✅ initDriverParser initialized');

  const driverPdfInput = document.getElementById("driverPdfInput");

  if (driverPdfInput) {
    driverPdfInput.addEventListener("change", () => {
      const file = driverPdfInput.files[0];
      if (!file || !/\.(pdf|jpg|jpeg|png|webp|tiff|tif|bmp|heic)$/i.test(file.name)) {
        alert("Only PDF or image files are supported.");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      console.log("📤 Отправляем файл в /api/parse_driver_pdf", file.name);

      fetch("/api/parse_driver_pdf", {
        method: "POST",
        body: formData
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            alert("Ошибка: " + data.error);
            return;
          }

          autofillDriverForm(data);

          // 📎 Добавляем файл в поле license_file
          const licenseFileInput = document.querySelector('input[name="license_file"]');
          if (licenseFileInput) {
            const dt = new DataTransfer();
            dt.items.add(file);
            licenseFileInput.files = dt.files;
            console.log("📎 Лицензия-файл вставлен в форму");
          }
        })
        .catch(err => {
          console.error("❌ Ошибка при анализе файла:", err);
          alert("Ошибка при анализе файла.");
        });
    });
  } else {
    console.warn("⚠️ driverPdfInput не найден");
  }
}

function autofillDriverForm(data) {
  const form = document.getElementById("driverForm");
  if (!form) {
    console.warn("⚠️ driverForm не найден");
    return;
  }

  form.name.value = data["Name"] || "";
  form.contact_number.value = data["Phone"] || "";
  form.address.value = data["Address"] || "";
  form.email.value = data["Email"] || "";
  form.dob.value = parseDate(data["DOB"]);

  form.license_number.value = data["License Number"] || "";
  form.license_class.value = data["License Class"] || "";
  form.license_state.value = data["License State"] || "";
  form.license_address.value = data["License Address"] || "";
  form.license_issued_date.value = parseDate(data["License Issued"]);
  form.license_expiration_date.value = parseDate(data["License Expiration"]);
  form.license_restrictions.value = data["License Restrictions"] || "";
}

function parseDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toISOString().split("T")[0]; // формат YYYY-MM-DD
}
