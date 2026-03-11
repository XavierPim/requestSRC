const { expect } = require('chai');

const requestSRC = require('../lib/requestSRC');
const database = require('../lib/database');

describe('RequestSRC unit behavior', function requestSRCUnit() {
    this.timeout(5000);

    let originalQuery;
    let originalGetPublicIP;

    before(() => {
        originalQuery = database.query;
        originalGetPublicIP = requestSRC.getPublicIP;
    });

    after(() => {
        database.query = originalQuery;
        requestSRC.getPublicIP = originalGetPublicIP;
    });

    afterEach(() => {
        database.query = originalQuery;
        requestSRC.getPublicIP = originalGetPublicIP;
        requestSRC.updateConfig({
            anonymize: false,
            dashboardRoute: '/requestSRC',
            retentionPeriod: 0,
            dashboardToken: '',
            resolveLocalIpWithPublicLookup: false
        });
    });

    it('extracts and normalizes plain IPv4 from req.ip', () => {
        const req = { headers: {}, ip: '8.8.8.8' };
        const ip = requestSRC.normalizeIp(requestSRC.extractClientIp(req));
        expect(ip).to.equal('8.8.8.8');
    });

    it('extracts first hop from multi-hop x-forwarded-for', () => {
        const req = { headers: { 'x-forwarded-for': '203.0.113.10, 70.1.2.3' }, ip: '127.0.0.1' };
        const ip = requestSRC.normalizeIp(requestSRC.extractClientIp(req));
        expect(ip).to.equal('203.0.113.10');
    });

    it('normalizes IPv4-mapped IPv6 addresses', () => {
        expect(requestSRC.normalizeIp('::ffff:198.51.100.20')).to.equal('198.51.100.20');
    });

    it('detects IPv6 loopback as local/private', () => {
        expect(requestSRC.isLocalOrPrivateIp('::1')).to.equal(true);
    });

    it('resolves local IP to public IP only when resolveLocalIpWithPublicLookup is enabled', async () => {
        requestSRC.updateConfig({
            anonymize: false,
            dashboardRoute: '/requestSRC',
            retentionPeriod: 0,
            dashboardToken: '',
            resolveLocalIpWithPublicLookup: true
        });

        requestSRC.getPublicIP = async () => '203.0.113.50';

        const resolved = await requestSRC.resolveClientIp({
            headers: {},
            ip: '127.0.0.1'
        });

        expect(resolved).to.equal('203.0.113.50');
    });

    it('keeps updateConfig anonymize setting during add()', async () => {
        let insertedIp = null;
        database.query = async (sql, params) => {
            if (/INSERT INTO logs/i.test(sql)) {
                insertedIp = params[1];
                return { rowCount: 1 };
            }
            return { rows: [] };
        };

        requestSRC.updateConfig({
            anonymize: true,
            dashboardRoute: '/requestSRC',
            retentionPeriod: 0,
            dashboardToken: '',
            resolveLocalIpWithPublicLookup: false
        });

        await requestSRC.add(
            {
                headers: { 'user-agent': 'UnitTest' },
                ip: '8.8.8.8'
            },
            'unit-test'
        );

        expect(requestSRC.config.anonymize).to.equal(true);
        expect(insertedIp).to.equal('8.8.8.0');
    });

    it('retention cleanup deletes rows older than configured period', async () => {
        let capturedSql = '';
        let capturedParams = [];
        database.query = async (sql, params) => {
            capturedSql = sql;
            capturedParams = params;
            return { rowCount: 4 };
        };

        requestSRC.config.retentionPeriod = 14;
        const result = await requestSRC.runRetentionCleanup();

        expect(capturedSql).to.include('DELETE FROM logs');
        expect(capturedParams).to.deep.equal([14]);
        expect(result.skipped).to.equal(false);
        expect(result.rowCount).to.equal(4);
    });

    it('retention cleanup is skipped when retentionPeriod is disabled', async () => {
        let queryCalls = 0;
        database.query = async () => {
            queryCalls += 1;
            return { rowCount: 0 };
        };

        requestSRC.config.retentionPeriod = 0;
        const result = await requestSRC.runRetentionCleanup();

        expect(queryCalls).to.equal(0);
        expect(result.skipped).to.equal(true);
        expect(result.rowCount).to.equal(0);
    });

    it('seedDummyData creates namespaced dummy req_type rows', async () => {
        const seenReqTypes = [];
        const allowedSuffixes = new Set(['login', 'api', 'checkout']);
        database.query = async (sql, params) => {
            if (/INSERT INTO logs/i.test(sql)) {
                for (let i = 6; i < params.length; i += 7) {
                    seenReqTypes.push(params[i]);
                }
            }
            return { rowCount: 0 };
        };

        const inserted = await requestSRC.seedDummyData({ count: 12, days: 2 });
        expect(inserted).to.equal(12);
        expect(seenReqTypes.length).to.equal(12);
        expect(seenReqTypes.every((value) => value.startsWith('requestsrc_dummy_sim:'))).to.equal(true);
        expect(
            seenReqTypes.every((value) => allowedSuffixes.has(value.replace('requestsrc_dummy_sim:', '')))
        ).to.equal(true);
    });

    it('deleteDummyData only removes rows matching dummy prefix', async () => {
        let capturedSql = '';
        database.query = async (sql) => {
            capturedSql = sql;
            return { rowCount: 9 };
        };

        const deleted = await requestSRC.deleteDummyData();
        expect(deleted).to.equal(9);
        expect(capturedSql).to.include("WHERE req_type LIKE 'requestsrc_dummy_sim:%'");
    });
});
