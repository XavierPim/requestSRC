const express = require('express');
const database = require('../config/database');
const requestSRC = require('../middleware/requestSRC'); 
const router = express.Router();

// ✅ Ensure requestSRC is fully initialized before reading config
const dashboardRoute = requestSRC.config.dashboardRoute || "/requestSRC";

// ✅ Serve static files (CSS, JS, Images)
router.use("/public", express.static("public"));

// ✅ Serve dashboard UI dynamically
router.get(dashboardRoute, (req, res) => {
    res.sendFile(__dirname + "/../views/index.html");
});

// ✅ API route to fetch logs from PostgreSQL (with SQL injection protection)
router.get(`${dashboardRoute}/logs`, async (req, res) => {
    try {
        const result = await database.query("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100");
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Database error:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// ✅ API route to fetch the current config
router.get(`${dashboardRoute}/config`, (req, res) => {
    res.json(requestSRC.config);
});

// ✅ API route to update settings dynamically
router.post(`${dashboardRoute}/update-config`, (req, res) => {
    try {
        requestSRC.updateConfig(req.body);
        res.json({ message: "Configuration updated", config: requestSRC.config });
    } catch (error) {
        console.error("❌ Error updating config:", error);
        res.status(500).json({ error: "Failed to update configuration" });
    }
});

module.exports = router;
