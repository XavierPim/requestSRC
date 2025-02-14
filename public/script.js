// ✅ Get the base route dynamically & clean it
let dashboardRoute = window.location.pathname.replace(/\/$/, ""); // Remove trailing slash if any

// Sorting variables
let currentSortColumn = null;
let currentSortOrder = "asc";

// Pagination variables
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
    let page = document.getElementById("pageButtons");
    let graph = document.getElementById("logChart");
    let selectMenu = document.getElementById("groupBy");

    if (table.style.display !== "none") {
        table.style.display = "none";
        page.style.display = "none"; // ✅ Fixed typo (was disply)
        graph.style.display = "block";
        selectMenu.style.display = "block";
        document.getElementById("toggleView").innerText = "📊 Switch to Table";

        // ✅ Refresh graph when toggling
        fetchGraphData(document.getElementById("groupBy").value);
    } else {
        table.style.display = "block";
        page.style.display = "block";
        graph.style.display = "none";
        selectMenu.style.display = "none";
        document.getElementById("toggleView").innerText = "📈 Switch to Graph";
    }
});

async function fetchLogs(filters = {}) {
    filters.limit = limit;
    filters.page = currentPage;

    let query = new URLSearchParams(filters).toString();
    let response = await fetch(`${dashboardRoute}/logs?${query}`);

    if (!response.ok) return;

    let data = await response.json();
    let tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = "";

    if (data.length === 0) return;

    data.forEach(log => {
        let localTime = convertUTCtoLocal(log.timestamp, false); // ✅ Returns formatted string

        let row = `<tr>
            <td>${localTime}</td> 
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

async function fetchGraphData(groupBy = "req_type") {
    let filters = { limit: 1000, page: 1 };

    let query = new URLSearchParams(filters).toString();
    let response = await fetch(`${dashboardRoute}/logs?${query}`);
    let data = await response.json();

    if (!data || data.length === 0) return;

    let groupedData = {};

    data.forEach(log => {
        let localTimestamp = convertUTCtoLocal(log.timestamp, true);
        if (!localTimestamp) return;
    
        let key = log[groupBy] || "Unknown";
    
        // ✅ Round timestamps based on selected time unit
        let timeUnit = document.getElementById("timeRange")?.value || "minute"; 
        let timeKey;
    
        if (timeUnit === "minute") {
            timeKey = localTimestamp.toISOString().slice(0, 16) + ":00.000Z"; // ✅ Round to minute
        } else if (timeUnit === "hour") {
            timeKey = localTimestamp.toISOString().slice(0, 13) + ":00:00.000Z"; // ✅ Round to hour
        } else if (timeUnit === "day") {
            timeKey = localTimestamp.toISOString().slice(0, 10) + "T00:00:00.000Z"; // ✅ Round to day
        }
    
        if (!groupedData[key]) groupedData[key] = {};
        if (!groupedData[key][timeKey]) groupedData[key][timeKey] = 0;
    
        groupedData[key][timeKey]++;
    });
    
    let datasets = Object.keys(groupedData).map(key => ({
        label: key,
        data: Object.entries(groupedData[key])
            .map(([time, count]) => ({ x: new Date(time), y: count }))
            .sort((a, b) => a.x - b.x), 
        fill: false,
        borderColor: getRandomColor()
    }));
    

    let canvas = document.getElementById("logChart");
    let ctx = canvas.getContext("2d");
    
    // ✅ Ensure chart instance is fully reset before rendering
    if (window.chartInstance) {
        window.chartInstance.destroy();
        document.getElementById("logChart").remove(); // Remove old canvas
        let newCanvas = document.createElement("canvas");
        newCanvas.id = "logChart";
        newCanvas.style = "display:block; width:100%; max-height:400px;";
        document.body.appendChild(newCanvas); // Re-add canvas to the DOM
        ctx = newCanvas.getContext("2d"); // Reset context
    }
    
    window.chartInstance = new Chart(ctx, {
        type: "line",
        data: { datasets },
        options: {
            responsive: true,
            scales: {
                x: {
                    type: "time",
                    time: { unit: "minute" },
                    adapters: { date: Chart._adapters._date }
                },
                y: {
                    title: { display: true, text: `Count by ${groupBy}` }
                }
            }
        }
    });
    
}

// ✅ Utility function for random colors
function getRandomColor() {
    return `hsl(${Math.floor(Math.random() * 360)}, 100%, 50%)`;
}

// ✅ Convert UTC timestamp to local time and remove seconds
function convertUTCtoLocal(utcDateString, forChart = false) {
    let utcDate = new Date(utcDateString);
    if (isNaN(utcDate)) return null; // Prevent invalid dates

    let userOffset = utcDate.getTimezoneOffset() * 60000;
    let localDate = new Date(utcDate.getTime() - userOffset);

    // ✅ If used for a graph, return a Date object (needed for Chart.js)
    if (forChart) return localDate;

    // ✅ If used for a table, return a formatted string (MM/DD/YYYY HH:mm AM/PM)
    return localDate.toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
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

    if (currentSortColumn === columnIndex) {
        currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
    } else {
        currentSortOrder = "asc";
    }
    currentSortColumn = columnIndex;

    rows.sort((a, b) => {
        let valA = a.cells[columnIndex].innerText.toLowerCase();
        let valB = b.cells[columnIndex].innerText.toLowerCase();
        return currentSortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

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
