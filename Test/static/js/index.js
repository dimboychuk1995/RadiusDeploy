document.addEventListener("DOMContentLoaded", function () {
  const sections = {
    'btn-trucks': { id: 'section-trucks', url: '/fragment/trucks' },
    'btn-drivers': { id: 'section-drivers', url: '/fragment/drivers' },
    'btn-dispatch': { id: 'section-dispatch', url: '/fragment/dispatch' },
    'btn-loads': { id: 'section-loads', url: '/fragment/loads' }
  };

  function loadFragment(sectionId, url) {
    const section = document.getElementById(sectionId);
    if (!section.dataset.loaded) {
      fetch(url)
        .then(res => res.text())
        .then(html => {
          section.innerHTML = html;
          section.dataset.loaded = "true";

          // Переинициализация функций
          if (url.includes('trucks')) {
            initTruckModalActions?.();
            initTruckSearch?.();
          } else if (url.includes('drivers')) {
            initDriverFilter?.();
            initClickableRows?.();
            initDriverModalActions?.();
          } else if (url.includes('dispatch')) {
            initDispatchFunctions?.();
          } else if (url.includes('loads')) {
            initLoadFunctions?.();
          }
        });
    }
  }

  Object.keys(sections).forEach(buttonId => {
    const button = document.getElementById(buttonId);
    const { id: sectionId, url } = sections[buttonId];

    button.addEventListener("click", () => {
      // Скрыть все
      Object.values(sections).forEach(({ id }) => {
        const section = document.getElementById(id);
        if (section) section.style.display = "none";
      });

      // Убрать активность
      Object.keys(sections).forEach(id => {
        const btn = document.getElementById(id);
        btn.classList.remove("active");
      });

      // Показать нужную
      button.classList.add("active");
      const targetSection = document.getElementById(sectionId);
      targetSection.style.display = "block";
      loadFragment(sectionId, url);
    });
  });

  // Автооткрытие первой вкладки
  document.getElementById("btn-trucks").click();
});