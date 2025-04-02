document.addEventListener("DOMContentLoaded", function () {
  initDispatchFilter();
  highlightDriversWithoutDispatcher();
});

function initDispatchFilter() {
  const nameInput = document.getElementById("searchName");
  const unitInput = document.getElementById("searchUnitNumber");
  const dispatcherSelect = document.getElementById("searchDispatcher");
  const table = document.getElementById("driversTable");

  if (!nameInput || !unitInput || !dispatcherSelect || !table) return;

  function filter() {
    const nameFilter = nameInput.value.toLowerCase();
    const unitFilter = unitInput.value.toLowerCase();
    const dispatcherFilter = dispatcherSelect.value.toLowerCase();

    table.querySelectorAll("tbody tr").forEach(row => {
      const name = row.querySelector(".driver-name")?.textContent.toLowerCase() || "";
      const unit = row.querySelector(".truck-unit")?.textContent.toLowerCase() || "";
      const dispatcher = row.querySelector(".dispatcher-name")?.textContent.toLowerCase() || "";

      const match =
        name.includes(nameFilter) &&
        unit.includes(unitFilter) &&
        dispatcher.includes(dispatcherFilter);

      row.style.display = match ? "" : "none";
    });
  }

  nameInput.addEventListener("input", filter);
  unitInput.addEventListener("input", filter);
  dispatcherSelect.addEventListener("change", filter);
}

function highlightDriversWithoutDispatcher() {
  const rows = document.querySelectorAll(".driver-row");

  rows.forEach(row => {
    const dispatcherCell = row.querySelector(".dispatcher-name");
    if (dispatcherCell && dispatcherCell.textContent.trim() === "Нет диспетчера") {
      row.style.backgroundColor = "#fff3cd"; // мягкий жёлтый
    }
  });
}
