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
    let graphOptions = document.getElementById("graphOptions");
    let anonToggler = document.getElementById("container");
    let header = document.getElementById("header");
    let settings = document.getElementById("settings");
    let body = document.body; // ✅ Use body to apply mode-based styles

    if (this.checked) {
        table.style.display = "none";
        page.style.display = "none";
        graph.style.display = "block";
        graphOptions.style.display = "block";
        anonToggler.style.display = "none";
        header.style.padding = "0";
        header.style.margin = "0";
        header.style.width = "100%";
        settings.style.backgroundColor = "#d8315b";
        
        // ✅ Apply graph mode styling
        body.classList.add("graph-mode");
        
        // ✅ Refresh chart data
        fetchGraphData(document.getElementById("groupBy").value);
    } else {
        table.style.display = "table";
        page.style.display = "block";
        graph.style.display = "none";
        graphOptions.style.display = "none";
        anonToggler.style.display = "flex";
        header.style.width = "90%";
        
        settings.style.backgroundColor = "#3e92cc";
        
        // ✅ Remove graph mode styling
        body.classList.remove("graph-mode");
    }
});


async function fetchLogs() {
    return new Promise(async (resolve) => {
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
        updateSortIcons(); 
    }

    // ✅ Assign colors to request types (shared with graph)
    data.data.forEach((log, index) => {
        let localTime = convertUTCtoLocal(log.timestamp, false);
        let rowColor = index % 2 === 0 ? "white" : "#f7f6fe";

        let reqType = log.req_type || "Unknown";

        // ✅ Reuse assignedColors from graph
        if (!assignedColors[reqType]) {
            assignedColors[reqType] = colorPalette[Object.keys(assignedColors).length % colorPalette.length];
        }

        // ✅ Generate a lighter version of the color
        let baseColor = assignedColors[reqType];
        let lightColor = `${baseColor}30`; // Adds 30% transparency

        let row = `<tr style="background-color: ${rowColor};">
            <td>${localTime}</td> 
            <td>${log.ip}</td>
            <td>${log.city || "Unknown"}</td>
            <td>${log.region || "Unknown"}</td>
            <td>${log.country || "Unknown"}</td>
            <td>${parseUserAgent(log.user_agent)}</td>
            <td>
                <span class="req-badge" style="background-color: ${lightColor}; color: ${baseColor};">${reqType}</span>
            </td>
        </tr>`;

        tbody.innerHTML += row;
    });

    document.getElementById("currentPageDisplay").innerText = `Page: ${currentPage}`;
    resolve();
});
}





// ✅ Color palette for assigning colors to request types
const colorPalette = [
    "#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#A133FF", "#33FFF5", "#FFC300", "#FF5733",
    "#C70039", "#900C3F", "#581845", "#28A745", "#17A2B8", "#DC3545", "#FFC107"
];
let assignedColors = {};
let lastId = 0;
async function fetchGraphData() {
    return new Promise(async (resolve) => {
    let timeRange = document.getElementById("timeRange").value;
    let groupBy = document.getElementById("groupBy").value;

    if (window.currentGroupBy !== groupBy) {
        lastId = 0;
        window.currentGroupBy = groupBy;
    }

    let response = await fetch(`${dashboardRoute}/chart-data?lastId=${lastId}&timeRange=${timeRange}&groupBy=${groupBy}`);
    let result = await response.json();

    if (!result || result.data.length === 0) return;

    lastId = result.lastId;

    let groupedData = {};
    let colorIndex = 0;

    result.data.forEach(log => {
        let localTime = convertUTCtoLocal(log.time, true);
        let key = log[groupBy] || "Unknown";

        if (!groupedData[key]) groupedData[key] = {};
        if (!groupedData[key][localTime]) groupedData[key][localTime] = 0;
        groupedData[key][localTime] += log.count;

        if (!assignedColors[key]) {
            assignedColors[key] = colorPalette[colorIndex % colorPalette.length];
            colorIndex++;
        }
    });

    let datasets = Object.keys(groupedData).map(key => ({
        label: key,
        data: Object.entries(groupedData[key]).map(([time, count]) => ({ x: new Date(time), y: count })),
        fill: false,
        borderColor: assignedColors[key]
    }));

    let canvas = document.getElementById("logChart");
    let ctx = canvas.getContext("2d");

    // ✅ Dynamically set the time unit based on `timeRange`
    let timeUnit;
    if (timeRange === "hour") timeUnit = "hour";  // Last 24 Hours → Hourly
    else if (timeRange === "day") timeUnit = "day"; 
    else if (timeRange === "week") timeUnit = "week"; 
    else if (timeRange === "month") timeUnit = "month"; 
    else if (timeRange === "quarter") timeUnit = "month"; 
    else timeUnit = "day"; // Default: Daily

    if (window.chartInstance) {
        datasets.forEach(newDataset => {
            let existingDataset = window.chartInstance.data.datasets.find(ds => ds.label === newDataset.label);
            if (existingDataset) {
                existingDataset.data = newDataset.data;
            } else {
                window.chartInstance.data.datasets.push(newDataset);
            }
        });

        window.chartInstance.data.datasets = window.chartInstance.data.datasets.filter(ds =>
            datasets.some(newDs => newDs.label === ds.label)
        );

        // ✅ Update x-axis time scale dynamically
        window.chartInstance.options.scales.x.time.unit = timeUnit;

        // ✅ Update y-axis title dynamically based on selected `groupBy`
        window.chartInstance.options.scales.y.title.text = `Count by ${groupBy}`;
        window.chartInstance.update();
    } else {
        window.chartInstance = new Chart(ctx, {
            type: "line",
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio:  true,
                animation: false,
                hover: { animationDuration: 0 },
                responsiveAnimationDuration: 0,
                plugins: {
                    legend: { display: true },
                },
                scales: {
                    x: { 
                        type: "time", 
                        time: { unit: timeUnit } 
                    },
                    y: { title: { display: true, text: `Count by ${groupBy}` } }
                }
            }
        });
    }
    resolve();
});
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
/**
 * ✅ Extracts relevant info from User-Agent, including Insomnia & Postman
 */
function parseUserAgent(uaString) {
    if (!uaString) return "Unknown";

    let browser = "Unknown";
    let platform = "Unknown";
    let version = "";

    // ✅ Detect API Clients
    if (uaString.includes("PostmanRuntime")) return "Postman";
    if (uaString.includes("insomnia")) return "Insomnia";

    // ✅ Detect Browsers
    if (uaString.includes("Chrome")) {
        browser = "Chrome";
        version = uaString.match(/Chrome\/([\d.]+)/)?.[1] || "";
    } else if (uaString.includes("Firefox")) {
        browser = "Firefox";
        version = uaString.match(/Firefox\/([\d.]+)/)?.[1] || "";
    } else if (uaString.includes("Safari") && !uaString.includes("Chrome")) {
        browser = "Safari";
        version = uaString.match(/Version\/([\d.]+)/)?.[1] || "";
    } else if (uaString.includes("Edg")) {
        browser = "Edge";
        version = uaString.match(/Edg\/([\d.]+)/)?.[1] || "";
    } else if (uaString.includes("MSIE") || uaString.includes("Trident")) {
        browser = "IE";
        version = uaString.match(/(MSIE |rv:)([\d.]+)/)?.[2] || "";
    }

    // ✅ Detect Platforms
    if (uaString.includes("Windows")) platform = "Windows";
    else if (uaString.includes("Mac OS X")) platform = "Mac";
    else if (uaString.includes("Linux")) platform = "Linux";
    else if (uaString.includes("Android")) platform = "Android";
    else if (uaString.includes("iPhone") || uaString.includes("iPad")) platform = "iOS";

    // return `${browser} ${version} (${platform})`.trim(); //this is if you want to show version
    return `${browser} (${platform})`.trim();
}


async function setupToggles() {
    let response = await fetch(`${dashboardRoute}/config`);
    let config = await response.json();

    document.getElementById("toggleAnonymize").checked = config.anonymize;
}

document.getElementById("toggleAnonymize").addEventListener("change", function () {
    let newConfig = {
        anonymize: this.checked 
    };

    fetch(`${dashboardRoute}/update-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig)
    })
        .then(response => {
            if (response.ok) {
                console.log("✅ Anonymization setting updated successfully!");
            } else {
                console.error("❌ Failed to update anonymization setting.");
            }
        });
});




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

    fetchLogs(); 
}


function updateSortIcons() {
    for (let i = 0; i < 7; i++) {
        let icon = document.getElementById(`sortIcon${i}`);
        if (icon) icon.innerText = ""; // Reset all to default
    }

    if (currentSortColumn !== null) {
        let icon = document.getElementById(`sortIcon${currentSortColumn}`);
        if (icon) {
            icon.innerText = currentSortOrder === "asc" ? "▲" : "▼";
        }
    }
}

// ✅ Automatically refresh only the active views
setInterval(() => {
    let table = document.getElementById("logTable");
    let graph = document.getElementById("logChart");
    let refreshIcon = document.getElementById("refreshIcon");

    // ✅ Change ⟳ to a spinning version when refreshing
    refreshIcon.classList.add("refreshing");

    let fetchPromises = [];

    if (table.style.display !== "none") {
        fetchPromises.push(fetchLogs());
    } else if (graph.style.display !== "none") {
        fetchPromises.push(fetchGraphData());
    }

    // ✅ Revert back to static ⟳ after refresh completes
    Promise.all(fetchPromises).then(() => {
        setTimeout(() => {
            refreshIcon.classList.remove("refreshing");
        }, 500);
    });

}, 5000);


