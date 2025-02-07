# RequestSRC - STILL UNDER DEVELOPMENT

## Overview

**RequestSRC** is a lightweight, server-side middleware designed for **real-time monitoring** of HTTP requests in Express applications. It automatically logs metadata, enriches request data, and provides an admin dashboard for analysis.

## Features

✔️ **Automatic Request Logging**: Captures IP address, geolocation, user agent, and timestamps.  
✔️ **Built-in Admin Dashboard**: View and filter traffic logs at `/requestSRC`.  
✔️ **Database Support**: Stores logs in **PostgreSQL** or **MySQL**.  
✔️ **Privacy-Friendly**: IP anonymization available for compliance with **GDPR**/**CCPA**.  
✔️ **Customizable**: Configure retention period, dashboard route, and logging format.  

---

## Installation

Install **RequestSRC** via npm:

```sh
npm install request-src
```

---

## Usage

### Basic Setup

Integrate **RequestSRC** into an Express app:

```javascript
const express = require("express");
const RequestSRC = require("request-src");

const app = express();

// Initialize middleware
const requestSRC = new RequestSRC({
    databaseConfig: {
        user: "your_user",
        host: "localhost",
        database: "your_database",
        password: "your_password",
        port: 5432,
    },
    anonymize: true,  // Enable IP anonymization
    dashboardRoute: "/requestSRC",  // Set admin dashboard route
    retentionPeriod: 60,  // Retain logs for 60 days
    enableFilters: true,  // Enable filters (date, region)
    logFormat: "detailed",
});

// Middleware to log requests
app.use((req, res, next) => {
    requestSRC.add(req, "default_request");
    next();
});

// Mount the dashboard route
app.use(requestSRC.router);

app.get("/", (req, res) => res.send("Hello World"));

app.listen(3000, () => console.log("Server running on port 3000"));
```

---

## API Methods

### `requestSRC.add(req, reqType)`

📌 **Logs request metadata into the database.**  
- Extracts **IP**, **user-agent**, **timestamp**, and **geolocation**.  
- Stores the request in the SQL database.  
- **Example Usage:**
```javascript
app.post("/register", (req, res) => {
    requestSRC.add(req, "user_creation"); // Logs as 'user_creation'
    res.send("User registration processed");
});
```

---

### `requestLOG(req, reqType)`

📌 **Extracts request metadata without storing it.**  
- Returns an object with request details for debugging.  
- **Example Usage:**
```javascript
app.get("/debug", (req, res) => {
    const logDetails = requestLOG(req, "debug_mode");
    console.log(logDetails);
    res.json(logDetails);
});
```
- **Example Output:**
```json
{
    "ip": "192.168.1.100",
    "anonymized_ip": "192.168.1.0",
    "user_agent": "Mozilla/5.0",
    "timestamp": "2025-01-27T12:34:56Z",
    "geo": { "country": "US", "city": "San Francisco", "region": "California" },
    "reqType": "debug_mode"
}
```

---

## Configuration Options

When initializing `RequestSRC`, you can configure:

| Option          | Type     | Description |
|----------------|---------|-------------|
| `databaseConfig` | Object | Database credentials for PostgreSQL/MySQL |
| `anonymize`     | Boolean | Masks last octet of IP (default: `false`) |
| `dashboardRoute` | String  | URL path for admin dashboard (default: `/requestSRC`) |
| `retentionPeriod` | Number  | Auto-delete logs older than X days (`0` = disable) |
| `enableFilters`  | Boolean | Enables filtering logs by date, region, or request type |
| `logFormat`     | String  | Options: `'detailed'` (default), `'basic'` |

---

## Accessing the Dashboard

Once installed, the **traffic monitoring dashboard** is available at:

```
http://your-domain/requestSRC
```

---

## License

MIT License © 2025 Xavier Pimentel

---

## Contributing

Feel free to submit **issues**, **feature requests**, or **pull requests** on GitHub.

🔗 **GitHub Repository:** [https://github.com/XavierPim/requestSRC](https://github.com/XavierPim/requestSRC)

