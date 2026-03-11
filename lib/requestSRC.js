const express = require('express');
const axios = require('axios');
const maxmind = require('maxmind');
const path = require('path');
const config = require('./config');
const database = require('./database');
const fs = require('fs');

class RequestSRC {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/GeoLite2-City.mmdb');

        if (!fs.existsSync(this.dbPath)) {
            console.error('MaxMind database not found at:', this.dbPath);
        }

        this.config = { ...config };
        this.router = express.Router();
        this.retentionTimer = null;
        this.retentionIntervalMs = 60 * 60 * 1000;

        maxmind.open(this.dbPath)
            .then((lookup) => {
                this.geoLookup = lookup;
                console.log('MaxMind GeoIP database loaded.');
            })
            .catch((err) => console.error('Error loading MaxMind DB:', err));

        this.setupRoutes();
        this.setupRetentionCleanupWorker();
        this.warnIfDashboardUnprotected();
    }

    updateConfig(newConfig) {
        for (const key in newConfig) {
            if (Object.prototype.hasOwnProperty.call(this.config, key)) {
                this.config[key] = newConfig[key];
            } else {
                console.warn(`Invalid configuration key: ${key}`);
            }
        }

        this.setupRoutes();
        this.setupRetentionCleanupWorker();
        this.warnIfDashboardUnprotected();

        const dashboardRoute = this.config.dashboardRoute || '/requestSRC';
        const serverHost = process.env.HOST || 'http://localhost';
        const serverPort = process.env.PORT || 3000;
        console.log(`Dashboard now available at: ${serverHost}:${serverPort}${dashboardRoute}`);
    }

    warnIfDashboardUnprotected() {
        if (this.config.dashboardToken) {
            return;
        }

        const dashboardRoute = this.config.dashboardRoute || '/requestSRC';
        console.warn(
            `RequestSRC dashboard at ${dashboardRoute} is running without a dashboardToken. `
            + 'Use local/internal networks only.'
        );
    }

    getSafeConfigForClient() {
        return {
            anonymize: Boolean(this.config.anonymize),
            dashboardRoute: this.config.dashboardRoute,
            retentionPeriod: Number(this.config.retentionPeriod) || 0,
            resolveLocalIpWithPublicLookup: Boolean(this.config.resolveLocalIpWithPublicLookup)
        };
    }

    getDashboardTokenFromRequest(req) {
        const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
        if (authHeader.startsWith('Bearer ')) {
            return authHeader.slice('Bearer '.length).trim();
        }

        const headerToken = req.headers['x-dashboard-token'];
        if (typeof headerToken === 'string' && headerToken.trim()) {
            return headerToken.trim();
        }

        const queryToken = req.query?.dashboardToken;
        if (typeof queryToken === 'string' && queryToken.trim()) {
            return queryToken.trim();
        }

        const cookieHeader = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
        if (cookieHeader) {
            const cookieToken = cookieHeader
                .split(';')
                .map((part) => part.trim())
                .find((part) => part.startsWith('requestsrc_dashboard_token='));

            if (cookieToken) {
                const rawToken = cookieToken.split('=')[1] || '';
                if (rawToken) {
                    return decodeURIComponent(rawToken);
                }
            }
        }

        return '';
    }

    requireDashboardToken(req, res, next) {
        const configuredToken = typeof this.config.dashboardToken === 'string'
            ? this.config.dashboardToken.trim()
            : '';

        if (!configuredToken) {
            next();
            return;
        }

        const requestToken = this.getDashboardTokenFromRequest(req);
        if (requestToken === configuredToken) {
            if (typeof req.query?.dashboardToken === 'string' && req.query.dashboardToken === configuredToken) {
                const dashboardPath = this.config.dashboardRoute || '/requestSRC';
                res.setHeader(
                    'Set-Cookie',
                    `requestsrc_dashboard_token=${encodeURIComponent(configuredToken)}; Path=${dashboardPath}; HttpOnly; SameSite=Lax`
                );
            }
            next();
            return;
        }

        res.status(401).json({ error: 'Unauthorized dashboard access' });
    }

    setupRetentionCleanupWorker() {
        if (this.retentionTimer) {
            clearInterval(this.retentionTimer);
            this.retentionTimer = null;
        }

        const retentionPeriod = Number(this.config.retentionPeriod);
        if (!Number.isFinite(retentionPeriod) || retentionPeriod <= 0) {
            return;
        }

        this.runRetentionCleanup().catch((error) => {
            console.error('Error running retention cleanup:', error);
        });

        this.retentionTimer = setInterval(() => {
            this.runRetentionCleanup().catch((error) => {
                console.error('Error running retention cleanup:', error);
            });
        }, this.retentionIntervalMs);

        if (typeof this.retentionTimer.unref === 'function') {
            this.retentionTimer.unref();
        }
    }

    async runRetentionCleanup() {
        const retentionPeriod = Number(this.config.retentionPeriod);
        if (!Number.isFinite(retentionPeriod) || retentionPeriod <= 0) {
            return { skipped: true, rowCount: 0 };
        }

        const result = await database.query(
            "DELETE FROM logs WHERE timestamp < NOW() - ($1::int * INTERVAL '1 day');",
            [Math.floor(retentionPeriod)]
        );

        return {
            skipped: false,
            rowCount: Number(result?.rowCount || 0)
        };
    }

    async getPublicIP() {
        try {
            const response = await axios.get('https://api.ipify.org?format=json');
            return response.data.ip;
        } catch (error) {
            console.error('Error fetching public IP:', error.message);
            return 'Unknown';
        }
    }

    extractClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];

        if (typeof forwarded === 'string' && forwarded.trim()) {
            return forwarded.split(',')[0].trim();
        }

        if (Array.isArray(forwarded) && forwarded.length > 0 && typeof forwarded[0] === 'string') {
            return forwarded[0].split(',')[0].trim();
        }

        return typeof req.ip === 'string' ? req.ip.trim() : 'Unknown';
    }

    normalizeIp(rawIp) {
        if (typeof rawIp !== 'string') {
            return 'Unknown';
        }

        let ip = rawIp.trim();
        if (!ip) {
            return 'Unknown';
        }

        // Strip IPv6 zone index suffix (e.g. fe80::1%lo0)
        ip = ip.split('%')[0];

        const mappedV4Match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
        if (mappedV4Match) {
            return mappedV4Match[1];
        }

        // Strip :port from plain IPv4 values like 1.2.3.4:5678
        const ipv4WithPortMatch = ip.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
        if (ipv4WithPortMatch) {
            return ipv4WithPortMatch[1];
        }

        return ip;
    }

    isLocalOrPrivateIp(ip) {
        if (typeof ip !== 'string' || !ip.trim() || ip === 'Unknown') {
            return false;
        }

        const normalized = this.normalizeIp(ip).toLowerCase();

        if (normalized === '::1') return true;

        if (/^127\./.test(normalized)) return true;
        if (/^10\./.test(normalized)) return true;
        if (/^192\.168\./.test(normalized)) return true;
        if (/^169\.254\./.test(normalized)) return true;

        const match172 = normalized.match(/^172\.(\d{1,3})\./);
        if (match172) {
            const secondOctet = Number.parseInt(match172[1], 10);
            if (secondOctet >= 16 && secondOctet <= 31) {
                return true;
            }
        }

        const match100 = normalized.match(/^100\.(\d{1,3})\./);
        if (match100) {
            const secondOctet = Number.parseInt(match100[1], 10);
            if (secondOctet >= 64 && secondOctet <= 127) {
                return true;
            }
        }

        if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
        if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;

        return false;
    }

    anonymizeIp(ip) {
        if (!this.config.anonymize || typeof ip !== 'string') {
            return ip;
        }

        if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
            return ip.replace(/\.\d+$/, '.0');
        }

        return ip;
    }

    async resolveClientIp(req) {
        let clientIP = this.normalizeIp(this.extractClientIp(req));

        if (
            this.isLocalOrPrivateIp(clientIP)
            && Boolean(this.config.resolveLocalIpWithPublicLookup)
        ) {
            const publicIp = this.normalizeIp(await this.getPublicIP());
            if (publicIp && publicIp !== 'Unknown') {
                clientIP = publicIp;
            }
        }

        return this.anonymizeIp(clientIP);
    }

    lookupGeoForIp(clientIP) {
        let geoData = { country: 'Unknown', city: 'Unknown', region: 'Unknown' };

        if (!this.geoLookup || !clientIP || clientIP === 'Unknown') {
            return geoData;
        }

        const geoInfo = this.geoLookup.get(clientIP);
        if (!geoInfo) {
            return geoData;
        }

        geoData = {
            country: geoInfo.country?.names?.en || 'Unknown',
            city: geoInfo.city?.names?.en || 'Unknown',
            region: geoInfo.subdivisions?.[0]?.names?.en || 'Unknown'
        };

        return geoData;
    }

    async add(req, reqType) {
        if (!reqType) {
            console.error("ERROR: reqType is undefined. Defaulting to 'unknown'.");
            reqType = 'unknown';
        }

        const clientIP = await this.resolveClientIp(req);
        const geoData = this.lookupGeoForIp(clientIP);
        const timestamp = new Date().toISOString();

        try {
            await database.query(
                'INSERT INTO logs (timestamp, ip, city, region, country, user_agent, req_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [timestamp, clientIP, geoData.city, geoData.region, geoData.country, req.headers['user-agent'] || 'Unknown', String(reqType)]
            );
        } catch (error) {
            console.error('ERROR inserting log:', error);
        }
    }

    async log(req, reqType) {
        const clientIP = await this.resolveClientIp(req);
        const geoData = this.lookupGeoForIp(clientIP);
        const timestamp = new Date().toISOString();

        return {
            ip: clientIP,
            user_agent: req.headers['user-agent'] || 'Unknown',
            timestamp,
            geo: geoData,
            reqType
        };
    }

    setupRoutes() {
        const dashboardRoute = this.config.dashboardRoute || '/requestSRC';
        const publicDir = path.join(__dirname, '../public');

        this.router.stack = [];

        this.router.use(
            dashboardRoute,
            (req, res, next) => this.requireDashboardToken(req, res, next),
            express.static(publicDir, { index: false })
        );

        this.router.get(
            dashboardRoute,
            (req, res, next) => this.requireDashboardToken(req, res, next),
            (req, res) => {
                res.sendFile(path.join(publicDir, 'requestSRCdashboard.html'));
            }
        );

        this.router.get(
            `${dashboardRoute}/logs`,
            (req, res, next) => this.requireDashboardToken(req, res, next),
            async (req, res) => {
                const sortableFields = [
                    'timestamp',
                    'ip',
                    'city',
                    'region',
                    'country',
                    'user_agent',
                    'req_type'
                ];

                let page = Number.parseInt(req.query.page, 10);
                if (!Number.isInteger(page) || page < 1) {
                    page = 1;
                }

                let limit = Number.parseInt(req.query.limit, 10);
                if (!Number.isInteger(limit)) {
                    limit = 50;
                }
                limit = Math.min(Math.max(limit, 1), 200);

                let sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : '';
                if (!sortBy && req.query.sortColumn !== undefined) {
                    const sortIndex = Number.parseInt(req.query.sortColumn, 10);
                    if (Number.isInteger(sortIndex) && sortIndex >= 0 && sortIndex < sortableFields.length) {
                        sortBy = sortableFields[sortIndex];
                    }
                }
                if (!sortableFields.includes(sortBy)) {
                    sortBy = 'timestamp';
                }

                let sortOrder = String(req.query.sortOrder || 'DESC').toUpperCase();
                sortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

                try {
                    const countResult = await database.query('SELECT COUNT(*) AS count FROM logs;');
                    const totalLogs = Number.parseInt(countResult.rows[0]?.count, 10) || 0;
                    const totalPages = Math.max(1, Math.ceil(totalLogs / limit));
                    const safePage = Math.min(page, totalPages);
                    const offset = (safePage - 1) * limit;

                    const logsQuery = `
                        SELECT * FROM logs
                        ORDER BY ${sortBy} ${sortOrder}, id ${sortOrder}
                        LIMIT $1 OFFSET $2;
                    `;
                    const logsResult = await database.query(logsQuery, [limit, offset]);

                    res.json({
                        totalLogs,
                        page: safePage,
                        limit,
                        totalPages,
                        hasPrevPage: safePage > 1,
                        hasNextPage: safePage < totalPages,
                        data: logsResult.rows
                    });
                } catch (error) {
                    console.error('Error fetching logs from database:', error);
                    res.status(500).json({ error: 'Failed to retrieve logs' });
                }
            }
        );

        this.router.get(
            `${dashboardRoute}/chart-data`,
            (req, res, next) => this.requireDashboardToken(req, res, next),
            async (req, res) => {
                let { lastId = '0', timeRange = 'hour', groupBy = 'req_type', filterValue } = req.query;

                lastId = Number.parseInt(lastId, 10);
                if (!Number.isInteger(lastId)) {
                    lastId = 0;
                }

                const validGroupByFields = ['req_type', 'city', 'region', 'country'];
                if (!validGroupByFields.includes(groupBy)) {
                    return res.status(400).json({ error: 'Invalid groupBy parameter' });
                }

                const timeRangeMap = {
                    hour: { interval: '24 hours', bucket: 'hour' },
                    day: { interval: '7 days', bucket: 'day' },
                    week: { interval: '1 month', bucket: 'week' },
                    month: { interval: '3 months', bucket: 'month' },
                    quarter: { interval: '6 months', bucket: 'month' }
                };
                const rangeConfig = timeRangeMap[timeRange] || timeRangeMap.hour;

                try {
                    const normalizedGroupExpr = `COALESCE(NULLIF(BTRIM(${groupBy}), ''), 'Unknown')`;
                    const params = [rangeConfig.bucket, rangeConfig.interval];
                    let filterClause = '';

                    if (typeof filterValue === 'string' && filterValue.trim() !== '') {
                        params.push(filterValue.trim());
                        filterClause = `AND ${normalizedGroupExpr} = $3`;
                    }

                    const query = `
                        SELECT
                            DATE_TRUNC($1::text, timestamp) AS time,
                            ${normalizedGroupExpr} AS group_value,
                            COUNT(*)::integer AS count
                        FROM logs
                        WHERE timestamp >= NOW() - $2::interval
                        ${filterClause}
                        GROUP BY time, group_value
                        ORDER BY time ASC, group_value ASC
                        LIMIT 1000;
                    `;

                    const result = await database.query(query, params);
                    const data = result.rows.map((row) => ({
                        time: row.time,
                        [groupBy]: row.group_value || 'Unknown',
                        count: Number.parseInt(row.count, 10) || 0
                    }));

                    res.json({
                        data,
                        lastId,
                        activeFilter: typeof filterValue === 'string' ? filterValue.trim() || null : null
                    });
                } catch (error) {
                    console.error('Error fetching chart data:', error);
                    res.status(500).json({ error: 'Failed to retrieve chart data' });
                }
            }
        );

        this.router.get(
            `${dashboardRoute}/config`,
            (req, res, next) => this.requireDashboardToken(req, res, next),
            (req, res) => {
                res.json(this.getSafeConfigForClient());
            }
        );

        this.router.post(
            `${dashboardRoute}/update-config`,
            (req, res, next) => this.requireDashboardToken(req, res, next),
            (req, res) => {
                try {
                    this.updateConfig(req.body);
                    res.json({ message: 'Configuration updated', config: this.getSafeConfigForClient() });
                } catch (error) {
                    console.error('Error updating config:', error);
                    res.status(500).json({ error: 'Failed to update configuration' });
                }
            }
        );
    }
}

module.exports = new RequestSRC();
