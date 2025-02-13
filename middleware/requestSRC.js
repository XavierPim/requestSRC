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
                console.warn(`⚠️ Invalid configuration key: ${key}`);
            }
        }

        console.log("✅ Updated RequestSRC Config:", this.config);

        // ✅ Reinitialize routes after config update
        this.setupRoutes();
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
            reqType = "unknown";  // Prevent undefined values from breaking the database query
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
            console.log('⚠️ Detected local IP. Fetching public IP instead...');
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
            user_agent: this.config.logUserAgent ? req.headers['user-agent'] : 'Hidden',
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

        // ✅ API to Get Logs (for displaying in the dashboard)
        this.router.get(`${this.config.dashboardRoute}/logs`, async (req, res) => {
            try {
                const result = await database.query("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100"); // Adjust LIMIT as needed
                res.json(result.rows);
            } catch (error) {
                console.error("❌ Error fetching logs from database:", error);
                res.status(500).json({ error: "Failed to retrieve logs" });
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

        console.log(`✅ Dashboard now available at: http://localhost:3000${dashboardRoute}`);
    }

}

module.exports = new RequestSRC();
