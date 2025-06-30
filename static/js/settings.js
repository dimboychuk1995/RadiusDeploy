document.addEventListener("DOMContentLoaded", () => {
  console.log("settings.js loaded");

  fetch("/api/settings/timezones")
    .then(res => {
      console.log("response status:", res.status);
      return res.json();
    })
    .then(timezones => {
      console.log("received timezones:", timezones);
      const select = document.getElementById("timezoneSelect");
      timezones.forEach(tz => {
        const option = document.createElement("option");
        option.value = tz;
        option.textContent = tz;
        select.appendChild(option);
      });
    })
    .catch(err => {
      console.error("Failed to load timezones:", err);
    });
});