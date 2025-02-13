document.addEventListener("DOMContentLoaded", () => {
    fetchLogs();
    setupToggles();
});

document.getElementById("toggleView").addEventListener("click", () => {
    let table = document.getElementById("logTable");
    let graph = document.getElementById("logChart");

    if (table.style.display !== "none") {
        table.style.display = "none";
        graph.style.display = "block";
        document.getElementById("toggleView").innerText = "📊 Switch to Table";
        fetchGraphData();
    } else {
        table.style.display = "block";
        graph.style.display = "none";
        document.getElementById("toggleView").innerText = "📈 Switch to Graph";
    }
});

async function fetchLogs() {
    let dashboardRoute = "/custom"; // Make sure this matches the config
    console.log(`📌 Fetching logs from: ${dashboardRoute}/logs`);

    let response = await fetch(`${dashboardRoute}/logs`);
    
    if (!response.ok) {
        console.error("❌ Failed to fetch logs:", response.statusText);
        return;
    }

    let data = await response.json();
    console.log("📌 Received logs:", data); // ✅ Debugging

    let tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = ""; // Clear table before inserting new rows

    if (data.length === 0) {
        console.warn("⚠️ No logs available to display.");
        return;
    }

    data.forEach(log => {
        let row = `<tr>
            <td>${log.timestamp}</td>
            <td>${log.ip}</td>
            <td>${log.city || "Unknown"}</td>
            <td>${log.region || "Unknown"}</td>
            <td>${log.country || "Unknown"}</td>
            <td>${log.user_agent}</td>
            <td>${log.reqType}</td>
        </tr>`;
        tbody.innerHTML += row;
    });

    console.log("📌 Table updated with logs.");
}

// ✅ Fetch logs when the dashboard loads
document.addEventListener("DOMContentLoaded", async () => {
    console.log("📌 Dashboard loaded. Fetching logs...");
    await fetchLogs();
    setupToggles();
});



async function fetchGraphData() {
    let response = await fetch("/api/logs");
    let data = await response.json();

    let labels = data.map(log => log.timestamp);
    let requestCounts = {};

    data.forEach(log => {
        requestCounts[log.reqType] = (requestCounts[log.reqType] || 0) + 1;
    });

    let ctx = document.getElementById("logChart").getContext("2d");
    new Chart(ctx, {
        type: "bar",
        data: {
            labels: Object.keys(requestCounts),
            datasets: [{
                label: "Requests",
                data: Object.values(requestCounts),
                backgroundColor: "blue"
            }]
        }
    });
}

async function setupToggles() {
    let response = await fetch("/api/config");
    let config = await response.json();

    document.getElementById("toggleAnonymize").checked = config.anonymize;
    document.getElementById("toggleUserAgent").checked = config.logUserAgent;
}

async function updateConfig() {
    let newConfig = {
        anonymize: document.getElementById("toggleAnonymize").checked,
        logUserAgent: document.getElementById("toggleUserAgent").checked
    };

    const response = await fetch("/dashboard/update-config", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig)
    });

    if (response.ok) {
        alert("Settings updated successfully!");
    } else {
        alert("Failed to update settings!");
    }
}

