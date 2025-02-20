
# RequestSRC - STILL UNDER DEVELOPMENT

## Overview

**RequestSRC** is a lightweight, server-side middleware for **real-time monitoring** of HTTP requests in Express applications. It acts as a middleware that attaches location data to requests, logs them into a **local SQL database**, and provides a **dashboard** displaying a sortable table and a filterable graph.

- Minimal latency (**~5 seconds**) between request logging and dashboard update.
- All server-side logic, including database operations and dashboard rendering, is handled on the server for optimal performance.
- Built-in support for **GeoIP MaxMind City Database** (bundled with the **Feb 2025** version) for geolocation enrichment.

## Features

✔️ **Automatic Request Logging**: Captures IP address, geolocation, user agent, timestamp, and custom request type.  
✔️ **Built-in Admin Dashboard**: Sortable table and filterable graph to analyze logs.  
✔️ **Database Support**: Stores logs in **PostgreSQL** or **MySQL**.  
✔️ **Privacy-Friendly**: IP anonymization available for **GDPR**/**CCPA** compliance.  
✔️ **Customizable**:  
- Anonymization options,  
- Dashboard route,  
- Log retention period,  
- Data refresh rate (WIP),  
- Data expiration (WIP).

✔️ **Graph Filtering**:  
- Filter graph data by IP, city, region, country, or request type.  
- Visual differentiation of request types via color-coded lines matching the log entries.  

✔️ **Advanced User-Agent Detection**:  
- Identifies whether requests are local, public, or through port forwarding.  
- Highlights anomalies or suspicious access patterns.

✔️ **Log Customization**:  
- Anonymize logs,  
- Color-coded request types for easy identification.

✔️ **Plug-and-Play Setup**:  
- After PostgreSQL installation and setup, the integration is seamless.

---

## Installation

Install **RequestSRC** via npm:

```sh
npm install request-src
```

---

## Usage

### Basic Setup

Integrate **RequestSRC** into your Express app:

```javascript
const express = require("express");
const RequestSRC = require("request-src");

const app = express();

// ✅ Update RequestSRC configuration dynamically
RequestSRC.updateConfig({
    anonymize: false, // Enable anonymization
    dashboardRoute: "/custom", // Custom dashboard route
    retentionPeriod: 30, // Keep logs for 30 days
});

// Use the middleware
app.use(RequestSRC.router);

app.get("/", (req, res) => {
    RequestSRC.add(req, "test-request");
    res.send("Hello World with RequestSRC!");
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

### Logging Requests

**Add a log to your initialized database:**

```javascript
app.post("/login", (req, res) => {
    RequestSRC.add(req, "user_login"); // Logs as 'user_login'
    res.send("User logged in");
});
```

**Log without saving to the database:**

```javascript
app.get("/log", async (req, res) => {
    const log = await RequestSRC.log(req, "temp_log");
    res.json(log); // Returns log data without saving
});
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

### `requestSRC.log(req, reqType)`

📌 **Extracts request metadata without storing it.**  
- Returns an object with request details for debugging.  
- **Example Usage:**
```javascript
app.get("/debug", (req, res) => {
    try {
        const log = await RequestSRC.log(req, 'debug log');
        res.json(log); // Returns log data as JSON without saving to DB
    } catch (error) {
        console.error("Error logging request:", error);
        res.status(500).json({ error: "Failed to log request" });
    }
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
    "reqType": "debug log"
}
```

---

## Configuration Options

When initializing `RequestSRC`, you can configure:

| Option            | Type     | Description                                               |
|-------------------|----------|-----------------------------------------------------------|
| `anonymize`       | Boolean  | Masks last octet of IP (default: `false`).                |
| `dashboardRoute`  | String   | URL path for admin dashboard (default: `/requestSRC`).    |
| `retentionPeriod` | Number   | Auto-delete logs older than X days (`0` = disable).       |

---

## Accessing the Dashboard

Once installed, the **traffic monitoring dashboard** is available at:

```
http://your-domain/requestSRC
```

It provides:
- A sortable table view for traffic logs.  
- A graph view to visualize request patterns over time, with color-coded request types.

---


---

### Using RequestSRC Without a Database

If you want to log request data without saving it to a database, you can use the `.log()` method. This method extracts request metadata (IP, user-agent, geolocation, etc.) and returns it as a JSON object without storing it.

**Example Usage:**

```javascript
app.get('/log', async (req, res) => {
    try {
        const log = await RequestSRC.log(req, 'temporary_log');
        res.json(log); // Returns log data as JSON without saving to DB
    } catch (error) {
        console.error("Error logging request:", error);
        res.status(500).json({ error: "Failed to log request" });
    }
});
```

**Example Output:**

```json
{
    "ip": "192.168.1.100",
    "anonymized_ip": "192.168.1.0",
    "user_agent": "Mozilla/5.0",
    "timestamp": "2025-01-27T12:34:56Z",
    "geo": { "country": "US", "city": "San Francisco", "region": "California" },
    "reqType": "temporary_log"
}
```

This is useful for **debugging** or **temporary monitoring** without writing to the database.

---

### Setting Up PostgreSQL

To fully utilize **RequestSRC** with persistent log storage, you'll need to install and configure **PostgreSQL**.

1. **Install PostgreSQL:**  
   Follow the official guide to install PostgreSQL based on your operating system:  
   👉 [PostgreSQL Download](https://www.postgresql.org/download/)

2. **Create a Database:**  
   After installation, create a new database for logging:

   ```bash
   psql -U postgres
   CREATE DATABASE requestsrc;
   \c requestsrc
   ```

3. **Initialize the Database Structure:**  
   Create a `logs` table to store request data:

   ```sql
   CREATE TABLE logs (
       id SERIAL PRIMARY KEY,
       timestamp TIMESTAMP NOT NULL,
       ip VARCHAR(45) NOT NULL,
       city VARCHAR(100),
       region VARCHAR(100),
       country VARCHAR(100),
       user_agent TEXT,
       req_type VARCHAR(100)
   );
   ```

---

### Configuring Environment Variables

To securely manage your database credentials, use a `.env` file. This should be added to `.gitignore` to prevent sensitive data from being exposed.

1. **Create a `.env` File:**  

   ```bash
   touch .env
   ```

2. **Add Database Credentials to `.env`:**

   ```env
   DB_USER=postgres
   DB_HOST=localhost
   DB_NAME=requestsrc
   DB_PASSWORD=your_password
   DB_PORT=5432
   ```

3. **Add `.env` to `.gitignore`:**

   ```bash
   echo ".env" >> .gitignore
   ```

---

### Basic Setup

Now that the database is ready, integrate **RequestSRC** into your Express app:

```javascript
const express = require('express');
const RequestSRC = require('request-src');
require('dotenv').config();

const app = express();

// ✅ Update RequestSRC configuration dynamically
RequestSRC.updateConfig({
    anonymize: false, // Enable anonymization
    dashboardRoute: "/requestSRC", // Dashboard route
    retentionPeriod: 30, // Retain logs for 30 days
});

// Use the middleware
app.use(RequestSRC.router);

// Example route to log requests
app.get("/", (req, res) => {
    RequestSRC.add(req, "home_page");
    res.send("Hello World with RequestSRC!");
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

With this setup, **RequestSRC** will now log request data into your PostgreSQL database and provide a dashboard at:

```
http://localhost:3000/requestSRC
```


## License

MIT License © 2025 Xavier Pimentel

---

## Contributing

Feel free to submit **issues**, **feature requests**, or **pull requests** on GitHub.

🔗 **GitHub Repository:** [https://github.com/XavierPim/requestSRC](https://github.com/XavierPim/requestSRC)
