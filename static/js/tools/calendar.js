function initUnitsMileage() {
  const input = document.getElementById("dateRangePicker");
  if (!input) {
    console.warn("⛔ #dateRangePicker не найден");
    return;
  }

  $(input).daterangepicker({
    startDate: moment().subtract(6, 'days'),
    endDate: moment(),
    showDropdowns: true,
    autoApply: false,
    linkedCalendars: false,
    opens: 'right',
      drops: 'down',
    showCustomRangeLabel: true,
    alwaysShowCalendars: true,
    locale: {
      format: 'MM / DD / YYYY',
      applyLabel: 'APPLY',
      cancelLabel: 'CANCEL',
      daysOfWeek: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      monthNames: moment.months(),
      firstDay: 1
    },
    ranges: {
      'Today': [moment(), moment()],
      'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
      'Three days': [moment().subtract(2, 'days'), moment()],
      'One week': [moment().subtract(6, 'days'), moment()],
      'Two weeks': [moment().subtract(13, 'days'), moment()],
      'Month': [moment().startOf('month'), moment().endOf('month')],
      'This Week & Next Week': [moment().startOf('isoWeek'), moment().add(13, 'days')],
      'Reset': [moment(), moment()]
    }
  });
}