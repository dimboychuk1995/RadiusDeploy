function initDispatchSchedule() {
document.querySelectorAll('.dispatcher-header').forEach(header => {
    header.addEventListener('click', () => {
      const dispatcher = header.dataset.dispatcher;
      document.querySelectorAll(`.driver-row[data-dispatcher="${dispatcher}"]`)
        .forEach(row => row.classList.toggle('d-none'));
    });
  });
}