function loadStatementFragment() {
    fetch('/statement/fragment')
        .then(response => response.text())
        .then(html => {
            document.getElementById('main-content').innerHTML = html;
        });
}