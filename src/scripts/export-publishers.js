import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COUNTRIES_FILE, DATA_DIR } from './rss-core.js';
import { COUNTRY_QUALITY, GLOBAL_QUALITY, COUNTRY_DOMAINS, GLOBAL_QUALITY_DOMAINS } from './quality.js';

export function buildQualityPublishers(countries) {
    const byCode = Object.fromEntries(countries.map(country => [country.code, country]));
    const list = {};
    for (const [code, publishers] of Object.entries(COUNTRY_QUALITY)) {
        const country = byCode[code];
        const domains = COUNTRY_DOMAINS[code] || [];
        list[code] = {
            name: country?.name || code,
            language: country?.englishFallback ? 'en' : country?.language || 'en',
            publishers: publishers.map((name, index) => ({
                name,
                domain: domains[index] || domains[0] || null
            }))
        };
    }
    return {
        generatedAt: new Date().toISOString(),
        policy: 'National prestige outlets first; Reuters/AP/BBC/AFP as global fallback. Shopping, coupons, social, and affiliate URLs are dropped.',
        global: {
            names: GLOBAL_QUALITY,
            domains: GLOBAL_QUALITY_DOMAINS
        },
        countries: list
    };
}

export function writeQualityPublishers(countries) {
    const payload = buildQualityPublishers(countries);
    const file = path.join(DATA_DIR, 'quality-publishers.json');
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    return file;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
    const file = writeQualityPublishers(countries);
    console.log(`Wrote ${file} (${Object.keys(COUNTRY_QUALITY).length} countries)`);
}
