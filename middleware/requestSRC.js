const axios = require('axios');
const maxmind = require('maxmind');
const path = require('path');

class RequestSRC {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/GeoLite2-City.mmdb');

        // Load MaxMind database
        maxmind.open(this.dbPath)
            .then((lookup) => {
                this.geoLookup = lookup;
                console.log("MaxMind GeoIP database loaded.");
            })
            .catch(err => console.error("Error loading MaxMind DB:", err));
    }

    async getPublicIP() {
        try {
            const response = await axios.get('https://api.ipify.org?format=json');
            return response.data.ip;
        } catch (error) {
            console.error('Error fetching public IP:', error.message);
            return 'Unknown';
        }
    }

    async add(req, reqType) {
        let clientIP = req.headers['x-forwarded-for'] || req.ip;

        // 🛠 Force public IP if clientIP is local (for testing)
        if (clientIP === '::1' || clientIP.startsWith('::ffff:') || clientIP.startsWith('192.168.') || clientIP.startsWith('127.')) {
            console.log('Detected local IP. Fetching public IP instead...');
            clientIP = await this.getPublicIP();
        }

        // Get geolocation data
        let geoData = { country: 'Unknown', city: 'Unknown', region: 'Unknown' };
        if (this.geoLookup) {
            const geoInfo = this.geoLookup.get(clientIP);
            if (geoInfo) {
                geoData = {
                    country: geoInfo.country?.names?.en || 'Unknown',
                    city: geoInfo.city?.names?.en || 'Unknown',
                    region: geoInfo.subdivisions?.[0]?.names?.en || 'Unknown'
                };
            }
        }

        console.log(`Request logged: 
            Type=${reqType}, 
            Client IP=${clientIP}, 
            Location=${geoData.city}, ${geoData.region}, ${geoData.country}, 
            User-Agent=${req.headers['user-agent']}`
        );
    }
}

module.exports = new RequestSRC();
