document.addEventListener("DOMContentLoaded", async () => {
    const path = window.location.pathname;
    const currency = path.replace("/", "").toLowerCase(); // Extract currency from URL

    if (!["animec", "ngn", "stakes"].includes(currency)) {
        window.location.href = "/";
        return;
    }

    document.getElementById("currency-title").textContent = `${currency.toUpperCase()}`;

    const userId = localStorage.getItem("userId");
    if (!userId) {
        window.location.href = "/login";
        return;
    }

    try {
        // Fetch user balance
        const balanceResponse = await fetch(`/balance/${userId}`);
        const balances = await balanceResponse.json();

        if (!balances[currency]) {
            document.getElementById("balance-display").textContent = "You Have 0.";
            return;
        }

        document.getElementById("balance-display").textContent = `You have ${balances[currency]} ${currency.toUpperCase()}`;

        // Fetch exchange rates
        const ratesResponse = await fetch("/exchange-rates");
        const rates = await ratesResponse.json();

        if (!rates[currency]) {
            document.getElementById("current-value").textContent = "Exchange rate unavailable.";
        } else {
            document.getElementById("current-value").textContent = `Current Value: 1 ${currency.toUpperCase()} = ${rates[currency]} NGN`;
        }

        // Show wallet address if currency is NGN
        if (currency === "ngn") {
            document.getElementById("wallet-section").style.display = "block";
            document.getElementById("wallet-address").textContent = `Wallet: ${userId}`;
        }

        // Populate dropdowns
        populateDropdown("exchange-to", balances, currency);
        populateDropdown("pay-with", balances, currency);

    } catch (error) {
        console.error("Error fetching data:", error);
        document.getElementById("balance-display").textContent = "Error loading balance.";
    }
});

function populateDropdown(dropdownId, balances, currentCurrency) {
    const dropdown = document.getElementById(dropdownId);
    dropdown.innerHTML = ""; // Clear previous options

    // Default placeholder
    const defaultOption = document.createElement("option");
    defaultOption.textContent = "Select currency";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    dropdown.appendChild(defaultOption);

    Object.keys(balances).forEach((coin) => {
        if (coin !== currentCurrency) {
            const option = document.createElement("option");
            option.value = coin;
            option.textContent = coin.toUpperCase();
            dropdown.appendChild(option);
        }
    });
}

async function confirmExchange() {
    const currency = window.location.pathname.replace("/", "").toLowerCase();
    const toCurrency = document.getElementById("exchange-to").value;
    const amount = parseFloat(document.getElementById("exchange-amount").value);
    const userId = localStorage.getItem("userId");

    if (!amount || amount <= 0 || !toCurrency) {
        alert("Enter a valid amount and select a currency.");
        return;
    }

    const response = await fetch("/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fromCurrency: currency, toCurrency, amount })
    });

    const result = await response.json();
    if (result.error) {
        alert(result.error);
    } else {
        alert("Exchange successful!");
        window.location.reload();
    }
}

async function confirmBuy() {
    const currency = window.location.pathname.replace("/", "").toLowerCase();
    const fromCurrency = document.getElementById("pay-with").value;
    const userId = localStorage.getItem("userId");

    if (!fromCurrency) {
        alert("Choose a payment method.");
        return;
    }

    // Fetch exchange rates
    const ratesResponse = await fetch("/exchange-rates");
    const rates = await ratesResponse.json();

    const buyAmount = 100; // Example: User buys 10 units of selected currency
    const convertedAmount = (buyAmount / rates[currency]) * rates[fromCurrency];

    const response = await fetch("/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fromCurrency, toCurrency: currency, amount: convertedAmount })
    });

    const result = await response.json();
    if (result.error) {
        alert(result.error);
    } else {
        alert("Purchase successful!");
        window.location.reload();
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = "none";
}

function goBack() {
    window.location.href = "/";
}
