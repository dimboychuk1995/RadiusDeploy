function loadSafetyFragment() {
  const details = document.getElementById("inspection-details");
  if (details) {
    details.style.display = "none";
    details.innerHTML = "";
  }
  document.querySelector('[data-target="#safety-inspections"]')?.click();
}


async function showInspectionDetails(inspectionId) {
  const section = document.getElementById("section-safety");
  if (!section) {
    console.error("section-safety не найден");
    return;
  }

  try {
    const res = await fetch(`/fragment/inspection_details_fragment?id=${inspectionId}`);
    const html = await res.text();

    // создаём или находим контейнер
    let detailsContainer = document.getElementById("inspection-details");
    if (!detailsContainer) {
      detailsContainer = document.createElement("div");
      detailsContainer.id = "inspection-details";
      section.appendChild(detailsContainer);
    }

    // скрываем только safety-подсекции
    document.querySelectorAll(".safety-section").forEach(el => el.style.display = "none");

    // вставляем детали
    detailsContainer.innerHTML = html;
    detailsContainer.style.display = "block";
  } catch (e) {
    console.error("Ошибка при загрузке деталей:", e);
  }
}
