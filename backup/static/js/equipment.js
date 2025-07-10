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
  initPurchaseOrderModal();
  handlePurchaseOrderFormSubmit();
  initPurchaseOrderDeleteButtons();
  initPurchaseOrderDetailsButtons();
  initDriverOrderModal();
  handleDriverOrderFormSubmit();
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
      website: form.website.value.trim(),
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

function initPurchaseOrderModal() {
  const container = document.getElementById('po-products-container');
  const addBtn = document.getElementById('add-po-product');
  const template = document.getElementById('po-product-template');

  if (!container || !addBtn || !template) return;

  const rowTemplate = template.firstElementChild;

  addBtn.addEventListener('click', () => {
    const clone = rowTemplate.cloneNode(true);
    container.appendChild(clone);

    const select = clone.querySelector('.po-product-select');
    const priceInput = clone.querySelector('.po-product-price');
    const qtyInput = clone.querySelector('.po-product-qty');
    const totalField = clone.querySelector('.po-product-total');

    // ✅ Снимаем disabled и проставляем required
    select.disabled = false;
    select.required = true;
    priceInput.disabled = false;
    qtyInput.disabled = false;

    // Автозаполнение цены при выборе продукта
    select.addEventListener('change', () => {
      const selected = select.selectedOptions[0];
      const price = selected.dataset.price || '';
      priceInput.value = price;
      priceInput.dispatchEvent(new Event('input')); // триггер пересчёта
    });

    // Удаление строки
    clone.querySelector('.remove-po-product').addEventListener('click', () => {
      clone.remove();
      updateTotalWithTax(); // пересчёт total после удаления
    });
  });
}

function handlePurchaseOrderFormSubmit() {
  const form = document.getElementById('purchaseOrderForm');

  // При изменении цены или количества — пересчёт суммы
  form.addEventListener('input', () => {
    document.querySelectorAll('.po-product-row').forEach(row => {
      const priceInput = row.querySelector('.po-product-price');
      const qtyInput = row.querySelector('.po-product-qty');
      const totalField = row.querySelector('.po-product-total');

      const price = parseFloat(priceInput.value) || 0;
      const qty = parseFloat(qtyInput.value) || 0;
      const subtotal = price * qty;

      totalField.textContent = `$${subtotal.toFixed(2)}`;
    });

    updateTotalWithTax();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Удаляем пустые строки
    document.querySelectorAll('.po-product-row').forEach(row => {
      const select = row.querySelector('.po-product-select');
      if (!select.value) row.remove();
    });

    const remaining = document.querySelectorAll('.po-product-row');
    if (remaining.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Нет выбранных продуктов',
        text: 'Добавьте хотя бы один продукт с ценой перед сохранением.'
      });
      return;
    }

    const formData = new FormData(form);

    try {
      const res = await fetch('/api/purchase_orders/create', {
        method: 'POST',
        body: formData
      });

      const json = await res.json();

      if (json.success) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('createPurchaseOrderModal'));
        modal.hide();
        form.reset();
        document.getElementById('po-products-container').innerHTML = '';
        updateTotalWithTax();

        Swal.fire({
          icon: 'success',
          title: 'Created',
          text: 'Purchase Order сохранён',
          timer: 1500,
          showConfirmButton: false
        });

        location.reload();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Ошибка',
          text: json.error || 'Не удалось создать заказ'
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

function updateTotalWithTax() {
  let total = 0;

  document.querySelectorAll('.po-product-row').forEach(row => {
    const price = parseFloat(row.querySelector('.po-product-price').value) || 0;
    const qty = parseFloat(row.querySelector('.po-product-qty').value) || 0;
    total += price * qty;
  });

  const taxInput = document.getElementById('po-tax');
  const tax = parseFloat(taxInput.value) || 0;
  const finalTotal = total + tax;

  document.getElementById('po-total').textContent = `$${finalTotal.toFixed(2)}`;
}


function initPurchaseOrderDeleteButtons() {
  document.querySelectorAll('.btn-po-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;

      Swal.fire({
        title: 'Удалить заказ?',
        text: 'Это действие необратимо.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Удалить',
        cancelButtonText: 'Отмена'
      }).then(result => {
        if (result.isConfirmed) {
          deletePurchaseOrder(id);
        }
      });
    });
  });
}

async function deletePurchaseOrder(id) {
  try {
    const res = await fetch(`/api/purchase_orders/${id}`, { method: 'DELETE' });
    const json = await res.json();

    if (json.success) {
      Swal.fire({
        icon: 'success',
        title: 'Удалено',
        text: 'Purchase Order удалён',
        timer: 1500,
        showConfirmButton: false
      });
      location.reload();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Ошибка',
        text: json.error || 'Не удалось удалить заказ'
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


function initPurchaseOrderDetailsButtons() {
  document.querySelectorAll('.btn-po-details').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;

      fetch(`/fragment/purchase_order/${id}`)
        .then(res => res.text())
        .then(html => {
          const detailsBlock = document.getElementById('po-details');
          detailsBlock.innerHTML = html;
          detailsBlock.style.display = 'block';
          document.getElementById('purchase-orders').style.display = 'none';
        });
    });
  });
}

function returnToPurchaseOrderList() {
  document.getElementById('po-details').style.display = 'none';
  document.getElementById('purchase-orders').style.display = 'block';
}


function initDriverOrderModal() {
  const modal = document.getElementById('driverOrderModal');
  if (!modal) return;

  const container = document.getElementById('driver-order-products-container');
  const addBtn = document.getElementById('add-driver-order-product');
  const template = document.getElementById('driver-order-product-template');

  modal.addEventListener('shown.bs.modal', () => {
    const form = document.getElementById('driverOrderForm');
    if (form) form.reset();
    container.innerHTML = ''; // очищаем предыдущие строки

    // Select2 для водителя
    const $driver = $('#driverOrderDriver');
    if ($driver.hasClass('select2-hidden-accessible')) $driver.select2('destroy');
    $driver.select2({
      theme: 'bootstrap-5',
      width: '100%',
      placeholder: 'Select driver',
      allowClear: true
    });

    // Добавляем первую строку по умолчанию
    addDriverOrderProductRow();
  });

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addDriverOrderProductRow();
    });
  }

  function addDriverOrderProductRow() {
    const clone = template.firstElementChild.cloneNode(true);
    container.appendChild(clone);

    const select = clone.querySelector('.driver-order-product-select');
    const qtyInput = clone.querySelector('.driver-order-product-qty');
    const removeBtn = clone.querySelector('.remove-driver-order-product');

    // Убираем disabled и добавляем required
    select.disabled = false;
    qtyInput.disabled = false;
    select.required = true;
    qtyInput.required = true;

    // Инициализация Select2
    const $select = $(select);
    if ($select.hasClass('select2-hidden-accessible')) $select.select2('destroy');
    $select.select2({
      theme: 'bootstrap-5',
      width: '100%',
      placeholder: 'Select product',
      allowClear: true
    });

    // Удаление строки
    removeBtn.addEventListener('click', () => {
      clone.remove();
    });
  }
}

function handleDriverOrderFormSubmit() {
  const form = document.getElementById('driverOrderForm');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const driverId = form.driver_id.value;
    const date = form.date.value;
    const reason = form.reason.value.trim();

    // Собираем все продукты
    const productRows = form.querySelectorAll('.driver-order-product-row');
    const productIds = [];
    const quantities = [];

    productRows.forEach(row => {
      const pid = row.querySelector('.driver-order-product-select').value;
      const qty = row.querySelector('.driver-order-product-qty').value;

      if (pid && qty) {
        productIds.push(pid);
        quantities.push(qty);
      }
    });

    if (!driverId || !date || !reason || productIds.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Ошибка',
        text: 'Все поля обязательны и должен быть хотя бы один продукт'
      });
      return;
    }

    // Собираем окончательные данные
    const payload = new URLSearchParams();
    payload.append("driver_id", driverId);
    payload.append("date", date);
    payload.append("reason", reason);
    productIds.forEach(id => payload.append("product_ids[]", id));
    quantities.forEach(qty => payload.append("quantities[]", qty));

    try {
      const res = await fetch('/api/driver_orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: payload.toString()
      });

      const json = await res.json();

      if (json.success) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('driverOrderModal'));
        modal.hide();
        form.reset();
        document.getElementById('driver-order-products-container').innerHTML = '';

        Swal.fire({
          icon: 'success',
          title: 'Успешно',
          text: 'Заказ сохранён',
          timer: 1500,
          showConfirmButton: false
        });

        location.reload();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Ошибка',
          text: json.error || 'Не удалось создать заказ'
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
