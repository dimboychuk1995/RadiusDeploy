function initSafety() {
  document.querySelectorAll('.safety-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.safety-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.safety-section').forEach(sec => sec.style.display = 'none');

      btn.classList.add('active');
      const target = document.querySelector(btn.dataset.target);
      if (target) target.style.display = 'block';
    });
  });

  loadDriversAndTrucks();
  bindInspectionForm();
  loadInspections();
}

function openInspectionModal() {
  const modal = document.getElementById("addInspectionModal");
  const backdrop = document.querySelector(".custom-offcanvas-backdrop");

  // Загружаем водителей и траки каждый раз при открытии
  loadDriversAndTrucks();

  modal?.classList.add("show");
  backdrop?.classList.add("show");
}



function closeInspectionModal() {
  const modal = document.getElementById("addInspectionModal");
  const backdrop = document.querySelector(".custom-offcanvas-backdrop");
  modal?.classList.remove("show");
  backdrop?.classList.remove("show");
}

function addViolation() {
  const container = document.getElementById("violations-container");
  const index = container.children.length;
  const html = `
    <div class="violation-item border p-3 mb-2 bg-light rounded">
      <h6>Нарушение #${index + 1}</h6>
      <div class="form-group mb-2"><label>Violation Code</label><input type="text" class="form-control violation-code"></div>
      <div class="form-group mb-2"><label>Section</label><input type="text" class="form-control violation-section"></div>
      <div class="form-group mb-2"><label>Unit (TR, TRL, D)</label><input type="text" class="form-control violation-unit"></div>
      <div class="form-group mb-2"><label>OOS (Yes or No)</label><input type="text" class="form-control violation-oos"></div>
      <div class="form-group mb-2"><label>Citation #</label><input type="text" class="form-control violation-citation"></div>
      <div class="form-group mb-2"><label>Violation Description</label><textarea class="form-control violation-description"></textarea></div>
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">Удалить</button>
    </div>`;
  container.insertAdjacentHTML("beforeend", html);
}

async function loadDriversAndTrucks() {
  const driverSelect = document.querySelector('select[name="driver"]');
  const truckSelect = document.querySelector('select[name="truck"]');

  driverSelect.innerHTML = '<option value="">Выберите водителя</option>';
  truckSelect.innerHTML = '<option value="">Выберите трак</option>';

  try {
    const [driversRes, trucksRes] = await Promise.all([
      fetch('/api/drivers_dropdown'),
      fetch('/api/trucks_dropdown')
    ]);

    const drivers = await driversRes.json();
    const trucks = await trucksRes.json();

    drivers.forEach(d => {
      const option = document.createElement("option");
      option.value = d._id;
      option.textContent = d.name;
      driverSelect.appendChild(option);
    });

    trucks.forEach(t => {
      const option = document.createElement("option");
      option.value = t._id;
      option.textContent = t.number;
      truckSelect.appendChild(option);
    });

    // Автозаполнение трака при выборе водителя
    driverSelect.addEventListener("change", async () => {
      const selectedDriverId = driverSelect.value;
      if (!selectedDriverId) return;

      try {
        const res = await fetch(`/api/driver_truck/${selectedDriverId}`);
        const data = await res.json();

        if (data.truck_id) {
          truckSelect.value = data.truck_id;
        }
      } catch (e) {
        console.error("Ошибка при автозаполнении трака:", e);
      }
    });

  } catch (e) {
    console.error("Ошибка загрузки водителей или траков:", e);
  }
}

function bindInspectionForm() {
  const form = document.getElementById("addInspectionForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);

    const violations = [];
    document.querySelectorAll(".violation-item").forEach((block) => {
      violations.push({
        code: block.querySelector(".violation-code")?.value || "",
        section: block.querySelector(".violation-section")?.value || "",
        unit: block.querySelector(".violation-unit")?.value || "",
        oos: block.querySelector(".violation-oos")?.value || "",
        citation: block.querySelector(".violation-citation")?.value || "",
        description: block.querySelector(".violation-description")?.value || ""
      });
    });

    formData.append("violations_json", JSON.stringify(violations));

    try {
      const res = await fetch("/api/add_inspection", {
        method: "POST",
        body: formData
      });

      const result = await res.json();
      if (result.success) {
          Swal.fire({
              title: 'Успех!',
              text: 'Инспекция успешно сохранена',
              icon: 'success',
              confirmButtonText: 'OK',
              timer: 2000,
              timerProgressBar: true
          }).then(() => {
              loadInspections(); // 🆕 обновим список
          });

          form.reset();
          document.getElementById("violations-container").innerHTML = "";
          closeInspectionModal();
      } else {
        alert("Ошибка: " + result.error);
      }
    } catch (err) {
      console.error("Ошибка при отправке формы:", err);
      alert("Произошла ошибка при сохранении");
    }
  });
}

async function loadInspections() {
  const tbody = document.querySelector("#inspectionsTable tbody");
  tbody.innerHTML = "";

  try {
    const res = await fetch("/api/inspections_list");
    const inspections = await res.json();

    inspections.forEach(ins => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${ins.date || ""}</td>
        <td>${ins.driver || ""}</td>
        <td>${ins.truck || ""}</td>
        <td>${ins.state || ""}</td>
        <td>${ins.address || ""}</td>
        <td>${ins.clean ? "✅" : "❌"}</td>
        <td>
          ${ins.file_id ? `<a href="/api/get_inspection_file/${ins.file_id}" download class="me-2">📄</a>` : ""}
          <button class="btn btn-sm btn-info" onclick="showInspectionDetails('${ins._id}')">👁️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteInspection('${ins._id}')">🗑</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Ошибка загрузки инспекций:", e);
  }
}


async function deleteInspection(id) {
  if (!confirm("Удалить эту инспекцию?")) return;

  try {
    const res = await fetch(`/api/delete_inspection/${id}`, {
      method: "DELETE"
    });

    const result = await res.json();
    if (result.success) {
      alert("Инспекция удалена");
      loadInspections();
    } else {
      alert("Ошибка: " + result.error);
    }
  } catch (e) {
    console.error("Ошибка при удалении:", e);
    alert("Произошла ошибка при удалении");
  }
}