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
    let response = await fetch("/api/logs");
    let data = await response.json();

    let tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = "";

    data.forEach(log => {
        let row = `<tr>
            <td>${log.timestamp}</td>
            <td>${log.ip}</td>
            <td>${log.geo.city}, ${log.geo.region}, ${log.geo.country}</td>
            <td>${log.user_agent}</td>
            <td>${log.reqType}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

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

