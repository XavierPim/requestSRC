const express = require('express');
const requestSRC = require('./middleware/requestSRC'); // Import middleware

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

// Example route using requestSRC.add()
app.get('/', (req, res) => {
    requestSRC.add(req, 'get request'); // Log the request
    res.send('Test server is running with RequestSRC!');
});

app.listen(PORT, () => {
    const url = `http://${HOST}:${PORT}/`;
    console.log(`Server running at ${url}`);
});
