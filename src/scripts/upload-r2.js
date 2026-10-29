import fs from 'fs';
import path from 'path';
import { COUNTRIES_FILE, COUNTRY_DATA_DIR, loadDotEnv } from './rss-core.js';
import { r2Configured, r2PutJson } from './r2.js';

async function uploadCountry(code) {
    const dir = path.join(COUNTRY_DATA_DIR, code);
    if (!fs.existsSync(dir)) return 0;
    const files = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
    let uploaded = 0;
    for (const name of files) {
        const payload = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        await r2PutJson(`c/${code}/${name}`, payload);
        uploaded += 1;
    }
    return uploaded;
}

async function run() {
    loadDotEnv();
    if (!r2Configured()) {
        console.error('R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.');
        process.exit(1);
    }
    const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
    const requested = String(process.env.FETCH_COUNTRIES || '')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean);
    const selected = requested.length
        ? countries.filter(country => requested.includes(country.code))
        : countries;
    let files = 0;
    for (const country of selected) {
        const count = await uploadCountry(country.code);
        if (count) {
            files += count;
            console.log(`${country.code}: uploaded ${count} files`);
        }
    }
    console.log(`Done. ${files} JSON files uploaded to R2.`);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
