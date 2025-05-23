function openCompanyModal(isEdit = false) {
  const modal = document.getElementById('addCompanyModal');
  const backdrop = document.getElementById('companyBackdrop');
  const form = document.getElementById('addCompanyForm');

  if (modal && backdrop && form) {
    modal.classList.add('show');
    backdrop.classList.add('show');

    if (!isEdit) {
      form.reset();
      form.dataset.editId = "";
      modal.querySelector(".custom-offcanvas-header h4").textContent = "Добавить компанию";
    }
  }
}

function closeCompanyModal() {
  document.getElementById('addCompanyModal')?.classList.remove('show');
  document.getElementById('companyBackdrop')?.classList.remove('show');
}

async function editCompany(companyId) {
  try {
    const res = await fetch(`/api/get_company/${companyId}`);
    const data = await res.json();
    console.log("Полученные данные компании:", data); // 👈 добавь это

    const form = document.getElementById("addCompanyForm");
    if (!form) return;

    form.querySelector('[name="name"]').value = data.name || "";
    form.querySelector('[name="address"]').value = data.address || "";
    form.querySelector('[name="mc"]').value = data.mc || "";
    form.querySelector('[name="dot"]').value = data.dot || "";
    form.querySelector('[name="phone"]').value = data.phone || "";
    form.querySelector('[name="email"]').value = data.email || "";
    form.querySelector('[name="password"]').value = data.password || "";

    form.dataset.editId = companyId;
    document.getElementById("addCompanyModal").querySelector(".custom-offcanvas-header h4").textContent = "Редактировать компанию";
    openCompanyModal(true); // ← указываем, что это режим редактирования
  } catch (err) {
    console.error("Ошибка при получении компании:", err);
    alert("Не удалось загрузить компанию");
  }
}

function initCompanyForm() {
  const form = document.getElementById("addCompanyForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const payload = {};
    for (let [key, value] of formData.entries()) {
      payload[key] = value;
    }

    const editId = form.dataset.editId;
    const url = editId ? `/api/edit_company/${editId}` : "/api/add_company";

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        closeCompanyModal();
        location.reload();
      } else {
        alert("Ошибка при сохранении компании");
      }
    } catch (err) {
      console.error("Ошибка запроса:", err);
      alert("Ошибка сети или сервера");
    }
  });
}

document.addEventListener("DOMContentLoaded", initCompanyForm);
