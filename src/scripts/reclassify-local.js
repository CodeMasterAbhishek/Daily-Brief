import fs from 'fs';
import path from 'path';
import {
    COUNTRIES_FILE,
    FEEDS_FILE,
    countryDir,
    googleNewsFeeds,
    uniqueArticles,
    writeCountry
} from './rss-core.js';

const SHARD_FILE_RE = /^news-\d{4}-\d{2}\.json$/;

function selectCountries(allCountries) {
    const requested = String(process.env.FETCH_COUNTRIES || 'US')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean);
    if (requested.includes('ALL')) return allCountries;
    return allCountries.filter(country => requested.includes(country.code));
}

function reclassifyCountry(country, extraFeeds) {
    const dir = countryDir(country.code);
    if (!fs.existsSync(dir)) return 0;

    const chunkFiles = fs.readdirSync(dir).filter(name => SHARD_FILE_RE.test(name));
    if (!chunkFiles.length) return 0;

    const loaded = [];
    for (const fileName of chunkFiles) {
        const data = JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf8'));
        for (const article of data.articles || []) {
            loaded.push(article);
        }
    }

    const feedBySource = new Map([
        ...googleNewsFeeds(country).map(feed => [feed.source, feed]),
        ...extraFeeds.map(feed => [feed.source, feed])
    ]);
    const unique = uniqueArticles(loaded, feedBySource);
    writeCountry(country.code, unique, [], { replaceShards: true });

    const byCategory = Object.create(null);
    for (const article of unique) {
        byCategory[article.category] = (byCategory[article.category] || 0) + 1;
    }
    console.log(`${country.code}: kept ${unique.length} articles after reclassifying.`);
    console.log(byCategory);
    return unique.length;
}

function run() {
    const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
    const extraByCountry = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf8'));
    const selected = selectCountries(countries);
    for (const country of selected) {
        reclassifyCountry(country, extraByCountry[country.code] || []);
    }
}

run();
