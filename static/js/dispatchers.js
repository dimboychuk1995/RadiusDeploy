function openDispatcherDetailsModal(dispatcher) {
  document.getElementById('dispatcherRealName').textContent = dispatcher.real_name || '—';
  document.getElementById('dispatcherDispatchName').textContent = dispatcher.dispatch_name || '—';
  document.getElementById('dispatcherCompanyDispatch').textContent = dispatcher.company_dispatch || '—';
  document.getElementById('dispatcherEmail').textContent = dispatcher.email || '—';
  document.getElementById('dispatcherEmailPassword').textContent = dispatcher.email_password || '—';
  document.getElementById('dispatcherSalaryScheme').textContent = dispatcher.salary_scheme || '—';

  const modal = document.getElementById('dispatcherDetailsModal');
  const backdrop = document.getElementById('dispatcherDetailsBackdrop');

  modal.classList.add('show');
  backdrop.classList.add('show');
  modal.style.display = '';
  backdrop.style.display = '';
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