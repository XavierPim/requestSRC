// ✅ Get the base route dynamically & clean it
let dashboardRoute = window.location.pathname.replace(/\/$/, ""); // Remove trailing slash if any

// ✅ Fetch logs when the dashboard loads
document.addEventListener("DOMContentLoaded", () => {
    fetchLogs();
    setupToggles();
});

async function fetchLogs(filters = {}) {
    let query = new URLSearchParams(filters).toString();
    let response = await fetch(`${dashboardRoute}/logs?${query}`);

    if (!response.ok) {
        console.error("❌ Failed to fetch logs:", response.statusText);
        return;
    }

    let data = await response.json();
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
            <td>${log.req_type}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

async function fetchGraphData() {
    let response = await fetch(`${dashboardRoute}/logs`);
    let data = await response.json();

    let labels = data.map(log => log.timestamp);
    let requestCounts = {};

    data.forEach(log => {
        requestCounts[log.req_type] = (requestCounts[log.req_type] || 0) + 1;
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
    let response = await fetch(`${dashboardRoute}/config`);
    let config = await response.json();

    document.getElementById("toggleAnonymize").checked = config.anonymize;
    document.getElementById("toggleUserAgent").checked = config.logUserAgent;
}

async function updateConfig() {
    let newConfig = {
        anonymize: document.getElementById("toggleAnonymize").checked,
        logUserAgent: document.getElementById("toggleUserAgent").checked
    };

    const response = await fetch(`${dashboardRoute}/update-config`, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig)
    });

    if (response.ok) {
        alert("✅ Settings updated successfully!");
    } else {
        alert("❌ Failed to update settings!");
    }
}
