// 🔄 Инициализация вкладок (Equipment List / Vendors / Purchase Orders)
function initEquipment() {
  const navLinks = document.querySelectorAll('#equipment-subnav .nav-link');
  const sections = document.querySelectorAll('.equipment-subsection');

  // Переключение видимости секций по вкладке
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const target = link.dataset.target;
      sections.forEach(sec => {
        sec.style.display = sec.id === target ? 'block' : 'none';
      });
    });
  });

  handleVendorFormSubmit();
  handleProductFormSubmit();
  initAddProductModal();
  initVendorDeleteButtons();
  initVendorDetailsButtons();
  initProductDeleteButtons();
  initProductDetailsButtons();
}

// 📤 Обработка формы добавления вендора
function handleVendorFormSubmit() {
  const form = document.getElementById('addVendorForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      contact_person: form.contact_person.value.trim(),
      address: form.address.value.trim()
    };

    try {
      const res = await fetch('/api/vendors/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const json = await res.json();

      if (json.success) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('addVendorModal'));
        modal.hide();
        form.reset();

        Swal.fire({
          icon: 'success',
          title: 'Успешно',
          text: 'Вендор добавлен',
          timer: 1500,
          showConfirmButton: false
        });

        location.reload();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Ошибка',
          text: json.error || 'Неизвестная ошибка'
        });
      }
    } catch (err) {
      console.error('Ошибка при отправке:', err);
      Swal.fire({
        icon: 'error',
        title: 'Ошибка',
        text: 'Сервер не отвечает'
      });
    }
  });
}

// ❌ Удаление вендора по ID
function initVendorDeleteButtons() {
  document.querySelectorAll('.btn-vendor-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      Swal.fire({
        title: 'Удалить вендора?',
        text: 'Это действие необратимо.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Удалить',
        cancelButtonText: 'Отмена'
      }).then((result) => {
        if (result.isConfirmed) {
          deleteVendor(id);
        }
      });
    });
  });
}

async function deleteVendor(id) {
  try {
    const res = await fetch(`/api/vendors/${id}`, { method: 'DELETE' });
    const json = await res.json();

    if (json.success) {
      Swal.fire({
        icon: 'success',
        title: 'Удалено',
        text: 'Вендор удалён',
        timer: 1500,
        showConfirmButton: false
      });
      location.reload();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Ошибка',
        text: json.error || 'Неизвестная ошибка'
      });
    }
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: 'Сервер не отвечает'
    });
  }
}

function initVendorDetailsButtons() {
  document.querySelectorAll('.btn-vendor-details').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      fetch(`/fragment/vendor/${id}`)
        .then(res => res.text())
        .then(html => {
          const detailsBlock = document.getElementById('vendor-details');
          detailsBlock.innerHTML = html;
          detailsBlock.style.display = 'block';
          document.getElementById('vendors').style.display = 'none';
        });
    });
  });
}

function returnToVendorList() {
  document.getElementById('vendor-details').style.display = 'none';
  document.getElementById('vendors').style.display = 'block';
}

//добавление продукта модалка
function initAddProductModal() {
  const modal = document.getElementById('addProductModal');
  if (!modal) return;

  modal.addEventListener('shown.bs.modal', () => {
    const $cat = $('#productCategory');
    const $vendor = $('#productVendor');

    if ($cat.hasClass('select2-hidden-accessible')) $cat.select2('destroy');
    if ($vendor.hasClass('select2-hidden-accessible')) $vendor.select2('destroy');

    $cat.select2({
      theme: 'bootstrap-5',
      width: '100%',
      placeholder: 'Выберите категорию',
      allowClear: true,
      minimumResultsForSearch: Infinity
    });

    $vendor.select2({
      theme: 'bootstrap-5',
      width: '100%',
      placeholder: 'Выберите вендора',
      allowClear: true,
      minimumResultsForSearch: Infinity
    });
  });
}

function handleProductFormSubmit() {
  const form = document.getElementById('addProductForm');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    try {
      const res = await fetch('/api/equipment/create', {
        method: 'POST',
        body: formData
      });

      const json = await res.json();

      if (json.success) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('addProductModal'));
        modal.hide();
        form.reset();

        Swal.fire({
          icon: 'success',
          title: 'Успешно',
          text: 'Продукт добавлен',
          timer: 1500,
          showConfirmButton: false
        });

        location.reload();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Ошибка',
          text: json.error || 'Неизвестная ошибка'
        });
      }
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Ошибка',
        text: 'Сервер не отвечает'
      });
    }
  });
}

function initProductDeleteButtons() {
  document.querySelectorAll('.btn-product-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      Swal.fire({
        title: 'Удалить продукт?',
        text: 'Это действие необратимо и удалит фото, если оно есть.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Удалить',
        cancelButtonText: 'Отмена'
      }).then(result => {
        if (result.isConfirmed) {
          deleteProduct(id);
        }
      });
    });
  });
}

async function deleteProduct(id) {
  try {
    const res = await fetch(`/api/equipment/${id}`, {
      method: 'DELETE'
    });

    const json = await res.json();

    if (json.success) {
      Swal.fire({
        icon: 'success',
        title: 'Удалено',
        text: 'Продукт удалён',
        timer: 1500,
        showConfirmButton: false
      });
      location.reload();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Ошибка',
        text: json.error || 'Не удалось удалить продукт'
      });
    }
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: 'Сервер не отвечает'
    });
  }
}


function initProductDetailsButtons() {
  document.querySelectorAll('.btn-product-details').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      fetch(`/fragment/equipment/${id}`)
        .then(res => res.text())
        .then(html => {
          const detailsBlock = document.getElementById('product-details');
          detailsBlock.innerHTML = html;
          detailsBlock.style.display = 'block';
          document.getElementById('equipment-list').style.display = 'none';
        });
    });
  });
}

function returnToProductList() {
  document.getElementById('product-details').style.display = 'none';
  document.getElementById('equipment-list').style.display = 'block';
}
