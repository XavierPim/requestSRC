const { Pool } = require("pg");
const path = require("path");
// require("dotenv").config({ path: path.resolve(__dirname, '../.env') }); 
require("dotenv").config('../.env'); 

const pool = new Pool({
    user: String(process.env.DB_USER || ""),
    host: String(process.env.DB_HOST || ""),
    database: String(process.env.DB_NAME || ""),
    password: String(process.env.DB_PASSWORD || ""),
    port: Number(process.env.DB_PORT) || 5432 
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
