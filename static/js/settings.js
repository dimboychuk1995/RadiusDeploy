document.addEventListener("DOMContentLoaded", () => {
  TimezoneSettings.init();
});

const TimezoneSettings = {
  selectEl: null,
  saveBtn: null,
  currentTimezone: null,

  init() {
    this.selectEl = document.getElementById("timezoneSelect");
    this.saveBtn = document.getElementById("saveTimezoneBtn");
    this.currentTimezone = this.selectEl.dataset.current;

    this.loadTimezones();
    this.bindEvents();
  },

  loadTimezones() {
    fetch("/api/settings/timezones")
      .then(res => res.json())
      .then(timezones => {
        this.populateSelect(timezones);
      })
      .catch(err => {
        console.error("Ошибка загрузки таймзон:", err);
        this.showError("Ошибка загрузки таймзон");
      });
  },

  populateSelect(timezones) {
    this.selectEl.innerHTML = "";

    timezones.forEach(tz => {
      const option = document.createElement("option");
      option.value = tz;
      option.textContent = tz;
      if (tz === this.currentTimezone) {
        option.selected = true;
      }
      this.selectEl.appendChild(option);
    });
  },

  bindEvents() {
    this.saveBtn.addEventListener("click", () => {
      this.saveSelectedTimezone();
    });
  },

  saveSelectedTimezone() {
    const selected = this.selectEl.value;

    fetch("/api/settings/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: selected })
    })
      .then(res => res.json())
      .then(data => {
        console.log("Timezone saved:", data);
        this.showSuccess("Таймзона успешно сохранена");
      })
      .catch(err => {
        console.error("Ошибка при сохранении таймзоны:", err);
        this.showError("Ошибка при сохранении таймзоны");
      });
  },

  showSuccess(message) {
    Swal.fire({
      icon: 'success',
      title: 'Готово!',
      text: message,
      timer: 2000,
      showConfirmButton: false
    });
  },

  showError(message) {
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: message
    });
  }
};
