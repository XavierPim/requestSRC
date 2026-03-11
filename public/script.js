let dashboardRoute = window.location.pathname.replace(/\/$/, '');

const SORT_FIELDS = ['timestamp', 'ip', 'city', 'region', 'country', 'user_agent', 'req_type'];
const PAGE_SIZE = 50;
const colorPalette = [
    '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#33FFF5', '#FFC300', '#FF5733',
    '#C70039', '#900C3F', '#581845', '#28A745', '#17A2B8', '#DC3545', '#FFC107'
];

let currentSortColumn = null;
let currentSortOrder = 'desc';
let currentPage = 1;
let paginationState = {
    totalLogs: 0,
    totalPages: 1,
    hasPrevPage: false,
    hasNextPage: false
};

let assignedColors = {};
let chartInstance = null;
let tableRefreshInFlight = false;
let graphRefreshInFlight = false;
const hiddenSeriesByGroup = new Map();

function getHiddenSeriesSet(groupBy) {
    if (!hiddenSeriesByGroup.has(groupBy)) {
        hiddenSeriesByGroup.set(groupBy, new Set());
    }
    return hiddenSeriesByGroup.get(groupBy);
}

function buildLegendOptions() {
    return {
        display: true,
        onClick(_event, legendItem, legend) {
            const chart = legend?.chart;
            const datasetIndex = legendItem?.datasetIndex;
            if (!chart || !Number.isInteger(datasetIndex)) {
                return;
            }

            const dataset = chart.data?.datasets?.[datasetIndex];
            const label = dataset?.label;
            if (typeof label !== 'string') {
                return;
            }

            const hiddenSeries = chart.$hiddenSeries instanceof Set ? chart.$hiddenSeries : null;
            const currentlyVisible = chart.isDatasetVisible(datasetIndex);
            const nextVisible = !currentlyVisible;

            if (hiddenSeries) {
                if (nextVisible) {
                    hiddenSeries.delete(label);
                } else {
                    hiddenSeries.add(label);
                }
            }

            chart.setDatasetVisibility(datasetIndex, nextVisible);
            chart.update('none');
        },
        onHover(_event, _legendItem, legend) {
            if (legend?.chart?.canvas) {
                legend.chart.canvas.style.cursor = 'pointer';
            }
        },
        onLeave(_event, _legendItem, legend) {
            if (legend?.chart?.canvas) {
                legend.chart.canvas.style.cursor = 'default';
            }
        },
        labels: {
            boxWidth: 28,
            boxHeight: 10,
            padding: 12,
            generateLabels(chart) {
                const baseGenerator = Chart.defaults.plugins.legend.labels.generateLabels;
                const baseLabels = baseGenerator(chart);
                const hiddenSeries = chart.$hiddenSeries instanceof Set ? chart.$hiddenSeries : null;

                return baseLabels.map((item) => {
                    const dataset = chart.data?.datasets?.[item.datasetIndex];
                    const label = dataset?.label;
                    const isHidden = hiddenSeries && typeof label === 'string'
                        ? hiddenSeries.has(label)
                        : !chart.isDatasetVisible(item.datasetIndex);

                    if (isHidden) {
                        return {
                            ...item,
                            hidden: true,
                            fillStyle: '#b7bfcb',
                            strokeStyle: '#b7bfcb',
                            fontColor: '#8e97a5'
                        };
                    }

                    return {
                        ...item,
                        hidden: false,
                        fontColor: '#5f6b7a'
                    };
                });
            }
        }
    };
}

function getSortField() {
    if (currentSortColumn === null) return null;
    return SORT_FIELDS[currentSortColumn] || null;
}

function resolveTimeUnit(timeRange) {
    if (timeRange === 'hour') return 'hour';
    if (timeRange === 'day') return 'day';
    if (timeRange === 'week') return 'week';
    if (timeRange === 'month') return 'month';
    if (timeRange === 'quarter') return 'month';
    return 'day';
}

function formatGraphBucketLabel(dateValue, timeRange) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    if (timeRange === 'hour') {
        return date.toLocaleString('en-US', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function ensureColorForKey(key) {
    if (!assignedColors[key]) {
        assignedColors[key] = colorPalette[Object.keys(assignedColors).length % colorPalette.length];
    }
    return assignedColors[key];
}

function updateSortIcons() {
    for (let i = 0; i < SORT_FIELDS.length; i += 1) {
        const icon = document.getElementById(`sortIcon${i}`);
        if (icon) {
            icon.innerText = '';
        }
    }

    if (currentSortColumn !== null) {
        const icon = document.getElementById(`sortIcon${currentSortColumn}`);
        if (icon) {
            icon.innerText = currentSortOrder === 'asc' ? '▲' : '▼';
        }
    }
}

function updatePaginationControls() {
    const previousButton = document.getElementById('prevPageBtn');
    const nextButton = document.getElementById('nextPageBtn');
    const display = document.getElementById('currentPageDisplay');

    if (previousButton) {
        previousButton.disabled = !paginationState.hasPrevPage;
    }
    if (nextButton) {
        nextButton.disabled = !paginationState.hasNextPage;
    }

    if (display) {
        display.innerText = `Page ${currentPage} of ${paginationState.totalPages} (${paginationState.totalLogs} logs)`;
    }
}

function convertUTCtoLocal(utcDateString) {
    const utcDate = new Date(utcDateString);
    if (Number.isNaN(utcDate.getTime())) return 'Unknown';

    return utcDate.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function parseUserAgent(uaString) {
    if (!uaString) return 'Unknown';

    let browser = 'Unknown';
    let platform = 'Unknown';
    let version = '';

    if (uaString.includes('curl')) {
        browser = 'curl';
        version = uaString.match(/curl\/([\d.]+)/)?.[1] || '';
        return `${browser} ${version}`.trim();
    }
    if (uaString.includes('Wget')) {
        browser = 'Wget';
        version = uaString.match(/Wget\/([\d.]+)/)?.[1] || '';
        return `${browser} ${version}`.trim();
    }
    if (uaString.includes('HTTPie')) {
        browser = 'HTTPie';
        version = uaString.match(/HTTPie\/([\d.]+)/)?.[1] || '';
        return `${browser} ${version}`.trim();
    }
    if (uaString.includes('python-requests')) {
        browser = 'python-requests';
        version = uaString.match(/python-requests\/([\d.]+)/)?.[1] || '';
        return `${browser} ${version}`.trim();
    }
    if (uaString.includes('PostmanRuntime')) return 'Postman';
    if (uaString.includes('insomnia')) return 'Insomnia';

    if (uaString.includes('Edg')) {
        browser = 'Edge';
        version = uaString.match(/Edg\/([\d.]+)/)?.[1] || '';
    } else if (uaString.includes('Chrome')) {
        browser = 'Chrome';
        version = uaString.match(/Chrome\/([\d.]+)/)?.[1] || '';
    } else if (uaString.includes('Firefox')) {
        browser = 'Firefox';
        version = uaString.match(/Firefox\/([\d.]+)/)?.[1] || '';
    } else if (uaString.includes('Safari') && !uaString.includes('Chrome')) {
        browser = 'Safari';
        version = uaString.match(/Version\/([\d.]+)/)?.[1] || '';
    } else if (uaString.includes('MSIE') || uaString.includes('Trident')) {
        browser = 'IE';
        version = uaString.match(/(MSIE |rv:)([\d.]+)/)?.[2] || '';
    }

    if (uaString.includes('Windows')) platform = 'Windows';
    else if (uaString.includes('Mac OS X')) platform = 'Mac';
    else if (uaString.includes('Linux')) platform = 'Linux';
    else if (uaString.includes('Android')) platform = 'Android';
    else if (uaString.includes('iPhone') || uaString.includes('iPad')) platform = 'iOS';

    return `${browser} (${platform})`.trim();
}

function renderTableRows(rows) {
    const tbody = document.querySelector('#logTable tbody');
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        tbody.innerHTML = '';
        return;
    }

    const renderedRows = rows.map((log, index) => {
        const localTime = convertUTCtoLocal(log.timestamp);
        const rowColor = index % 2 === 0 ? 'white' : '#f7f6fe';
        const reqType = log.req_type || 'Unknown';
        const baseColor = ensureColorForKey(reqType);
        const lightColor = `${baseColor}30`;

        return `<tr style="background-color: ${rowColor};">
            <td>${localTime}</td>
            <td>${log.ip || 'Unknown'}</td>
            <td>${log.city || 'Unknown'}</td>
            <td>${log.region || 'Unknown'}</td>
            <td>${log.country || 'Unknown'}</td>
            <td>${parseUserAgent(log.user_agent)}</td>
            <td><span class="req-badge" style="background-color: ${lightColor}; color: ${baseColor};">${reqType}</span></td>
        </tr>`;
    });

    tbody.innerHTML = renderedRows.join('');
}

async function fetchLogs() {
    const filters = {
        limit: PAGE_SIZE,
        page: currentPage,
        sortOrder: currentSortOrder
    };

    const sortField = getSortField();
    if (sortField) {
        filters.sortBy = sortField;
        filters.sortColumn = currentSortColumn;
    }

    const query = new URLSearchParams(filters).toString();
    const response = await fetch(`${dashboardRoute}/logs?${query}`);
    if (!response.ok) {
        throw new Error('Failed to fetch logs');
    }

    const payload = await response.json();
    currentPage = Number.parseInt(payload.page, 10) || 1;
    paginationState = {
        totalLogs: Number.parseInt(payload.totalLogs, 10) || 0,
        totalPages: Number.parseInt(payload.totalPages, 10) || 1,
        hasPrevPage: Boolean(payload.hasPrevPage),
        hasNextPage: Boolean(payload.hasNextPage)
    };

    renderTableRows(payload.data || []);
    updatePaginationControls();
    updateSortIcons();
}

function hideChart() {
    const noDataMessage = document.getElementById('noDataMessage');
    const graph = document.getElementById('logChart');

    if (noDataMessage) {
        noDataMessage.style.display = 'block';
    }
    if (graph) {
        graph.style.display = 'none';
    }

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
}

function showChart() {
    const noDataMessage = document.getElementById('noDataMessage');
    const graph = document.getElementById('logChart');

    if (noDataMessage) {
        noDataMessage.style.display = 'none';
    }
    if (graph) {
        graph.style.display = 'block';
    }
}

async function fetchGraphData() {
    const timeRange = document.getElementById('timeRange')?.value || 'hour';
    const groupBy = document.getElementById('groupBy')?.value || 'req_type';
    const hiddenSeries = getHiddenSeriesSet(groupBy);

    const query = new URLSearchParams({ timeRange, groupBy }).toString();
    const response = await fetch(`${dashboardRoute}/chart-data?${query}`);
    if (!response.ok) {
        throw new Error('Failed to fetch graph data');
    }

    const result = await response.json();
    if (!result || !Array.isArray(result.data) || result.data.length === 0) {
        hideChart();
        return;
    }

    const groupedData = {};
    const labelSet = new Set();

    result.data.forEach((log) => {
        const key = (log[groupBy] || 'Unknown').toString();
        const label = formatGraphBucketLabel(log.time, timeRange);
        if (!label) {
            return;
        }

        const count = Number.parseInt(log.count, 10) || 0;
        if (!groupedData[key]) {
            groupedData[key] = {};
        }
        groupedData[key][label] = (groupedData[key][label] || 0) + count;
        labelSet.add(label);
        ensureColorForKey(key);
    });

    const datasetKeys = Object.keys(groupedData);
    const labels = Array.from(labelSet);

    if (datasetKeys.length === 0 || labels.length === 0) {
        hideChart();
        return;
    }

    const datasets = datasetKeys.map((key) => ({
        label: key,
        data: labels.map((label) => groupedData[key][label] || 0),
        fill: false,
        borderColor: assignedColors[key],
        backgroundColor: assignedColors[key],
        pointRadius: 3,
        tension: 0.2,
        hidden: hiddenSeries.has(key)
    }));

    showChart();

    const canvas = document.getElementById('logChart');
    const ctx = canvas.getContext('2d');
    const xTitle = timeRange === 'hour' ? 'Time' : 'Date';

    if (chartInstance) {
        chartInstance.$hiddenSeries = hiddenSeries;
        chartInstance.$groupBy = groupBy;
        chartInstance.data.labels = labels;
        chartInstance.data.datasets = datasets;
        chartInstance.options.scales.x.title.text = xTitle;
        chartInstance.options.scales.y.title.text = `Count by ${groupBy}`;
        chartInstance.update('none');
        return;
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            animation: false,
            plugins: {
                legend: buildLegendOptions()
            },
            scales: {
                x: {
                    type: 'category',
                    title: { display: true, text: xTitle }
                },
                y: { title: { display: true, text: `Count by ${groupBy}` } }
            }
        }
    });

    chartInstance.$hiddenSeries = hiddenSeries;
    chartInstance.$groupBy = groupBy;
}

async function setupToggles() {
    const response = await fetch(`${dashboardRoute}/config`);
    if (!response.ok) {
        return;
    }

    const config = await response.json();
    const toggle = document.getElementById('toggleAnonymize');
    if (toggle) {
        toggle.checked = Boolean(config.anonymize);
    }
}

async function refreshActiveView() {
    const graphMode = Boolean(document.getElementById('toggleView')?.checked);
    if (graphMode) {
        await fetchGraphData();
        return;
    }
    await fetchLogs();
}

async function seedDummyData() {
    const response = await fetch(`${dashboardRoute}/dummy-data?count=180&days=180`, {
        method: 'POST'
    });

    if (!response.ok) {
        throw new Error('Failed to create dummy data');
    }

    await refreshActiveView();
}

async function clearDummyData() {
    const confirmed = window.confirm('Delete all generated dummy data rows?');
    if (!confirmed) {
        return;
    }

    const response = await fetch(`${dashboardRoute}/dummy-data`, {
        method: 'DELETE'
    });

    if (!response.ok) {
        throw new Error('Failed to delete dummy data');
    }

    await refreshActiveView();
}

function nextPage() {
    if (!paginationState.hasNextPage) {
        return;
    }
    currentPage += 1;
    fetchLogs().catch((error) => console.error(error.message));
}

function prevPage() {
    if (!paginationState.hasPrevPage || currentPage <= 1) {
        return;
    }
    currentPage -= 1;
    fetchLogs().catch((error) => console.error(error.message));
}

function fetchLogsWithSorting(columnIndex) {
    if (columnIndex < 0 || columnIndex >= SORT_FIELDS.length) {
        return;
    }

    if (currentSortColumn === columnIndex) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = columnIndex;
        currentSortOrder = 'asc';
    }

    localStorage.setItem('sortColumn', String(currentSortColumn));
    localStorage.setItem('sortOrder', currentSortOrder);

    currentPage = 1;
    fetchLogs().catch((error) => console.error(error.message));
}

function setGraphMode(enabled) {
    const table = document.getElementById('logTable');
    const page = document.getElementById('pageButtons');
    const graph = document.getElementById('logChart');
    const graphOptions = document.getElementById('graphOptions');
    const anonToggler = document.getElementById('container');
    const settings = document.getElementById('settings');

    if (enabled) {
        table.style.display = 'none';
        page.style.display = 'none';
        graph.style.display = 'block';
        graphOptions.style.display = 'block';
        anonToggler.style.display = 'none';
        settings.style.backgroundColor = '#d8315b';
        document.body.classList.add('graph-mode');
    } else {
        table.style.display = 'table';
        page.style.display = 'block';
        graph.style.display = 'none';
        graphOptions.style.display = 'none';
        anonToggler.style.display = 'flex';
        settings.style.backgroundColor = '#3e92cc';
        document.body.classList.remove('graph-mode');
    }
}

function startAutoRefresh() {
    setInterval(() => {
        const graphMode = Boolean(document.getElementById('toggleView')?.checked);
        const refreshIcon = document.getElementById('refreshIcon');
        if (!refreshIcon) {
            return;
        }

        const refreshPromises = [];

        if (!graphMode && !tableRefreshInFlight) {
            tableRefreshInFlight = true;
            refreshPromises.push(
                fetchLogs().catch(() => {}).finally(() => {
                    tableRefreshInFlight = false;
                })
            );
        } else if (graphMode && !graphRefreshInFlight) {
            graphRefreshInFlight = true;
            refreshPromises.push(
                fetchGraphData().catch(() => {}).finally(() => {
                    graphRefreshInFlight = false;
                })
            );
        }

        if (refreshPromises.length === 0) {
            return;
        }

        refreshIcon.classList.add('refreshing');
        Promise.allSettled(refreshPromises).finally(() => {
            setTimeout(() => {
                refreshIcon.classList.remove('refreshing');
            }, 500);
        });
    }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    const storedSortColumn = Number.parseInt(localStorage.getItem('sortColumn'), 10);
    if (Number.isInteger(storedSortColumn) && storedSortColumn >= 0 && storedSortColumn < SORT_FIELDS.length) {
        currentSortColumn = storedSortColumn;
    }

    const storedSortOrder = (localStorage.getItem('sortOrder') || 'desc').toLowerCase();
    currentSortOrder = storedSortOrder === 'asc' ? 'asc' : 'desc';

    const toggleView = document.getElementById('toggleView');
    if (toggleView) {
        toggleView.addEventListener('change', function onToggleView() {
            setGraphMode(this.checked);
            if (this.checked) {
                fetchGraphData().catch((error) => console.error(error.message));
            } else {
                fetchLogs().catch((error) => console.error(error.message));
            }
        });
    }

    const toggleAnonymize = document.getElementById('toggleAnonymize');
    if (toggleAnonymize) {
        toggleAnonymize.addEventListener('change', function onAnonymizeChange() {
            const newConfig = { anonymize: this.checked };
            fetch(`${dashboardRoute}/update-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            }).catch(() => {});
        });
    }

    const seedDummyBtn = document.getElementById('seedDummyBtn');
    if (seedDummyBtn) {
        seedDummyBtn.addEventListener('click', () => {
            seedDummyData().catch((error) => console.error(error.message));
        });
    }

    const clearDummyBtn = document.getElementById('clearDummyBtn');
    if (clearDummyBtn) {
        clearDummyBtn.addEventListener('click', () => {
            clearDummyData().catch((error) => console.error(error.message));
        });
    }

    updateSortIcons();
    updatePaginationControls();

    fetchLogs().catch((error) => console.error(error.message));
    setupToggles().catch(() => {});
    startAutoRefresh();
});
