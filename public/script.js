// ✅ Get the base route dynamically & clean it
let dashboardRoute = window.location.pathname.replace(/\/$/, ""); // Remove trailing slash if any

// Sorting variables
let currentSortColumn = null;
let currentSortOrder = "asc";

// Pagination variables
let currentPage = 1;
const limit = 100;

document.addEventListener("DOMContentLoaded", () => {
    currentSortColumn = localStorage.getItem("sortColumn") 
        ? parseInt(localStorage.getItem("sortColumn")) 
        : null;
    currentSortOrder = localStorage.getItem("sortOrder") || "asc";

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
        page.style.display = "none"; 
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

async function fetchLogs() {
    let filters = { 
        limit: 50, // ✅ Now fetching only 50 logs per page
        page: currentPage,
        sortColumn: localStorage.getItem("sortColumn") || null,
        sortOrder: localStorage.getItem("sortOrder") || "desc"
    };

    let query = new URLSearchParams(filters).toString();
    let response = await fetch(`${dashboardRoute}/logs?${query}`);
    
    if (!response.ok) return;

    let data = await response.json();
    let tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = ""; // ✅ Clear only current page data

    // ✅ Apply sorting before rendering
    if (filters.sortColumn !== null) {
        let columnIndex = parseInt(filters.sortColumn);
        let sortOrder = filters.sortOrder;

        data.data.sort((a, b) => {
            let valA = a[Object.keys(a)[columnIndex]];
            let valB = b[Object.keys(b)[columnIndex]];
        
            if (valA === undefined || valA === null) valA = "";
            if (valB === undefined || valB === null) valB = "";
        
            let numA = parseFloat(valA);
            let numB = parseFloat(valB);
        
            if (!isNaN(numA) && !isNaN(numB)) { 
                return sortOrder === "asc" ? numA - numB : numB - numA;
            }
        
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        
            return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });

        updateSortIcons(); // ✅ Keep sorting icons updated
    }

    data.data.forEach(log => {
        let localTime = convertUTCtoLocal(log.timestamp, false);

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



// ✅ Color palette for assigning colors to request types
const colorPalette = [
    "#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#A133FF", "#33FFF5", "#FFC300", "#FF5733",
    "#C70039", "#900C3F", "#581845", "#28A745", "#17A2B8", "#DC3545", "#FFC107"
];
let assignedColors = {}; 

async function fetchGraphData(groupBy = "req_type") {
    let response = await fetch(`${dashboardRoute}/logs`);
    let data = await response.json();

    if (!data || data.length === 0) return;

    let groupedData = {};
    let colorIndex = 0;

    data.forEach(log => {
        let localTimestamp = convertUTCtoLocal(log.timestamp, true);
        if (!localTimestamp) return;
    
        let key = log[groupBy] || "Unknown";

        let timeUnit = document.getElementById("timeRange")?.value || "minute"; 
        let timeKey;
    
        if (timeUnit === "minute") {
            timeKey = localTimestamp.toISOString().slice(0, 16) + ":00.000Z"; 
        } else if (timeUnit === "hour") {
            timeKey = localTimestamp.toISOString().slice(0, 13) + ":00:00.000Z";
        } else if (timeUnit === "day") {
            timeKey = localTimestamp.toISOString().slice(0, 10) + "T00:00:00.000Z";
        }
    
        if (!groupedData[key]) groupedData[key] = {};
        if (!groupedData[key][timeKey]) groupedData[key][timeKey] = 0;
    
        groupedData[key][timeKey]++;

        // ✅ Assign a fixed color if not already assigned
        if (!assignedColors[key]) {
            assignedColors[key] = colorPalette[colorIndex % colorPalette.length]; // Cycle through colors
            colorIndex++;
        }
    });

    let datasets = Object.keys(groupedData).map(key => ({
        label: key,
        data: Object.entries(groupedData[key])
            .map(([time, count]) => ({ x: new Date(time), y: count }))
            .sort((a, b) => a.x - b.x), 
        fill: false,
        borderColor: assignedColors[key] 
    }));

    let canvas = document.getElementById("logChart");
    let ctx = canvas.getContext("2d");

    if (window.chartInstance) {
        window.chartInstance.data.datasets = datasets;
        window.chartInstance.update();
    } else {
        // ✅ Create the graph only once
        window.chartInstance = new Chart(ctx, {
            type: "line",
            data: { datasets },
            options: {
                responsive: true,
                animation: false, // ✅ Completely disable animations
                hover: { animationDuration: 0 }, // ✅ Disable hover effects
                responsiveAnimationDuration: 0, // ✅ Prevent resize animation
                scales: {
                    x: { type: "time", time: { unit: "minute" } },
                    y: { title: { display: true, text: `Count by ${groupBy}` } }
                }
            }
        });
    }
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
} 

async function anonToggle() {
    let response = await fetch(`${dashboardRoute}/config`);
    let config = await response.json();

    document.getElementById("toggleAnonymize").checked = config.anonymize;
}

async function updateConfig() {
    let newConfig = {
        anonymize: document.getElementById("toggleAnonymize").checked,
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

function fetchLogsWithSorting(columnIndex) {
    if (currentSortColumn === columnIndex) {
        currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
    } else {
        currentSortOrder = "asc";
    }
    currentSortColumn = columnIndex;

    localStorage.setItem("sortColumn", columnIndex);
    localStorage.setItem("sortOrder", currentSortOrder);

    fetchLogs(); // ✅ Fetch logs again with updated sorting
}


function updateSortIcons() {
    for (let i = 0; i < 7; i++) {
        let icon = document.getElementById(`sortIcon${i}`);
        if (icon) icon.innerText = "⬍"; // Reset all to default
    }

    if (currentSortColumn !== null) {
        let icon = document.getElementById(`sortIcon${currentSortColumn}`);
        if (icon) {
            icon.innerText = currentSortOrder === "asc" ? "⬆️" : "⬇️";
        }
    }
}


// ✅ Automatically refresh only the active view every 15 seconds
setInterval(() => {
    let table = document.getElementById("logTable");
    let graph = document.getElementById("logChart");

    if (table.style.display !== "none") {
        fetchLogs(); // ✅ Refresh table while keeping sorting
    } else if (graph.style.display !== "none") {
        let groupBy = document.getElementById("groupBy").value;
        fetchGraphData(groupBy); // ✅ Refresh graph only when visible
    }
}, 5000); // 🔄 Increased to 5 seconds to reduce API strain


