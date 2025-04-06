console.log("statement_details.js");

function loadStatementFragment() {
  fetch('/statement/fragment')
    .then(res => res.text())
    .then(html => {
      const section = document.getElementById("section-statements");
      section.innerHTML = html;
      initStatementEvents?.();         // Модалка, формы и т.д.
      initStatementFilter?.();         // Фильтры
      initStatementRowClicks?.();      // 🔥 Кликабельные строки!
    });
}

function deleteStatement(statementId) {
  if (!confirm("Вы уверены, что хотите удалить этот стейтмент?")) return;

  fetch(`/statement/delete/${statementId}`, {
    method: 'DELETE'
  })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'deleted') {
        alert("Стейтмент удалён.");
        loadStatementFragment(); // Обновляем список
      } else {
        alert("Ошибка при удалении: " + (data.error || 'неизвестная'));
      }
    })
    .catch(err => {
      console.error(err);
      alert("Ошибка при удалении.");
    });
}