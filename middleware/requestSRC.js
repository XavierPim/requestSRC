const axios = require('axios');

class RequestSRC {
    constructor() {
        console.log("RequestSRC middleware initialized.");
    }

    async add(req, reqType) {
        let publicIP = 'Unknown';

        try {
            // Fetch the public IP if behind a proxy
            const response = await axios.get('https://api.ipify.org?format=json');
            publicIP = response.data.ip;
        } catch (error) {
            console.error('Error fetching public IP:', error.message);
        }

        // Use x-forwarded-for to get real client IP if behind a proxy
        const clientIP = req.headers['x-forwarded-for'] || req.ip;

        console.log(`Request logged: 
            Type=${reqType}, 
            Public IP=${publicIP}, 
            Client IP=${clientIP}, 
            User-Agent=${req.headers['user-agent']}`
        );
    }
}

module.exports = new RequestSRC();
