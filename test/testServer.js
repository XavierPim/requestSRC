const express = require('express');
const requestSRC = require('../lib/requestSRC');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

app.use(express.json()); // Middleware for JSON handling

//includes all logging & dashboard routes
app.use(requestSRC.router);

// ✅ Update RequestSRC configuration dynamically
requestSRC.updateConfig({
    anonymize: false, // Enable anonymization
    dashboardRoute: "/customUserDefinedRoute", // Custom dashboard route
    retentionPeriod: 30, // Keep logs for 30 days
});

// Example route using requestSRC.add()
app.get('/', (req, res) => {
    requestSRC.add(req, 'loginPage'); // Log the request and add to database
    
    //normal logic below
    res.send('Test add log');
});

// Example route using requestSRC.log()
app.get('/log', async (req, res) => {
    try {
        const log = await requestSRC.log(req, 'logged no db'); 
        res.json(log); // Send as JSON response
    } catch (error) {
        console.error("Error logging request:", error);
        res.status(500).json({ error: "Failed to log request" });
    }
});

app.listen(PORT, () => {
    console.log(`Server online`);
});
