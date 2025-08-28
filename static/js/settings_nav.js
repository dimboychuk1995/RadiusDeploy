(function () {
  // Progressive enhancement для подмены контента без "ощущения перезагрузки".
  // Полностью опционально: если JS не загрузится — обычные переходы работают.

  const container = () => document.getElementById('settings-content');
  const enhanceLinks = () => Array.from(document.querySelectorAll('a[data-settings-link]'));

  function setActive(hrefPath) {
    enhanceLinks().forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === hrefPath);
    });
  }

  async function loadPartial(url) {
    const target = container();
    if (!target) return;

    // мини-анимация
    target.classList.remove('fade-enter', 'fade-enter-active');
    void target.offsetWidth; // reflow
    target.classList.add('fade-enter');

    const u = new URL(url, window.location.origin);
    u.searchParams.set('partial', '1');
    const res = await fetch(u.toString(), { credentials: 'same-origin' });
    const html = await res.text();

    target.innerHTML = html;
    // подключим нужные скрипты вкладки
    if (u.pathname.endsWith('/timezone')) {
      // динамически догружаем settings.js (если ещё не загружен)
      if (!window.initTimezoneSettings) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = (window.STATIC_URL_PREFIX || '/static') + '/js/settings.js';
          s.onload = resolve;
          s.onerror = reject;
          document.body.appendChild(s);
        });
      }
      const currentTzEl = target.querySelector('#timezoneCurrent');
      if (window.initTimezoneSettings) {
        window.initTimezoneSettings(currentTzEl ? currentTzEl.textContent.trim() : 'America/Chicago');
      }
    }

    // завершение анимации
    requestAnimationFrame(() => {
      target.classList.add('fade-enter-active');
    });
  }

  function onClick(e) {
    const a = e.target.closest('a[data-settings-link]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    // перехватываем только ссылки внутри /settings/*
    if (!href.startsWith('/settings/')) return;

    e.preventDefault();
    history.pushState({ pjax: true }, '', href);
    setActive(href);
    loadPartial(href).catch(console.error);
  }

  function onPopState() {
    const path = window.location.pathname;
    if (path.startsWith('/settings/')) {
      setActive(path);
      loadPartial(path).catch(console.error);
    }
  }

  document.addEventListener('click', onClick);
  window.addEventListener('popstate', onPopState);

  // при первом заходе ничего делать не нужно — сервер уже вставил контент;
  // но если войдём сразу глубоко (например, F5 на /settings/permissions),
  // класс active выставим корректно.
  setActive(window.location.pathname);
})();
