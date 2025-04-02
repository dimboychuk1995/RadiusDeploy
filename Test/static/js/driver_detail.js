document.addEventListener("DOMContentLoaded", function () {
  const editBtn = document.getElementById("editBtn");
  const saveBtn = document.getElementById("saveBtn");
  const form = document.getElementById("editForm");

  if (editBtn && saveBtn && form) {
    editBtn.addEventListener("click", () => {
      form.querySelectorAll("input, select").forEach(field => {
        field.removeAttribute("disabled");
      });
      editBtn.classList.add("d-none");
      saveBtn.classList.remove("d-none");
    });
  }

  // Вкладки
  const btnInfo = document.getElementById("btn-info");
  const btnLoads = document.getElementById("btn-loads");
  const infoSection = document.getElementById("info-section");
  const loadsSection = document.getElementById("loads-section");

  if (btnInfo && btnLoads && infoSection && loadsSection) {
    btnInfo.addEventListener("click", () => {
      infoSection.style.display = "block";
      loadsSection.style.display = "none";
      btnInfo.classList.add("active");
      btnLoads.classList.remove("active");
    });

    btnLoads.addEventListener("click", () => {
      infoSection.style.display = "none";
      loadsSection.style.display = "block";
      btnLoads.classList.add("active");
      btnInfo.classList.remove("active");
    });
  }
});
