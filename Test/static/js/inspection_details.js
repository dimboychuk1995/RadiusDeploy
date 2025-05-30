function returnToInspections() {
  const container = document.querySelector('#mainContent') || document.querySelector('.content');
  if (!container) {
    console.error("Контейнер не найден");
    return;
  }

  // Загружаем обратно фрагмент safety (без смены URL)
  fetch('/fragment/safety')
    .then(res => res.text())
    .then(html => {
      container.innerHTML = html;
      if (typeof initSafety === "function") {
        initSafety();
      }
    })
    .catch(err => {
      console.error("Ошибка при возврате в раздел безопасности:", err);
    });
}
