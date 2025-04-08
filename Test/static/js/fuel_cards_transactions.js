console.log('fuel transactions js called')

//загружает fuel card transaction fragment
function setupFuelCardTransactionsButton() {
    document.getElementById('btn-open-fuel-transactions')?.addEventListener('click', () => {
        fetch('/fragment/fuel_cards_transactions')
            .then(res => res.text())
            .then(html => {
                const section = document.getElementById('section-fuel-cards');
                section.innerHTML = html;
            })
            .catch(err => {
                console.error("Ошибка загрузки транзакций:", err);
            });
    });
}