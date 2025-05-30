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
}

function openInspectionModal() {
  const modal = document.getElementById("addInspectionModal");
  const backdrop = document.querySelector(".custom-offcanvas-backdrop");
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
        alert("Инспекция сохранена!");
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
