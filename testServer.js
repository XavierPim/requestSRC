const express = require('express');
const requestSRC = require('./middleware/requestSRC');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

app.use(express.json()); // Middleware for JSON handling

//includes all logging & dashboard routes
app.use(requestSRC.router);

// ✅ Update RequestSRC configuration dynamically
requestSRC.updateConfig({
    anonymize: true, // Enable anonymization
    dashboardRoute: "/custom", // Custom dashboard route
    retentionPeriod: 30, // Keep logs for 30 days
});


// Example route using requestSRC.add()
app.get('/', (req, res) => {
    requestSRC.add(req, 'login'); // Log the request and add to database
    
    //normal code
    res.send('Test server is running with RequestSRC!');
});

// Example route using requestSRC.add()
app.get('/other', (req, res) => {
    requestSRC.add(req, 'youKnow'); // Log the request and add to database
    
    //normal code
    res.send();
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
