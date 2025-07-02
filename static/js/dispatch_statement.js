function initStatementDispatcherEvents() {
  // сюда только вызовы других функций, если появятся
}

function openDispatcherPayrollModal() {
    document.getElementById("dispatcherPayrollModal").classList.add("show");
    document.getElementById("dispatcherPayrollBackdrop").classList.add("show");

    generateWeekRanges("weekRangeSelect");
}

function closeDispatcherPayrollModal() {
    document.getElementById("dispatcherPayrollModal").classList.remove("show");
    document.getElementById("dispatcherPayrollBackdrop").classList.remove("show");
}

// Очень важный метод генерации недель
function generateWeekRanges(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = "";

  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const baseMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);

  for (let i = 0; i < 10; i++) {
    const monday = new Date(baseMonday);
    monday.setDate(monday.getDate() + i * 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const mmdd = d => String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + "/" + d.getFullYear();
    const label = `${mmdd(monday)} - ${mmdd(sunday)}`;

    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    select.appendChild(option);
  }
}
