document.addEventListener("DOMContentLoaded", function () {
  // Здесь можно будет инициализировать функции, если появится интерактивность
  // Например: фильтрация, назначение диспетчера, динамическое обновление списка и т.д.

  // Пример: выделение водителей без диспетчера
  highlightDriversWithoutDispatcher();
});

function highlightDriversWithoutDispatcher() {
  const rows = document.querySelectorAll(".driver-row");

  rows.forEach(row => {
    const dispatcherCell = row.querySelector(".dispatcher-name");
    if (dispatcherCell && dispatcherCell.textContent.trim() === "Нет диспетчера") {
      row.style.backgroundColor = "#ffe5e5"; // Подсветить красным или как захочешь
    }
  });
}