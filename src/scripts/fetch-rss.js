import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Parser from 'rss-parser';
import { fileURLToPath } from 'url';
import { applyFeedPolicy } from './classify-article.js';
import { r2Configured, r2GetJson, r2PutJson, r2PublicBase } from './r2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parser = new Parser({
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
            ['enclosure', 'enclosure'],
            ['image', 'image']
        ]
    }
});

const FEEDS_FILE = path.join(__dirname, '../../public/data/rss-feeds.json');
const COUNTRIES_FILE = path.join(__dirname, '../../public/data/countries.json');
const DATA_DIR = path.join(__dirname, '../../public/data');
const COUNTRY_DATA_DIR = path.join(DATA_DIR, 'c');
const FALLBACK_IMAGE = 'assets/images/fallback.svg';
const SEO_START = '<!-- seo-articles:start -->';
const SEO_END = '<!-- seo-articles:end -->';
const GOOGLE_TOPICS = [
    { topic: 'NATION', category: 'trending', homepage: true, tier: 1 },
    { topic: 'BUSINESS', category: 'business', tier: 2 },
    { topic: 'TECHNOLOGY', category: 'technology', tier: 2 },
    { topic: 'ENTERTAINMENT', category: 'entertainment', tier: 2 },
    { topic: 'SPORTS', category: 'sports', tier: 2 },
    { topic: 'SCIENCE', category: 'science', tier: 2 },
    { topic: 'HEALTH', category: 'health', tier: 2 }
];

function loadDotEnv() {
    const envFile = path.join(__dirname, '../../.env');
    if (!fs.existsSync(envFile)) return;
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match || process.env[match[1]]) continue;
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
}

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

function rssText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return rssText(value[0]);
    if (typeof value === 'object') {
        if (typeof value._ === 'string') return value._.trim();
        if (typeof value['#text'] === 'string') return value['#text'].trim();
    }
    try {
        return String(value).trim();
    } catch {
        return '';
    }
}

function rssDate(value) {
    const parsed = new Date(rssText(value) || value || Date.now());
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function rssCategoriesFromItem(item) {
    return []
        .concat(item.categories || [], item.category || [])
        .flat()
        .map(value => rssText(value && typeof value === 'object' && value.term ? value.term : value))
        .filter(Boolean);
}

async function extractImage(item) {
    let img = null;
    if (item.mediaContent && item.mediaContent['$'] && item.mediaContent['$'].url) {
        img = item.mediaContent['$'].url;
    } else if (item.mediaThumbnail && item.mediaThumbnail['$'] && item.mediaThumbnail['$'].url) {
        img = item.mediaThumbnail['$'].url;
    } else if (item.enclosure && item.enclosure.url) {
        img = item.enclosure.url;
    } else if (item.image && item.image.url) {
        img = item.image.url;
    } else {
        const content = rssText(item.content) || rssText(item['content:encoded']);
        const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch && imgMatch[1]) {
            img = imgMatch[1];
        }
    }

    if (typeof img !== 'string' || !img) return FALLBACK_IMAGE;

    if (img.includes('ichef.bbci.co.uk') && img.includes('/240/')) img = img.replace('/240/', '/976/');
    else if (img.includes('scx1.b-cdn.net') && img.includes('/tmb/')) img = img.replace('/tmb/', '/800w/');
    else if ((img.includes('ignimgs.com') || img.includes('techcrunch.com') || img.includes('polygon.com')) && img.includes('?')) img = img.split('?')[0];
    else if (img.includes('nytimes.com')) img = img.replace('-moth.', '-superJumbo.').replace('-thumbStandard.', '-superJumbo.');

    return img;
}

function countryDir(code) {
    return path.join(COUNTRY_DATA_DIR, code);
}

function googleNewsFeeds(country) {
    const ceid = encodeURIComponent(country.ceid);
    return GOOGLE_TOPICS.map(topic => ({
        url: `https://news.google.com/rss/headlines/section/topic/${topic.topic}?hl=${encodeURIComponent(country.hl)}&gl=${country.gl}&ceid=${ceid}`,
        category: topic.category,
        source: `Google News ${country.code} ${topic.category}`,
        tier: topic.tier,
        homepage: topic.homepage === true,
        allowMissingImage: true
    }));
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

async function fetchFeedArticles(feed) {
    try {
        const parsed = await parser.parseURL(feed.url);
        const itemLimit = Number(feed.tier) === 1 ? 12 : 8;
        const articles = [];
        for (const item of parsed.items.slice(0, itemLimit)) {
            try {
                let img = await extractImage(item);
                let title = rssText(item.title);
                const link = rssText(item.link || item.guid);
                if (!title || !link) continue;
                if (!img) img = FALLBACK_IMAGE;
                title = title.replace(/\[(?:Image|Photo) \d+ of \d+\]/gi, '').trim();
                const dedupeKey = `${title}${feed.source}`;
                const id = `rss-${crypto.createHash('md5').update(dedupeKey).digest('hex').substring(0, 12)}`;
                articles.push({
                    id, title,
                    description: rssText(item.contentSnippet).substring(0, 200),
                    url: link, image: img, source: feed.source, category: feed.category,
                    rssCategories: rssCategoriesFromItem(item),
                    publishedAt: rssDate(item.isoDate || item.pubDate)
                });
            } catch (itemError) {
                console.error(`Skipping item from ${feed.source}: ${itemError.message}`);
            }
        }
        return articles;
    } catch (error) {
        console.error(`Error fetching ${feed.source}: ${error.message}`);
        return [];
    }
}

function uniqueArticles(articles, feedBySource) {
    const merged = articles
        .map(article => applyFeedPolicy(article, feedBySource.get(article.source)))
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const seenTitles = new Set();
    const seenUrls = new Set();
    const unique = [];
    for (const article of merged) {
        if (!article.title || !article.url) continue;
        const titleLower = article.title.toLowerCase().trim();
        const urlLower = article.url.toLowerCase().trim();
        if (seenTitles.has(titleLower) || seenUrls.has(urlLower)) continue;
        seenTitles.add(titleLower);
        seenUrls.add(urlLower);
        unique.push(article);
    }
    return unique;
}

async function loadExisting(code) {
    const map = new Map();
    let remoteChunks = [];
    const local = countryDir(code);
    if (fs.existsSync(local)) {
        for (const file of fs.readdirSync(local).filter(name => name.startsWith('news-') && name.endsWith('.json'))) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(local, file), 'utf8'));
                (data.articles || []).forEach(article => map.set(article.id, article));
            } catch {
                // Ignore a corrupt local shard.
            }
        }
    }

    if (r2Configured()) {
        const remoteMeta = await r2GetJson(`c/${code}/metadata.json`);
        remoteChunks = remoteMeta?.chunks || [];
        for (const chunk of remoteChunks.slice(0, 2)) {
            const remote = await r2GetJson(`c/${code}/${chunk}.json`);
            (remote?.articles || []).forEach(article => map.set(article.id, article));
        }
    }
    return { map, remoteChunks };
}

function writeCountry(code, articles, remoteChunks = []) {
    const chunks = {};
    articles.forEach(article => {
        const monthKey = `news-${String(article.publishedAt || '').substring(0, 7)}`;
        if (!/^news-\d{4}-\d{2}$/.test(monthKey)) return;
        if (!chunks[monthKey]) chunks[monthKey] = [];
        chunks[monthKey].push(article);
    });
    const writtenNames = Object.keys(chunks).sort().reverse();
    const chunkNames = [...new Set([...writtenNames, ...remoteChunks])]
        .filter(name => /^news-\d{4}-\d{2}$/.test(name))
        .sort()
        .reverse();
    const dir = countryDir(code);
    fs.mkdirSync(dir, { recursive: true });
    const written = [];
    writtenNames.forEach(chunkName => {
        const payload = {
            lastUpdated: new Date().toISOString(),
            count: chunks[chunkName].length,
            articles: chunks[chunkName]
        };
        fs.writeFileSync(path.join(dir, `${chunkName}.json`), JSON.stringify(payload, null, 2));
        written.push({ chunkName, payload });
    });
    const metadata = {
        latest: chunkNames[0] || null,
        chunks: chunkNames,
        totalArticles: articles.length,
        country: code
    };
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    return { metadata, written };
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
    const feedBySource = new Map(feeds.map(feed => [feed.source, feed]));
    const { map: existing, remoteChunks } = await loadExisting(country.code);
    const groups = await Promise.all(feeds.map(fetchFeedArticles));
    groups.flat().forEach(article => existing.set(article.id, article));
    const unique = uniqueArticles([...existing.values()], feedBySource);
    const { metadata, written } = writeCountry(country.code, unique, remoteChunks);

    if (r2Configured()) {
        await r2PutJson(`c/${country.code}/metadata.json`, metadata);
        const newest = written
            .slice()
            .sort((a, b) => b.chunkName.localeCompare(a.chunkName))
            .slice(0, 2);
        for (const shard of newest) {
            await r2PutJson(`c/${country.code}/${shard.chunkName}.json`, shard.payload);
        }
    }

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
    fs.writeFileSync(path.join(DATA_DIR, 'storage.json'), JSON.stringify({
        base: publicBase,
        updatedAt: new Date().toISOString()
    }, null, 2));

    console.log(`[${new Date().toISOString()}] Done.`);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
