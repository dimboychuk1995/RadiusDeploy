function initDispatchSchedule() {
  const headers = document.querySelectorAll(".dispatcher-header");

  console.log("initDispatchSchedule вызван, найдено:", headers.length);

  headers.forEach(header => {
    const dispatcherId = header.dataset.dispatcher;
    const driverRows = document.querySelectorAll(`.driver-row[data-dispatcher="${dispatcherId}"]`);

    header.addEventListener("click", e => {
      if (e.target.tagName === 'A') return;

      console.log("клик по диспетчеру", dispatcherId);

      const isHidden = getComputedStyle(driverRows[0]).display === "none";

      driverRows.forEach(row => {
        row.style.display = isHidden ? "table-row" : "none";  // 👈 Явно указываем тип
      });
    });
  });
}