const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(require("cors")());

// Serve Static Frontend
app.use(express.static("public"));

const USERS_FILE = "users.json";
const RATES_FILE = "exchangeRates.json";

// Load or initialize files
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(RATES_FILE)) {
    fs.writeFileSync(RATES_FILE, JSON.stringify({ stakes: 1.52, animec: 0.5 }));
}

// Read Users from File
const getUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
const saveUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

// Read Exchange Rates
const getRates = () => {
    let rates = JSON.parse(fs.readFileSync(RATES_FILE, "utf8"));
    rates.ngn = 1; // Ensure NGN is always 1
    return rates;
};
const saveRates = (rates) => fs.writeFileSync(RATES_FILE, JSON.stringify(rates, null, 2));

const LINKED_FILE = "linked.json";
if (!fs.existsSync(LINKED_FILE)) fs.writeFileSync(LINKED_FILE, "{}");

const getLinkedUsers = () => JSON.parse(fs.readFileSync(LINKED_FILE, "utf8"));
const saveLinkedUsers = (linked) => fs.writeFileSync(LINKED_FILE, JSON.stringify(linked, null, 2));

/* --- USER LOGIN/REGISTRATION --- */

app.post("/login", async (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    let users = getUsers();
    let user = users.find((u) => u.userId === userId);

    if (!user) {
        // First-time login: Register user with hashed password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        user = {
            userId,
            password: hashedPassword,
            walletAddress: uuidv4(),
            balances: { stakes: 10, animec: 10, ngn: 500 },
        };

        users.push(user);
        saveUsers(users);

        return res.json({ message: "Account created", userId: user.userId, walletAddress: user.walletAddress });
    }

    // Verify password for returning user
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid password" });
    }

    res.json({ message: "Login successful", userId: user.userId, walletAddress: user.walletAddress });
});

/* --- SEND NGN --- */
app.post("/send", (req, res) => {
    const { senderId, receiverId, amount } = req.body;
    let users = getUsers();

    // Validate input
    if (!senderId || !receiverId || !amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid request parameters" });
    }

    const sender = users.find((u) => u.userId === senderId);
    const receiver = users.find((u) => u.userId === receiverId);

    if (!sender || !receiver) return res.status(404).json({ error: "User not found" });
    if (senderId === receiverId) return res.status(400).json({ error: "Cannot send money to yourself" });
    if (sender.balances.ngn < amount) return res.status(400).json({ error: "Insufficient funds" });

    // Perform transaction
    sender.balances.ngn -= amount;
    receiver.balances.ngn += amount;
    saveUsers(users);

    res.json({
        message: "Transaction successful",
        senderBalance: sender.balances.ngn,
        receiverBalance: receiver.balances.ngn,
    });
});

/* --- GET EXCHANGE RATES --- */
app.get("/exchange-rates", (req, res) => {
    res.json(getRates());
});

/* --- UPDATE EXCHANGE RATES --- */
app.post("/update-rates", (req, res) => {
    const { stakes, animec } = req.body;
    let rates = getRates();

    rates.stakes = Math.max(1, Math.min(10, stakes));
    rates.animec = Math.max(0.5, Math.min(10, animec));

    saveRates(rates);
    res.json({ message: "Rates updated", rates });
});

/* --- AUTOMATIC BALANCE UPDATES EVERY SECOND --- */
setInterval(() => {
    let users = getUsers();

    users.forEach(user => {
        const stakeMultiplier = Math.log10(user.balances.stakes + 1) + 1;  // Higher balance = Higher rewards
        const animecMultiplier = Math.log10(user.balances.animec + 1) + 1; 

        if (Math.random() > 0.5) {
            user.balances.stakes += Math.floor(Math.random() * 3 * stakeMultiplier);
        } else {
            user.balances.stakes -= Math.floor(Math.random() * 3);
        }

        if (Math.random() > 0.5) {
            user.balances.animec += Math.floor(Math.random() * 3 * animecMultiplier);
        } else {
            user.balances.animec -= Math.floor(Math.random() * 3);
        }

        // Ensure balances never go negative
        user.balances.stakes = Math.max(0, user.balances.stakes);
        user.balances.animec = Math.max(0, user.balances.animec);
    });

    saveUsers(users);
}, 1000);// Runs every 60 seconds // Runs every second

/* --- GET USER BALANCE --- */
app.get("/balance/:userId", (req, res) => {
    let users = getUsers();
    const user = users.find(u => u.userId === req.params.userId);

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user.balances);
});
/* --- BUY CURRENCY --- */
app.post("/buy", (req, res) => {
    const { userId, fromCurrency, toCurrency, amount } = req.body;
    let users = getUsers();
    let rates = getRates();

    const user = users.find((u) => u.userId === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!rates[fromCurrency] || !rates[toCurrency]) {
        return res.status(400).json({ error: "Invalid currency" });
    }

    if (user.balances[fromCurrency] < amount) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    // Make sure NGN remains 1 and does not fluctuate
    rates.ngn = 1; 

    // Convert amount based on exchange rates
    const convertedAmount = (amount / rates[fromCurrency]) * rates[toCurrency];

    // Deduct from the original currency and add to the new currency
    user.balances[fromCurrency] -= amount;
    user.balances[toCurrency] += convertedAmount;

    saveUsers(users);
    res.json({ message: "Currency purchased successfully", balances: user.balances });
});

/* --- EXCHANGE CURRENCY --- */
app.post("/exchange", (req, res) => {
    const { userId, fromCurrency, toCurrency, amount } = req.body;
    let users = getUsers();
    let rates = getRates();

    const user = users.find((u) => u.userId === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!rates[fromCurrency] || !rates[toCurrency]) return res.status(400).json({ error: "Invalid currency" });

    if (user.balances[fromCurrency] < amount) return res.status(400).json({ error: "Insufficient funds" });

    // Convert currency based on rates
    const exchangedAmount = (amount / rates[fromCurrency]) * rates[toCurrency];

    // Update user balances
    user.balances[fromCurrency] -= amount;
    user.balances[toCurrency] += exchangedAmount;

    saveUsers(users);
    res.json({ message: "Exchange successful", balances: user.balances });
});

app.post("/auto-fluctuate-rates", (req, res) => {
    let rates = getRates();

    // Subtle fluctuation for STAKES and ANIMEC
    let fluctuationFactor = 0.9975 + Math.random() * 0.005;
    rates.stakes = parseFloat((rates.stakes * fluctuationFactor).toFixed(4));
    rates.animec = parseFloat((rates.animec * (2 - fluctuationFactor)).toFixed(4));

    rates.ngn = 1; // Ensure NGN remains 1 at all times
    saveRates(rates);

    res.json({ message: "Rates fluctuated", rates });
});

// Automatically fluctuate rates every minute
setInterval(() => {
    let rates = getRates();

    // Apply the same fluctuation logic
    let fluctuationFactor = 0.9975 + Math.random() * 0.005;
    rates.stakes = parseFloat((rates.stakes * fluctuationFactor).toFixed(4));
    rates.animec = parseFloat((rates.animec * (2 - fluctuationFactor)).toFixed(4));

    rates.ngn = 1; // NGN remains fixed
    saveRates(rates);
}, 60000); // Runs every 60 seconds// Runs every 60 seconds // Every 60 seconds

app.post("/connect", async (req, res) => {
    const { userId, chatId, code } = req.body;

    if (!userId || !chatId || !code) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    let linkedUsers = getLinkedUsers();

    // Limit 5 failed attempts per hour
    if (!linkedUsers[userId]) {
        linkedUsers[userId] = { chatId: null, attempts: [], linkedAt: null };
    }

    let userAttempts = linkedUsers[userId].attempts || [];
    userAttempts = userAttempts.filter(attempt => Date.now() - attempt < 3600000); // Keep only last 1 hour attempts

    if (userAttempts.length >= 5) {
        return res.status(429).json({ error: "Too many attempts. Try again later." });
    }

    // Fetch codes from external API
    try {
        const response = await fetch(`https://txtorg-code.hf.space/api/get?q=${chatId}`);
        const data = await response.json();

        if (!data.codes || !data.codes.length) {
            return res.status(400).json({ error: "No valid code found. Try again later." });
        }

        // Check if any of the requested codes match
        const now = Date.now();
        const validCode = data.codes.find(c => c.code === code && now - c.timestamp * 1000 < 5 * 60 * 1000); // 5 min expiry

        if (!validCode) {
            linkedUsers[userId].attempts.push(Date.now());
            saveLinkedUsers(linkedUsers);
            return res.status(401).json({ error: "Invalid or expired code" });
        }

        // Successful linking
        linkedUsers[userId] = { chatId, linkedAt: now, attempts: [] };
        saveLinkedUsers(linkedUsers);

        return res.json({ message: "Successfully linked Telegram!", chatId });
    } catch (error) {
        console.error("Error verifying code:", error);
        return res.status(500).json({ error: "Failed to verify code" });
    }
});

app.get("/check-telegram", (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    let linkedUsers = getLinkedUsers();
    let verified = linkedUsers[userId] && linkedUsers[userId].chatId ? true : false;

    res.json({ verified });
});

app.post("/withdraw", async (req, res) => {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid request" });
    }

    let users = getUsers();
    let linkedUsers = JSON.parse(fs.readFileSync("linked.json", "utf8"));

    const user = users.find(u => u.userId === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const chatId = linkedUsers[userId]?.chatId;
    if (!chatId) return res.status(400).json({ error: "Telegram not linked. Go to /connect" });

    if (user.balances.stakes < amount) {
        return res.status(400).json({ error: "Insufficient STAKES balance" });
    }

    try {
        // Deduct STAKES immediately
        user.balances.stakes -= amount;
        saveUsers(users);

        // Send withdrawal request
        const withdrawUrl = `https://txtorg-code.hf.space/add?amount=${amount}&chatid=${chatId}`;
        const response = await axios.get(withdrawUrl);
        const result = response.data;

        // Check if the API responded with the correct chatId & amount
        if (result.chatId === String(chatId) && result.amount == amount) {
            return res.json({ message: "Withdrawal successful", newBalance: user.balances.stakes });
        } else {
            // Refund the user if the withdrawal API response is incorrect
            user.balances.stakes += amount;
            saveUsers(users);
            return res.status(500).json({ error: "Withdrawal failed, refunded STAKES" });
        }
    } catch (error) {
        console.error("Withdrawal Error:", error);
        
        // Refund user on error
        user.balances.stakes += amount;
        saveUsers(users);

        return res.status(500).json({ error: "Withdrawal service unavailable. STAKES refunded." });
    }
});

app.post("/deposit", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    let users = getUsers();
    let linkedUsers = JSON.parse(fs.readFileSync("linked.json", "utf8"));
    let receivedTransactions = JSON.parse(fs.readFileSync("received.json", "utf8"));

    const user = users.find(u => u.userId === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const chatId = linkedUsers[userId]?.chatId;
    if (!chatId) return res.status(400).json({ error: "Telegram not linked. Go to /connect" });

    try {
        // Fetch deposit history from API
        const depositUrl = `https://txtorg-code.hf.space/get2?chatid=${chatId}`;
        const response = await axios.get(depositUrl);
        const depositData = response.data;

        if (!depositData.amounts || depositData.amounts.length === 0) {
            return res.status(400).json({ error: "No new deposits found" });
        }

        let totalDeposited = 0;
        let newDeposits = [];

        depositData.amounts.forEach(({ amount, timestamp }) => {
            // Avoid duplicate claims
            if (!receivedTransactions[chatId]?.includes(timestamp)) {
                totalDeposited += amount;
                newDeposits.push(timestamp);
            }
        });

        if (totalDeposited === 0) {
            return res.status(400).json({ error: "No new deposits available" });
        }

        // Update user balance
        user.balances.stakes += totalDeposited;
        saveUsers(users);

        // Save new deposits in received.json
        if (!receivedTransactions[chatId]) {
            receivedTransactions[chatId] = [];
        }
        receivedTransactions[chatId].push(...newDeposits);
        fs.writeFileSync("received.json", JSON.stringify(receivedTransactions, null, 2));

        res.json({ message: `Deposit successful: +${totalDeposited} STAKES`, newBalance: user.balances.stakes });
    } catch (error) {
        console.error("Deposit Error:", error);
        res.status(500).json({ error: "Deposit service unavailable" });
    }
});

app.all("/update-exchange-rates", (req, res) => {
    let rates = JSON.parse(fs.readFileSync("exchangeRates.json", "utf8"));

    // Get query parameters from both GET & POST requests
    const updatedRates = req.method === "POST" ? req.body : req.query;

    // Prevent NGN from being modified
    const { ngn, ...validUpdates } = updatedRates;

    // Update only provided and valid numeric values
    for (let key in validUpdates) {
        if (rates.hasOwnProperty(key) && !isNaN(validUpdates[key])) {
            rates[key] = parseFloat(validUpdates[key]);
        }
    }

    // Save updated rates
    fs.writeFileSync("exchange-rates.json", JSON.stringify(rates, null, 2));

    res.json({ message: "Exchange rates updated", updatedRates: rates });
});

app.post("/get-linked-chat", (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    let linkedUsers = JSON.parse(fs.readFileSync("linked.json", "utf8"));
    const chatId = linkedUsers[userId]?.chatId;

    if (!chatId) {
        return res.status(400).json({ error: "Telegram not linked" });
    }

    res.json({ chatId });
});

/* --- Serve Frontend (index.html) --- */
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/send", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "send.html"));
});

app.get("/connect", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "connect.html"));
});

app.get("/profile", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "profile.html"));
});

app.get("/withdraw", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "withdraw.html"));
});

app.get("/deposit", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "deposit.html"));
});

app.get(["/animec", "/ngn", "/stakes"], (req, res) => {
    res.sendFile(path.join(__dirname, "public", "currency.html"));
});

/* --- START SERVER --- */
const PORT = 7860;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
