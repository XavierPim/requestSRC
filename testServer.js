const express = require('express');
const requestSRC = require('./middleware/requestSRC'); // Import middleware

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

// Example route using requestSRC.add()
app.get('/', (req, res) => {
    requestSRC.add(req, 'default_request'); // Log the request
    res.send('Test server is running with RequestSRC!');
});


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
    const url = `http://${HOST}:${PORT}/`;
    console.log(`Server running at ${url}`);
});
