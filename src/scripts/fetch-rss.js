import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { r2Configured, r2PublicBase } from './r2.js';
import {
    FEEDS_FILE,
    COUNTRIES_FILE,
    DATA_DIR,
    loadDotEnv,
    googleNewsFeeds,
    fetchFeedArticles,
    mergeAndSave
} from './rss-core.js';
import { filterNewsArticles } from './quality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEO_START = '<!-- seo-articles:start -->';
const SEO_END = '<!-- seo-articles:end -->';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeHttpUrl(value) {
    try {
        const url = new URL(String(value).trim());
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch {
        // Ignore invalid or non-http URLs.
    }
    return '';
}

function selectCountries(allCountries) {
    const requested = String(process.env.FETCH_COUNTRIES || '')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean);
    if (requested.length) {
        return allCountries.filter(country => requested.includes(country.code));
    }
    if (!r2Configured()) return allCountries.filter(country => country.code === 'US');

    const batchSize = Math.max(1, Number(process.env.COUNTRY_BATCH_SIZE || 25));
    const tick = Math.floor(Date.now() / (30 * 60 * 1000));
    const start = (tick * batchSize) % allCountries.length;
    const batch = [];
    for (let i = 0; i < batchSize; i += 1) {
        batch.push(allCountries[(start + i) % allCountries.length]);
    }
    return batch;
}

function updateSeo(articles) {
    const INDEX_FILE = path.join(__dirname, '../../public/index.html');
    let indexHtml = fs.readFileSync(INDEX_FILE, 'utf8');
    const seoItems = articles.slice(0, 20).map(article => {
        const url = safeHttpUrl(article.url);
        if (!url) return '';
        return `<article><h2><a href="${escapeHtml(url)}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.description || '')}</p><span>${escapeHtml(article.source)} - ${escapeHtml(article.category)}</span></article>`;
    }).join('');
    const seoBlock = `${SEO_START}\n        <noscript><div class="seo-articles">${seoItems}</div></noscript>\n        ${SEO_END}`;
    const seoPattern = /<!-- seo-articles:start -->[\s\S]*?<!-- seo-articles:end -->/;
    if (seoPattern.test(indexHtml)) indexHtml = indexHtml.replace(seoPattern, seoBlock);
    fs.writeFileSync(INDEX_FILE, indexHtml);
}

async function processCountry(country, extraFeeds) {
    const feeds = [...googleNewsFeeds(country), ...extraFeeds];
    const groups = await Promise.all(feeds.map(fetchFeedArticles));
    const incoming = filterNewsArticles(groups.flat(), country.code, {
        extraQuality: extraFeeds.map(feed => feed.source),
        minKeep: 12,
        maxKeep: 200
    });
    const { unique, metadata } = await mergeAndSave(country, extraFeeds, incoming, {
        remote: true,
        upload: r2Configured()
    });
    console.log(`${country.code}: ${unique.length} articles, ${metadata.chunks.length} months`);
    return unique;
}

async function run() {
    loadDotEnv();
    console.log(`[${new Date().toISOString()}] Starting country RSS fetch...`);
    const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
    const extraByCountry = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf8'));
    const selected = selectCountries(countries);
    console.log(`Updating ${selected.map(country => country.code).join(', ')} (R2 ${r2Configured() ? 'on' : 'off'})`);

    let usArticles = [];
    for (const country of selected) {
        const extras = extraByCountry[country.code] || [];
        const articles = await processCountry(country, extras);
        if (country.code === 'US') usArticles = articles;
    }

    if (usArticles.length) {
        try { updateSeo(usArticles); } catch (error) { console.error('Failed to pre-render SEO HTML:', error); }
    }

    fs.writeFileSync(path.join(DATA_DIR, 'storage.json'), JSON.stringify({
        base: r2PublicBase(),
        updatedAt: new Date().toISOString()
    }, null, 2));

    console.log(`[${new Date().toISOString()}] Done.`);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
