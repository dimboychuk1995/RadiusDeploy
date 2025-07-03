function openDriverStatementModal() {
  const modal = document.getElementById("driverStatementModal");
  const backdrop = document.getElementById("driverStatementBackdrop");

  modal.style.display = "block";
  modal.classList.add("show");

  backdrop.style.display = "block";
  backdrop.classList.add("show");
}

function closeDriverStatementModal() {
  const modal = document.getElementById("driverStatementModal");
  const backdrop = document.getElementById("driverStatementBackdrop");

  modal.style.display = "none";
  modal.classList.remove("show");

  backdrop.style.display = "none";
  backdrop.classList.remove("show");
}
