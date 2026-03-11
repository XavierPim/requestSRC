const express = require('express');
const { expect } = require('chai');

const requestSRC = require('../lib/requestSRC');
const database = require('../lib/database');

const DASHBOARD_ROUTE = '/customUserDefinedRoute';

async function requestJson(server, path) {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await response.json();
    return { status: response.status, body };
}

describe('Dashboard routes', function dashboardRoutes() {
    this.timeout(5000);

    let server;
    let originalQuery;

    before((done) => {
        originalQuery = database.query;

        requestSRC.updateConfig({
            anonymize: false,
            dashboardRoute: DASHBOARD_ROUTE,
            retentionPeriod: 0,
            dashboardToken: '',
            resolveLocalIpWithPublicLookup: false
        });

        const app = express();
        app.use(express.json());
        app.use(requestSRC.router);

        server = app.listen(0, done);
    });

    after((done) => {
        database.query = originalQuery;
        if (server) {
            server.close(done);
            return;
        }
        done();
    });

    afterEach(() => {
        database.query = originalQuery;
        requestSRC.updateConfig({
            anonymize: false,
            dashboardRoute: DASHBOARD_ROUTE,
            retentionPeriod: 0,
            dashboardToken: '',
            resolveLocalIpWithPublicLookup: false
        });
    });

    it('GET /logs uses validated defaults, whitelist sort fallback, and additive metadata', async () => {
        const calls = [];
        database.query = async (sql, params) => {
            calls.push({ sql, params });

            if (/COUNT\(\*\)/i.test(sql)) {
                return { rows: [{ count: '15' }] };
            }

            return { rows: [{ id: 1, timestamp: '2026-03-01T00:00:00.000Z' }] };
        };

        const { status, body } = await requestJson(
            server,
            `${DASHBOARD_ROUTE}/logs?page=-9&limit=999&sortBy=not_a_real_column&sortOrder=nope`
        );

        expect(status).to.equal(200);
        expect(body.page).to.equal(1);
        expect(body.limit).to.equal(200);
        expect(body.totalLogs).to.equal(15);
        expect(body.totalPages).to.equal(1);
        expect(body.hasPrevPage).to.equal(false);
        expect(body.hasNextPage).to.equal(false);
        expect(body.data).to.be.an('array');

        const logsQuery = calls.find((entry) => /SELECT \*/i.test(entry.sql));
        expect(logsQuery).to.exist;
        expect(logsQuery.sql).to.include('ORDER BY timestamp DESC');
        expect(logsQuery.params).to.deep.equal([200, 0]);
    });

    it('GET /logs supports numeric sortColumn mapping and pagination metadata', async () => {
        const calls = [];
        database.query = async (sql, params) => {
            calls.push({ sql, params });

            if (/COUNT\(\*\)/i.test(sql)) {
                return { rows: [{ count: '25' }] };
            }

            return { rows: [{ id: 2, country: 'US' }] };
        };

        const { status, body } = await requestJson(
            server,
            `${DASHBOARD_ROUTE}/logs?sortColumn=4&sortOrder=asc&limit=10&page=2`
        );

        expect(status).to.equal(200);
        expect(body.page).to.equal(2);
        expect(body.limit).to.equal(10);
        expect(body.totalLogs).to.equal(25);
        expect(body.totalPages).to.equal(3);
        expect(body.hasPrevPage).to.equal(true);
        expect(body.hasNextPage).to.equal(true);

        const logsQuery = calls.find((entry) => /SELECT \*/i.test(entry.sql));
        expect(logsQuery).to.exist;
        expect(logsQuery.sql).to.include('ORDER BY country ASC');
        expect(logsQuery.params).to.deep.equal([10, 10]);
    });

    it('GET /logs clamps requested page to the last page when page is out of range', async () => {
        const calls = [];
        database.query = async (sql, params) => {
            calls.push({ sql, params });

            if (/COUNT\(\*\)/i.test(sql)) {
                return { rows: [{ count: '21' }] };
            }

            return { rows: [{ id: 99 }] };
        };

        const { status, body } = await requestJson(
            server,
            `${DASHBOARD_ROUTE}/logs?limit=10&page=9&sortBy=timestamp&sortOrder=desc`
        );

        expect(status).to.equal(200);
        expect(body.page).to.equal(3);
        expect(body.totalPages).to.equal(3);
        expect(body.hasPrevPage).to.equal(true);
        expect(body.hasNextPage).to.equal(false);

        const logsQuery = calls.find((entry) => /SELECT \*/i.test(entry.sql));
        expect(logsQuery).to.exist;
        expect(logsQuery.params).to.deep.equal([10, 20]);
    });

    it('GET /logs handles empty tables with stable pagination metadata', async () => {
        database.query = async (sql) => {
            if (/COUNT\(\*\)/i.test(sql)) {
                return { rows: [{ count: '0' }] };
            }

            return { rows: [] };
        };

        const { status, body } = await requestJson(server, `${DASHBOARD_ROUTE}/logs`);

        expect(status).to.equal(200);
        expect(body.page).to.equal(1);
        expect(body.totalPages).to.equal(1);
        expect(body.totalLogs).to.equal(0);
        expect(body.hasPrevPage).to.equal(false);
        expect(body.hasNextPage).to.equal(false);
        expect(body.data).to.deep.equal([]);
    });

    it('GET /chart-data rejects invalid groupBy values', async () => {
        const { status, body } = await requestJson(server, `${DASHBOARD_ROUTE}/chart-data?groupBy=ip`);

        expect(status).to.equal(400);
        expect(body.error).to.equal('Invalid groupBy parameter');
    });

    it('GET /chart-data returns grouped rows with unknown normalization and ascending time order query', async () => {
        let captured;
        database.query = async (sql, params) => {
            captured = { sql, params };
            return {
                rows: [
                    { time: '2026-03-01T00:00:00.000Z', group_value: 'Unknown', count: '2' },
                    { time: '2026-03-02T00:00:00.000Z', group_value: 'US', count: '1' }
                ]
            };
        };

        const { status, body } = await requestJson(
            server,
            `${DASHBOARD_ROUTE}/chart-data?timeRange=day&groupBy=country`
        );

        expect(status).to.equal(200);
        expect(captured.sql).to.include(`COALESCE(NULLIF(BTRIM(country), ''), 'Unknown')`);
        expect(captured.sql).to.include('ORDER BY time ASC');
        expect(captured.params).to.deep.equal(['day', '7 days']);

        expect(body.data).to.have.length(2);
        expect(body.data[0].country).to.equal('Unknown');
        expect(body.data[1].country).to.equal('US');
        expect(body.data[0].count).to.equal(2);
        expect(body.data[1].count).to.equal(1);
    });

    it('GET /chart-data returns stable empty payload shape and ignores lastId', async () => {
        let captured;
        database.query = async (sql, params) => {
            captured = { sql, params };
            return { rows: [] };
        };

        const { status, body } = await requestJson(
            server,
            `${DASHBOARD_ROUTE}/chart-data?lastId=42&timeRange=month&groupBy=city`
        );

        expect(status).to.equal(200);
        expect(captured.params).to.deep.equal(['month', '3 months']);
        expect(body.data).to.deep.equal([]);
        expect(body.lastId).to.equal(42);
        expect(body.activeFilter).to.equal(null);
    });

    it('protects dashboard UI and API when dashboardToken is configured', async () => {
        requestSRC.updateConfig({
            anonymize: false,
            dashboardRoute: DASHBOARD_ROUTE,
            retentionPeriod: 0,
            dashboardToken: 'secret-token'
        });

        database.query = async (sql) => {
            if (/COUNT\(\*\)/i.test(sql)) {
                return { rows: [{ count: '0' }] };
            }
            return { rows: [] };
        };

        const unauthUi = await requestJson(server, `${DASHBOARD_ROUTE}`);
        const unauthApi = await requestJson(server, `${DASHBOARD_ROUTE}/logs`);
        expect(unauthUi.status).to.equal(401);
        expect(unauthApi.status).to.equal(401);

        const port = server.address().port;
        const authUiResponse = await fetch(`http://127.0.0.1:${port}${DASHBOARD_ROUTE}?dashboardToken=secret-token`);
        const authApiResponse = await fetch(`http://127.0.0.1:${port}${DASHBOARD_ROUTE}/logs`, {
            headers: { 'x-dashboard-token': 'secret-token' }
        });
        const authConfigResponse = await fetch(`http://127.0.0.1:${port}${DASHBOARD_ROUTE}/config`, {
            headers: { 'x-dashboard-token': 'secret-token' }
        });
        const authConfig = await authConfigResponse.json();

        expect(authUiResponse.status).to.equal(200);
        expect(authApiResponse.status).to.equal(200);
        expect(authConfigResponse.status).to.equal(200);
        expect(authUiResponse.headers.get('set-cookie')).to.include('requestsrc_dashboard_token=');
        expect(authConfig).to.not.have.property('dashboardToken');
    });
});
