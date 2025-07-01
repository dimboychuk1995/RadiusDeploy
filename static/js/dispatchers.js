function openDispatcherDetailsModal(dispatcher) {
  document.getElementById('dispatcherName').textContent = dispatcher.username || '';
  document.getElementById('dispatcherEmail').textContent = dispatcher.email || '—';
  document.getElementById('dispatcherPhone').textContent = dispatcher.phone || '—';
  document.getElementById('dispatcherCompany').textContent = dispatcher.company || '—';

  const modal = document.getElementById('dispatcherDetailsModal');
  const backdrop = document.getElementById('dispatcherDetailsBackdrop');

  modal.classList.add('show');
  backdrop.classList.add('show');

  // Убираем display: none, если остался от предыдущего закрытия
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
