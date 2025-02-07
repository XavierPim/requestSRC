const express = require('express');
const RequestSRC = require('request-src');

const app = express();

// Initialize RequestSRC middleware
const requestSRC = new RequestSRC({
    databaseConfig: {
        user: 'your_user',
        host: 'localhost',
        database: 'your_database',
        password: 'your_password',
        port: 5432,
    },
    anonymize: true,  // Enable IP anonymization
    dashboardRoute: '/requestSRC',  // Set the dashboard route
    retentionPeriod: 60,  // Retain logs for 60 days
    enableFilters: true,  // Enable filters (ex. date, region)
    logFormat: 'detailed',
});

app.use((req, res, next) => {
    requestSRC.add(req, "default_request");
    next();
});

app.use(requestSRC.router);

app.get('/', (req, res) => res.send('Hello World'));

app.listen(3000, () => console.log('Server running on port 3000'));
