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
    mergeAndSave,
    safeHttpUrl,
    writeJsonAtomic,
    mapPool
} from './rss-core.js';
import { filterNewsArticles, isRecentArticle } from './quality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEO_START = '<!-- seo-articles:start -->';
const SEO_END = '<!-- seo-articles:end -->';
const FEED_CONCURRENCY = 6;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function selectCountries(allCountries, { r2On = r2Configured(), now = Date.now() } = {}) {
    const requested = String(process.env.FETCH_COUNTRIES || '')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean);
    if (requested.length) {
        return allCountries.filter(country => requested.includes(country.code));
    }

    const us = allCountries.find(country => country.code === 'US');
    if (!r2On) return us ? [us] : [];

    const others = allCountries.filter(country => country.code !== 'US');
    const batchSize = Math.min(others.length, Math.max(1, Number(process.env.COUNTRY_BATCH_SIZE || 24)));
    const tick = Math.floor(now / (30 * 60 * 1000));
    const start = others.length ? (tick * batchSize) % others.length : 0;
    const batch = [];
    for (let i = 0; i < batchSize; i += 1) {
        batch.push(others[(start + i) % others.length]);
    }
    return us ? [us, ...batch] : batch;
}

function updateSeo(articles) {
    const INDEX_FILE = path.join(__dirname, '../../public/index.html');
    let indexHtml = fs.readFileSync(INDEX_FILE, 'utf8');
    const seoItems = articles
        .filter(article => safeHttpUrl(article?.url) && isRecentArticle(article?.publishedAt, 32))
        .slice(0, 20)
        .map(article => {
            const url = safeHttpUrl(article.url);
            return `<article><h2><a href="${escapeHtml(url)}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.description || '')}</p><span>${escapeHtml(article.source)} - ${escapeHtml(article.category)}</span></article>`;
        })
        .join('');
    const seoBlock = `${SEO_START}\n        <noscript><div class="seo-articles">${seoItems}</div></noscript>\n        ${SEO_END}`;
    const seoPattern = /<!-- seo-articles:start -->[\s\S]*?<!-- seo-articles:end -->/;
    if (seoPattern.test(indexHtml)) indexHtml = indexHtml.replace(seoPattern, seoBlock);
    const tmpPath = `${INDEX_FILE}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, indexHtml);
    fs.renameSync(tmpPath, INDEX_FILE);
}

async function processCountry(country, extraFeeds) {
    const taggedExtras = (extraFeeds || []).map(feed => ({ ...feed, country: country.code }));
    const feeds = [...taggedExtras, ...googleNewsFeeds(country)];
    const groups = await mapPool(feeds, FEED_CONCURRENCY, fetchFeedArticles);
    const incoming = filterNewsArticles(groups.flat(), country.code, {
        extraQuality: taggedExtras.map(feed => feed.source),
        minKeep: 12,
        maxKeep: 200
    });
    const { unique, metadata } = await mergeAndSave(country, taggedExtras, incoming, {
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

    const publicBase = r2PublicBase();
    if (publicBase) {
        writeJsonAtomic(path.join(DATA_DIR, 'storage.json'), {
            base: publicBase,
            updatedAt: new Date().toISOString()
        });
    }

    console.log(`[${new Date().toISOString()}] Done.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    run()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}
