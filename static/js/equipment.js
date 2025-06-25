function initEquipment() {
  const navLinks = document.querySelectorAll('#equipment-subnav .nav-link');
  const sections = document.querySelectorAll('.equipment-subsection');

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const target = link.dataset.target;
      sections.forEach(sec => {
        sec.style.display = sec.id === target ? 'block' : 'none';
      });
    });
  });
}
