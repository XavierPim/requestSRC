// ✅ Get the base route dynamically & clean it
let dashboardRoute = window.location.pathname.replace(/\/$/, ""); // Remove trailing slash if any
//Sorting variables
let currentSortColumn = null;
let currentSortOrder = "asc";

//Pagination variables
let currentPage = 1;
const limit = 100;

// ✅ Fetch logs when the dashboard loads
document.addEventListener("DOMContentLoaded", () => {
    fetchLogs();
    setupToggles();
});

// ✅ Fetch graph data when switching to graph mode
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

async function fetchLogs(filters = {}) {
    filters.limit = limit;
    filters.page = currentPage;

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
        console.warn("⚠️ No logs available.");
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

    document.getElementById("currentPageDisplay").innerText = `Page: ${currentPage}`;
}

async function fetchGraphData() {
    let filters = {
        limit: 100, // ✅ Prevents loading excessive logs
        page: 1
    };

    let query = new URLSearchParams(filters).toString();
    let response = await fetch(`${dashboardRoute}/logs?${query}`);
    let data = await response.json();

    let requestCounts = {};
    data.forEach(log => {
        requestCounts[log.req_type] = (requestCounts[log.req_type] || 0) + 1;
    });

    let ctx = document.getElementById("logChart").getContext("2d");

    // ✅ Clear previous chart if it exists
    if (window.chartInstance) {
        window.chartInstance.destroy();
    }

    // ✅ Store new chart instance globally
    window.chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: Object.keys(requestCounts),
            datasets: [{
                label: "Requests by Type",
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

function sortTable(columnIndex) {
    let table = document.getElementById("logTable");
    let tbody = table.querySelector("tbody");
    let rows = Array.from(tbody.querySelectorAll("tr"));

    // Determine sort order
    if (currentSortColumn === columnIndex) {
        currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
    } else {
        currentSortOrder = "asc";
    }
    currentSortColumn = columnIndex;

    // Sort rows
    rows.sort((a, b) => {
        let valA = a.cells[columnIndex].innerText.toLowerCase();
        let valB = b.cells[columnIndex].innerText.toLowerCase();

        // Handle numeric sorting (timestamps, IPs)
        if (!isNaN(valA) && !isNaN(valB)) {
            return currentSortOrder === "asc" ? valA - valB : valB - valA;
        }

        return currentSortOrder === "asc"
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
    });

    // Reattach sorted rows
    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));
}


function nextPage() {
    currentPage++;
    fetchLogs();
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        fetchLogs();
    }
}
