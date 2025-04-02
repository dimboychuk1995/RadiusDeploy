document.addEventListener("DOMContentLoaded", function () {
  const sections = {
    'btn-trucks': 'section-trucks',
    'btn-drivers': 'section-drivers',
    'btn-dispatch': 'section-dispatch',
    'btn-loads': 'section-loads'
  };

  Object.keys(sections).forEach(buttonId => {
    const button = document.getElementById(buttonId);
    button.addEventListener("click", () => {
      // Активная кнопка
      Object.keys(sections).forEach(id => {
        const btn = document.getElementById(id);
        btn.classList.remove("active");

        const section = document.getElementById(sections[id]);
        section.style.display = "none";
      });

      button.classList.add("active");
      const targetSection = document.getElementById(sections[buttonId]);
      targetSection.style.display = "block";
    });
  });
});