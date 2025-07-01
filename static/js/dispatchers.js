function openDispatcherDetailsModal(dispatcher) {
    console.log('dispatcher:', dispatcher); // <- временно добавь
  document.getElementById('dispatcherId').value = dispatcher._id;
  document.getElementById('dispatcherRealName').value = dispatcher.real_name || '';
  document.getElementById('dispatcherDispatchName').value = dispatcher.dispatch_name || '';
  document.getElementById('dispatcherCompanyDispatch').value = dispatcher.company_dispatch || '';
  document.getElementById('dispatcherEmail').value = dispatcher.email || '';
  document.getElementById('dispatcherPhone').value = dispatcher.phone || '';
  document.getElementById('dispatcherEmailPassword').value = dispatcher.email_password || '';
  document.getElementById('dispatcherSalarySchemeText').textContent = dispatcher.salary_scheme_type || '—';

  document.getElementById('dispatcherDetailsModal').classList.add('show');
  document.getElementById('dispatcherDetailsModal').style.display = 'block';
  document.getElementById('dispatcherDetailsBackdrop').classList.add('show');
  document.getElementById('dispatcherDetailsBackdrop').style.display = 'block';
  window.currentDispatcher = dispatcher;
}


function closeDispatcherDetailsModal() {
  const modal = document.getElementById('dispatcherDetailsModal');
  const backdrop = document.getElementById('dispatcherDetailsBackdrop');

  modal.classList.remove('show');
  backdrop.classList.remove('show');

  // Убираем style.display, чтобы модалка могла быть открыта снова
  modal.style.display = '';
  backdrop.style.display = '';
}


function openSalarySchemeModal() {
  const dispatcherId = document.getElementById('dispatcherId').value;
  const dispatcher = window.currentDispatcher || {};

  // Установим select по значению
  const scheme = dispatcher.salary_scheme_type || '';
  const percent = dispatcher.salary_percent || '';
  const fixed = dispatcher.salary_fixed || '';
  const perDriver = dispatcher.salary_per_driver || '';

  document.getElementById('salarySchemeSelect').value = scheme;
  handleSalarySchemeChange(); // Показать нужные поля

  document.getElementById('salaryPercent').value = percent;
  document.getElementById('salaryFixed').value = fixed;
  document.getElementById('salaryPerDriver').value = perDriver;

  const modal = new bootstrap.Modal(document.getElementById('salarySchemeModal'));
  modal.show();
}

function saveDispatcherDetails() {
  const dispatcherId = document.getElementById('dispatcherId').value;

  fetch(`/api/dispatchers/${dispatcherId}/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      real_name: document.getElementById('dispatcherRealName').value,
      dispatch_name: document.getElementById('dispatcherDispatchName').value,
      company_dispatch: document.getElementById('dispatcherCompanyDispatch').value,
      email: document.getElementById('dispatcherEmail').value,
      email_password: document.getElementById('dispatcherEmailPassword').value,
      phone: document.getElementById('dispatcherPhone').value
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      Swal.fire('Успешно', 'Данные диспетчера сохранены', 'success');
    } else {
      Swal.fire('Ошибка', data.error || 'Не удалось сохранить', 'error');
    }
  })
  .catch(err => {
    console.error(err);
    Swal.fire('Ошибка', 'Произошла ошибка при сохранении', 'error');
  });
}

function handleSalarySchemeChange() {
  const scheme = document.getElementById('salarySchemeSelect').value;

  // Скрыть все
  document.getElementById('percentBlock').style.display = 'none';
  document.getElementById('fixedBlock').style.display = 'none';
  document.getElementById('perDriverBlock').style.display = 'none';

  if (scheme === 'percent') {
    document.getElementById('percentBlock').style.display = 'block';
  } else if (scheme === 'fixed_plus_percent') {
    document.getElementById('fixedBlock').style.display = 'block';
    document.getElementById('percentBlock').style.display = 'block';
  } else if (scheme === 'per_driver_plus_percent') {
    document.getElementById('perDriverBlock').style.display = 'block';
    document.getElementById('percentBlock').style.display = 'block';
  }
}

function saveSalaryScheme() {
  const dispatcherId = document.getElementById('dispatcherId')?.value;
  console.log("dispatcherId", dispatcherId);

  if (!dispatcherId) {
    return Swal.fire("Ошибка", "Dispatcher ID не найден", "error");
  }

  const schemeType = document.getElementById('salarySchemeSelect')?.value;
  const salaryPercent = parseFloat(document.getElementById('salaryPercent')?.value || 0);
  const salaryFixed = parseFloat(document.getElementById('salaryFixed')?.value || 0);
  const salaryPerDriver = parseFloat(document.getElementById('salaryPerDriver')?.value || 0);

  fetch(`/api/dispatchers/${dispatcherId}/salary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      salary_scheme_type: schemeType,
      salary_percent: salaryPercent,
      salary_fixed: salaryFixed,
      salary_per_driver: salaryPerDriver
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      document.getElementById('dispatcherSalarySchemeText').textContent = schemeType;
      Swal.fire('Успешно', 'Схема зарплаты сохранена', 'success');
      bootstrap.Modal.getInstance(document.getElementById('salarySchemeModal'))?.hide();
    } else {
      Swal.fire('Ошибка', data.error || 'Не удалось сохранить', 'error');
    }
  })
  .catch(err => {
    console.error(err);
    Swal.fire('Ошибка', 'Произошла ошибка при сохранении', 'error');
  });
}
