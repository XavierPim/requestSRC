const axios = require('axios');
const maxmind = require('maxmind');
const path = require('path');
const express = require('express');
const config = require('../config/config'); 
const fs = require('fs');

class RequestSRC {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/GeoLite2-City.mmdb');

        // Validate MaxMind DB existence
        if (!fs.existsSync(this.dbPath)) {
            console.error("⚠️ MaxMind database not found at:", this.dbPath);
        }

        // Load default configuration
        this.config = { ...config };

        this.router = express.Router(); // Middleware router

        // Load MaxMind database for geolocation
        maxmind.open(this.dbPath)
            .then((lookup) => {
                this.geoLookup = lookup;
                console.log("✅ MaxMind GeoIP database loaded.");
            })
            .catch(err => console.error("Error loading MaxMind DB:", err));

        // ✅ API Route to Modify Configuration (Used by Dashboard)
        this.router.post('/api/dashboard/options', (req, res) => {
            try {
                this.updateConfig(req.body);
                res.json({ message: "Configuration updated", config: this.config });
            } catch (error) {
                res.status(500).json({ error: "Failed to update configuration" });
            }
        });

        // ✅ API Route to Get Current Config
        this.router.get('/api/config', (req, res) => {
            res.json(this.config);
        });
    }

    /**
     * ✅ Update configuration dynamically.
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

        console.log(`📌 Request logged: 
            Client IP=${clientIP}, 
            Type=${reqType}, 
            Location=${geoData.city}, ${geoData.region}, ${geoData.country}, 
            User-Agent=${this.config.logUserAgent ? req.headers['user-agent'] : 'Hidden'}
            Timestamp=${timestamp}`
        );
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
}

module.exports = new RequestSRC();
