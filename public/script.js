document.addEventListener("DOMContentLoaded", async () => {
    const userId = localStorage.getItem("userId");

    // Redirect to login if user is not logged in
    if (!userId) {
        window.location.href = "/login";
        return;
    }

    let balanceKeys = ["STAKES", "ANIMEC", "NGN"];
    let currentIndex = 0;

    async function updateBalance() {
        try {
            const response = await fetch(`/balance/${userId}`);

            if (!response.ok) throw new Error("Failed to fetch user balance");

            const balances = await response.json();

            const formattedBalances = {
                STAKES: `🆂 ${balances.stakes.toFixed(2)}`,
                ANIMEC: `𒀭 ${balances.animec.toFixed(4)}`,
                NGN: `₦${balances.ngn.toLocaleString()}`
            };

            document.getElementById("balance").textContent = formattedBalances[balanceKeys[currentIndex]];
        } catch (error) {
            console.error("Error fetching user balance:", error);
        }
    }

    // Initial fetch
    await updateBalance();

    // Update balance every second
    setInterval(updateBalance, 1000);

    // Handle balance switch
    document.getElementById("switch-balance").addEventListener("click", () => {
        currentIndex = (currentIndex + 1) % balanceKeys.length;
        updateBalance();
    });
});
