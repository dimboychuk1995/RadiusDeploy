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

  // Инициализируем форму добавления вендора
  handleVendorFormSubmit();
}

// 📤 Обработка формы добавления вендора
function handleVendorFormSubmit() {
  const form = document.getElementById('addVendorForm');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Собираем данные из формы
    const formData = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      contact_person: form.contact_person.value.trim(),
      address: form.address.value.trim()
    };

    try {
      // Отправляем POST-запрос на сервер
      const res = await fetch('/api/vendors/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const json = await res.json();

      if (json.success) {
        // Закрываем модалку, очищаем форму
        const modal = bootstrap.Modal.getInstance(document.getElementById('addVendorModal'));
        modal.hide();
        form.reset();

        // Показываем уведомление
        Swal.fire({
          icon: 'success',
          title: 'Успешно',
          text: 'Вендор добавлен',
          timer: 1500,
          showConfirmButton: false
        });

        // Обновляем список
        loadVendors();
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

// 📥 Загрузка списка вендоров с сервера
async function loadVendors() {
  const container = document.getElementById('vendorListContainer');
  container.innerHTML = '<p class="text-muted">Загрузка...</p>';

  try {
    const res = await fetch('/api/vendors/list');
    const json = await res.json();

    if (!json.success) {
      container.innerHTML = '<p class="text-danger">Ошибка загрузки</p>';
      return;
    }

    if (json.vendors.length === 0) {
      container.innerHTML = '<p class="text-muted">Вендоры не найдены</p>';
      return;
    }

    // Создаём таблицу с данными
    const list = document.createElement('div');
    list.className = 'list-group';

    json.vendors.forEach(v => {
      const item = document.createElement('div');
      item.className = 'list-group-item';

        item.innerHTML = `
          <div class="d-flex justify-content-between align-items-center w-100">
            <div class="flex-grow-1 pe-3">
              <div class="fw-bold">${v.name}</div>
              <div class="text-muted">
                <i class="fas fa-phone text-danger me-1"></i> ${v.phone || '—'}
                &nbsp;|&nbsp;
                <i class="fas fa-envelope text-muted me-1"></i> ${v.email || '—'}
              </div>
            </div>
            <div class="d-flex align-items-center">
              <button class="btn btn-sm btn-outline-primary me-1 btn-vendor-details" data-id="${v.id}" title="Детали">
                <i class="fas fa-eye"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger btn-vendor-delete" data-id="${v.id}" title="Удалить">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `;
      list.appendChild(item);
    });


    container.innerHTML = '';
    container.appendChild(list);

    // 🗑 Обработка кнопки удаления
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

    // 🔍 Обработка кнопки деталей
    document.querySelectorAll('.btn-vendor-details').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        Swal.fire({
          title: 'Детали',
          text: `Показать детали вендора с ID: ${id}`,
          icon: 'info'
        });
      });
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="text-danger">Ошибка сервера</p>';
  }
}

// ❌ Удаление вендора по ID
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
      loadVendors();
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
