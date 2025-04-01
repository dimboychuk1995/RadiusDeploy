// search.js

document.addEventListener("DOMContentLoaded", function () {
    var searchNameInput = document.getElementById("searchName");
    var searchUnitNumberInput = document.getElementById("searchUnitNumber");
    var searchDispatcherSelect = document.getElementById("searchDispatcher");
    var driversTable = document.getElementById("driversTable");

    function filterDrivers() {
        var nameFilter = searchNameInput.value.toLowerCase();
        var unitNumberFilter = searchUnitNumberInput.value.toLowerCase();
        var dispatcherFilter = searchDispatcherSelect.value.toLowerCase();

        var rows = driversTable.getElementsByTagName("tbody")[0].getElementsByTagName("tr");

        for (var i = 0; i < rows.length; i++) {
            var nameCell = rows[i].getElementsByClassName("driver-name")[0];
            var unitNumberCell = rows[i].getElementsByClassName("truck-unit")[0];
            var dispatcherCell = rows[i].getElementsByClassName("dispatcher-name")[0];

            var nameText = nameCell.textContent.toLowerCase();
            var unitNumberText = unitNumberCell.textContent.toLowerCase();
            var dispatcherText = dispatcherCell.textContent.toLowerCase();

            var nameMatch = nameText.includes(nameFilter);
            var unitNumberMatch = unitNumberText.includes(unitNumberFilter);
            var dispatcherMatch = dispatcherText.includes(dispatcherFilter) || dispatcherFilter === "";

            if (nameMatch && unitNumberMatch && dispatcherMatch) {
                rows[i].style.display = "";
            } else {
                rows[i].style.display = "none";
            }
        }
    }

    searchNameInput.addEventListener("input", filterDrivers);
    searchUnitNumberInput.addEventListener("input", filterDrivers);
    searchDispatcherSelect.addEventListener("change", filterDrivers);
});