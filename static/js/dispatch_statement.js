function initStatementDispatcherEvents() {
  // сюда только вызовы других функций, если появятся
}

function openDispatcherPayrollModal() {
    document.getElementById("dispatcherPayrollModal").classList.add("show");
    document.getElementById("dispatcherPayrollBackdrop").classList.add("show");
}

function closeDispatcherPayrollModal() {
    document.getElementById("dispatcherPayrollModal").classList.remove("show");
    document.getElementById("dispatcherPayrollBackdrop").classList.remove("show");
}