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
document.getElementById("toggleView").addEventListener("change", function () {
    let table = document.getElementById("logTable");
    let page = document.getElementById("pageButtons");
    let graph = document.getElementById("logChart");
    let selectMenu = document.getElementById("groupBy");

    if (this.checked) {
        table.style.display = "none";
        page.style.display = "none"; 
        graph.style.display = "block";
        selectMenu.style.display = "block";

        // ✅ Refresh graph when toggling
        fetchGraphData(document.getElementById("groupBy").value);
    } else {
        table.style.display = "block";
        page.style.display = "block";
        graph.style.display = "none";
        selectMenu.style.display = "none";
    }
});

async function fetchLogs() {
    let filters = { 
        limit: 50, 
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
let lastId = 0;
async function fetchGraphData() {
    let timeRange = document.getElementById("timeRange").value;
    let groupBy = document.getElementById("groupBy").value;

    // ✅ Reset `lastId` when switching groupBy to prevent missing data
    if (window.currentGroupBy !== groupBy) {
        lastId = 0;
        window.currentGroupBy = groupBy;
    }

    let response = await fetch(`${dashboardRoute}/chart-data?lastId=${lastId}&timeRange=${timeRange}&groupBy=${groupBy}`);
    let result = await response.json();

    if (!result || result.data.length === 0) return;

    lastId = result.lastId; // ✅ Track the latest fetched ID

    let groupedData = {};
    let colorIndex = 0;

    result.data.forEach(log => {
        let localTime = convertUTCtoLocal(log.time, true); // ✅ Convert UTC to Local
        let key = log[groupBy] || "Unknown";

        if (!groupedData[key]) groupedData[key] = {};
        if (!groupedData[key][localTime]) groupedData[key][localTime] = 0;
        groupedData[key][localTime] += log.count;

        // ✅ Ensure colors persist across updates
        if (!assignedColors[key]) {
            assignedColors[key] = colorPalette[colorIndex % colorPalette.length];
            colorIndex++;
        }
    });

    let datasets = Object.keys(groupedData).map(key => ({
        label: key,
        data: Object.entries(groupedData[key]).map(([time, count]) => ({ x: new Date(time), y: count })), // ✅ Use local time
        fill: false,
        borderColor: assignedColors[key]
    }));

    let canvas = document.getElementById("logChart");
    let ctx = canvas.getContext("2d");

    if (window.chartInstance) {
        let existingLabels = new Set(window.chartInstance.data.datasets.map(ds => ds.label));

        datasets.forEach(newDataset => {
            let existingDataset = window.chartInstance.data.datasets.find(ds => ds.label === newDataset.label);
            if (existingDataset) {
                existingDataset.data = newDataset.data; // ✅ Only update data points
            } else {
                window.chartInstance.data.datasets.push(newDataset); // ✅ Add new dataset if missing
            }
        });

        // ✅ Remove datasets that no longer exist
        window.chartInstance.data.datasets = window.chartInstance.data.datasets.filter(ds => 
            datasets.some(newDs => newDs.label === ds.label)
        );

        window.chartInstance.update();
    } else {
        window.chartInstance = new Chart(ctx, {
            type: "line",
            data: { datasets },
            options: {
                responsive: true,
                animation: false,
                hover: { animationDuration: 0 },
                responsiveAnimationDuration: 0,
                plugins: {
                    legend: { display: true }, // ✅ Ensure Chart.js legend is active
                },
                scales: {
                    x: { type: "time" },
                    y: { title: { display: true, text: `Count by ${groupBy}` } }
                }
            }
        });
    }
}

/**
 * ✅ Convert UTC timestamp to local time and remove seconds
 */
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
        if (icon) icon.innerText = ""; // Reset all to default
    }

    if (currentSortColumn !== null) {
        let icon = document.getElementById(`sortIcon${currentSortColumn}`);
        if (icon) {
            icon.innerText = currentSortOrder === "asc" ? "⬆️" : "⬇️";
        }
    }
}

// ✅ Automatically refresh only the active views
setInterval(() => {
    let table = document.getElementById("logTable");
    let graph = document.getElementById("logChart");

    if (table.style.display !== "none") {
        fetchLogs(); 
    } else if (graph.style.display !== "none") {
        fetchGraphData(); 
    }
}, 5000); 


