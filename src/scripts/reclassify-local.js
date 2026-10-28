import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyFeedPolicy } from './classify-article.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../public/data/c/US');
const FEEDS_FILE = path.join(__dirname, '../../public/data/rss-feeds.json');
const METADATA_FILE = path.join(DATA_DIR, 'metadata.json');

const extraByCountry = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf-8'));
const feeds = extraByCountry.US || [];
const feedBySource = new Map(feeds.map(feed => [feed.source, feed]));
const allowedSources = new Set(feeds.map(feed => feed.source));

const chunkFiles = fs.readdirSync(DATA_DIR).filter(name => name.startsWith('news-') && name.endsWith('.json'));
const chunks = {};

for (const fileName of chunkFiles) {
    const filePath = path.join(DATA_DIR, fileName);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const articles = (data.articles || [])
        .filter(article => allowedSources.has(article.source))
        .map(article => applyFeedPolicy(article, feedBySource.get(article.source)));
    chunks[fileName.replace(/\.json$/, '')] = articles;
}

const allArticles = Object.values(chunks).flat().sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
const seenTitles = new Set();
const seenUrls = new Set();
const unique = [];
for (const article of allArticles) {
    const title = (article.title || '').toLowerCase().trim();
    const url = (article.url || '').toLowerCase().trim();
    if (!title || !url || seenTitles.has(title) || seenUrls.has(url)) continue;
    seenTitles.add(title);
    seenUrls.add(url);
    unique.push(article);
}

const byMonth = {};
for (const article of unique) {
    const key = `news-${article.publishedAt.substring(0, 7)}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(article);
}

for (const fileName of chunkFiles) {
    const key = fileName.replace(/\.json$/, '');
    if (!byMonth[key]) fs.unlinkSync(path.join(DATA_DIR, fileName));
}

const chunkNames = Object.keys(byMonth).sort().reverse();
for (const chunkName of chunkNames) {
    fs.writeFileSync(path.join(DATA_DIR, `${chunkName}.json`), JSON.stringify({
        lastUpdated: new Date().toISOString(),
        count: byMonth[chunkName].length,
        articles: byMonth[chunkName]
    }, null, 2));
}

fs.writeFileSync(METADATA_FILE, JSON.stringify({
    latest: chunkNames[0] || null,
    chunks: chunkNames,
    totalArticles: unique.length,
    country: 'US'
}, null, 2));

const byCategory = {};
for (const article of unique) {
    byCategory[article.category] = (byCategory[article.category] || 0) + 1;
}
console.log(`Kept ${unique.length} articles after dropping removed publishers and reclassifying.`);
console.log(byCategory);
