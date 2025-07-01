function openDispatcherDetailsModal(dispatcher) {
    console.log('dispatcher:', dispatcher); // <- временно добавь
  document.getElementById('dispatcherId').value = dispatcher._id;
  document.getElementById('dispatcherRealName').value = dispatcher.real_name || '';
  document.getElementById('dispatcherDispatchName').value = dispatcher.dispatch_name || '';
  document.getElementById('dispatcherCompanyDispatch').value = dispatcher.company_dispatch || '';
  document.getElementById('dispatcherEmail').value = dispatcher.email || '';
  document.getElementById('dispatcherPhone').value = dispatcher.phone || '';
  document.getElementById('dispatcherEmailPassword').value = dispatcher.email_password || '';
  document.getElementById('dispatcherSalarySchemeText').textContent = dispatcher.salary_scheme || '—';

  document.getElementById('dispatcherDetailsModal').classList.add('show');
  document.getElementById('dispatcherDetailsModal').style.display = 'block';
  document.getElementById('dispatcherDetailsBackdrop').classList.add('show');
  document.getElementById('dispatcherDetailsBackdrop').style.display = 'block';
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