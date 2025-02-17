const express = require('express');
const axios = require('axios');
const maxmind = require('maxmind');
const path = require('path');
const config = require('../config/config');
const database = require('../config/database');
const fs = require('fs');

class RequestSRC {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/GeoLite2-City.mmdb');

        // ✅ Validate MaxMind DB existence
        if (!fs.existsSync(this.dbPath)) {
            console.error("⚠️ MaxMind database not found at:", this.dbPath);
        }

        // ✅ Load default configuration
        this.config = { ...config };

        this.router = express.Router();

        // ✅ Load MaxMind database for geolocation
        maxmind.open(this.dbPath)
            .then((lookup) => {
                this.geoLookup = lookup;
                console.log("✅ MaxMind GeoIP database loaded.");
            })
            .catch(err => console.error("Error loading MaxMind DB:", err));

        // ✅ Setup dashboard, logging, and API routes
        this.setupRoutes();
    }

    /**
     * ✅ Update configuration dynamically & reinitialize routes
     * @param {Object} newConfig - Key-value pairs of settings to update
     */
    updateConfig(newConfig) {
        for (const key in newConfig) {
            if (this.config.hasOwnProperty(key)) {
                this.config[key] = newConfig[key];
            } else {
                console.warn(`Invalid configuration key: ${key}`);
            }
        }


        // ✅ Reinitialize routes after config update
        this.setupRoutes();

        //Give user the url of dashboard
        const dashboardRoute = this.config.dashboardRoute || "/requestSRC";
        const serverHost = process.env.HOST || "http://127.0.0.1";
        const serverPort = process.env.PORT || 3000;
        console.log(`✅ Dashboard now available at: ${serverHost}:${serverPort}${dashboardRoute}`);
    }

    async getPublicIP() {
        try {
            const response = await axios.get('https://api.ipify.org?format=json');
            return response.data.ip;
        } catch (error) {
            console.error('❌ Error fetching public IP:', error.message);
            return 'Unknown';
        }
    }

    async add(req, reqType) {

        if (!reqType) {
            console.error("❌ ERROR: reqType is undefined! Defaulting to 'unknown'.");
            reqType = "unknown";
        }

        reqType = String(reqType);  // ✅ Ensure it's always a string

        let clientIP = req.headers['x-forwarded-for'] || req.ip;

        // 🛠 If the client IP is local, replace it with public IP
        if (clientIP === '::1' || clientIP.startsWith('::ffff:') || clientIP.startsWith('192.168.') || clientIP.startsWith('127.')) {
            clientIP = await this.getPublicIP();
        }

        // ✅ Anonymization check
        if (this.config.anonymize) {
            clientIP = clientIP.replace(/\.\d+$/, ".0");
        }

        // ✅ Get geolocation data
        let geoData = { country: 'Unknown', city: 'Unknown', region: 'Unknown' };
        if (this.geoLookup) {
            const geoInfo = this.geoLookup.get(clientIP);
            if (geoInfo) {
                geoData = {
                    country: geoInfo.country?.names?.en || 'Unknown',
                    city: geoInfo.city?.names?.en || 'Unknown',
                    region: geoInfo.subdivisions?.[0]?.names?.en || 'Unknown'
                };
            }
        }

        const timestamp = new Date().toISOString();

        // ✅ Store log entry in PostgreSQL
        try {
            await database.query(
                "INSERT INTO logs (timestamp, ip, city, region, country, user_agent, req_type) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                [timestamp, clientIP, geoData.city, geoData.region, geoData.country, req.headers['user-agent'] || "Unknown", reqType]
            );
        } catch (error) {
            console.error("❌ ERROR inserting log:", error);
        }
    }


    async log(req, reqType) {
        let clientIP = req.headers['x-forwarded-for'] || req.ip;

        // 🛠 If the client IP is local, replace it with public IP
        if (clientIP === '::1' || clientIP.startsWith('::ffff:') || clientIP.startsWith('192.168.') || clientIP.startsWith('127.')) {
            clientIP = await this.getPublicIP();
        }

        // ✅ Anonymization check
        if (this.config.anonymize) {
            clientIP = clientIP.replace(/\.\d+$/, ".0");
        }

        // ✅ Get geolocation data
        let geoData = { country: 'Unknown', city: 'Unknown', region: 'Unknown' };
        if (this.geoLookup) {
            const geoInfo = this.geoLookup.get(clientIP);
            if (geoInfo) {
                geoData = {
                    country: geoInfo.country?.names?.en || 'Unknown',
                    city: geoInfo.city?.names?.en || 'Unknown',
                    region: geoInfo.subdivisions?.[0]?.names?.en || 'Unknown'
                };
            }
        }

        const timestamp = new Date().toISOString();

        return {
            ip: clientIP,
            user_agent: req.headers['user-agent'] || "Unknown",
            timestamp: timestamp,
            geo: geoData,
            reqType: reqType
        };
    }



    /**
  * ✅ Setup Dashboard, Logging, and API Routes (Supports Dynamic Routes)
  */
    setupRoutes() {
        const dashboardRoute = this.config.dashboardRoute || "/requestSRC";

        // ✅ Remove previously assigned routes to avoid duplication
        this.router.stack = [];

        // ✅ Serve static files (CSS, JS)
        this.router.use(express.static(path.join(__dirname, "../public")));

        // ✅ Serve dashboard UI from public/
        this.router.get(dashboardRoute, (req, res) => {
            res.sendFile(path.join(__dirname, "../public/requestSRCdashboard.html"));
        });

 // ✅ API to Get Logs with Pagination & Sorting
this.router.get(`${this.config.dashboardRoute}/logs`, async (req, res) => {
    const { page = 1, limit = 50, sortOrder = "DESC" } = req.query;

    const offset = (page - 1) * limit;

    try {
        const logsQuery = `
            SELECT * FROM logs 
            ORDER BY timestamp ${sortOrder}
            LIMIT $1 OFFSET $2;
        `;
        const countQuery = `SELECT COUNT(*) FROM logs;`;

        const logsResult = await database.query(logsQuery, [limit, offset]);
        const countResult = await database.query(countQuery);

        res.json({
            totalLogs: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit),
            data: logsResult.rows
        });
    } catch (error) {
        console.error("❌ Error fetching logs from database:", error);
        res.status(500).json({ error: "Failed to retrieve logs" });
    }
});

const activeFilters = {}; // Store filters per client (keyed by client IP)

this.router.get(`${this.config.dashboardRoute}/chart-data`, async (req, res) => {
    let { lastId = "0", timeRange = "hour", groupBy = "req_type", filterValue } = req.query;

    lastId = parseInt(lastId, 10); 

    // Get client identifier (to persist filters)
    const clientId = req.ip || "global";

    // Store active filter for this client
    if (filterValue) {
        activeFilters[clientId] = filterValue;
    }

    // Apply stored filter if incremental update
    const activeFilter = activeFilters[clientId] || null;

    // ✅ Move time filtering inside SQL, not as a parameter
    let timeInterval;
    if (timeRange === "hour") timeInterval = "NOW() - INTERVAL '24 hours'";
    else if (timeRange === "day") timeInterval = "NOW() - INTERVAL '7 days'";
    else if (timeRange === "week") timeInterval = "NOW() - INTERVAL '1 month'";
    else if (timeRange === "month") timeInterval = "NOW() - INTERVAL '3 months'";
    else if (timeRange === "quarter") timeInterval = "NOW() - INTERVAL '6 months'";
    else timeInterval = "NOW() - INTERVAL '24 hours'"; // Default 24 hours

    try {
        let params = []; // ✅ No need to pass timeInterval as a parameter
        let query = `
            SELECT id, DATE_TRUNC('${timeRange}', timestamp) AS time, ${groupBy}, COUNT(*) AS count
            FROM logs
            WHERE timestamp >= ${timeInterval} 
        `;

        // ✅ Only add lastId condition if lastId > 0
        if (lastId > 0) {
            query += ` AND id > $1::BIGINT`;
            params.push(lastId);
        }

        // ✅ Apply filter dynamically
        if (activeFilter) {
            query += ` AND ${groupBy} = $${params.length + 1}`;
            params.push(activeFilter);
        }

        query += `
            GROUP BY time, ${groupBy}, id
            ORDER BY id ASC
            LIMIT 1000;
        `;

        const result = await database.query(query, params.length > 0 ? params : undefined);
        res.json(result.rows);
    } catch (error) {
        console.error("❌ Error fetching chart data:", error);
        res.status(500).json({ error: "Failed to retrieve chart data" });
    }
});



        // ✅ API route to fetch the current config
        this.router.get(`${dashboardRoute}/config`, (req, res) => {
            res.json(this.config);
        });

        // ✅ API route to update settings dynamically
        this.router.post(`${dashboardRoute}/update-config`, (req, res) => {
            try {
                this.updateConfig(req.body);
                res.json({ message: "Configuration updated", config: this.config });
            } catch (error) {
                console.error("❌ Error updating config:", error);
                res.status(500).json({ error: "Failed to update configuration" });
            }
        });
    }

}

module.exports = new RequestSRC();
