function showLoadDetails(loadId) {
  const section = document.getElementById("section-loads_fragment");
  const details = document.getElementById("load-details");

  if (!section || !details) {
    console.error("Секции section-loads_fragment или load-details не найдены");
    return;
  }

  fetch(`/fragment/load_details_fragment?id=${loadId}`)
    .then(response => response.text())
    .then(html => {
      section.style.display = "none";
      details.innerHTML = html;
      details.style.display = "block";
    })
    .catch(error => {
      console.error("Ошибка загрузки деталей груза:", error);
    });
}


function returnToLoads() {
  const section = document.getElementById("section-loads_fragment");
  const details = document.getElementById("load-details");

  if (section && details) {
    details.style.display = "none";
    details.innerHTML = "";
    section.style.display = "block";
  }
}