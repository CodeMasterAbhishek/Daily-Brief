import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Parser from 'rss-parser';
import { fileURLToPath } from 'url';
import { applyFeedPolicy } from './classify-article.js';
import { r2Configured, r2GetJson, r2PutJson } from './r2.js';
import { isPromoArticle, isRecentArticle, publisherFromTitle, qualitySearchNames } from './quality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const parser = new Parser({
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
            ['enclosure', 'enclosure'],
            ['image', 'image'],
            ['source', 'source']
        ]
    }
});

export const FEEDS_FILE = path.join(__dirname, '../../public/data/rss-feeds.json');
export const COUNTRIES_FILE = path.join(__dirname, '../../public/data/countries.json');
export const DATA_DIR = path.join(__dirname, '../../public/data');
export const COUNTRY_DATA_DIR = path.join(DATA_DIR, 'c');
export const FALLBACK_IMAGE = 'assets/images/fallback.svg';

export const GOOGLE_TOPICS = [
    { topic: 'NATION', category: 'trending', homepage: true, tier: 1 },
    { topic: 'BUSINESS', category: 'business', tier: 2 },
    { topic: 'TECHNOLOGY', category: 'technology', tier: 2 },
    { topic: 'ENTERTAINMENT', category: 'entertainment', tier: 2 },
    { topic: 'SPORTS', category: 'sports', tier: 2 },
    { topic: 'SCIENCE', category: 'science', tier: 2 },
    { topic: 'HEALTH', category: 'health', tier: 2 }
];

const USER_AGENT = 'Mozilla/5.0 (compatible; DailyBrief/1.0; +https://codemasterabhishek.github.io/Daily-Brief/)';

export function loadDotEnv() {
    const envFile = path.join(__dirname, '../../.env');
    if (!fs.existsSync(envFile)) return;
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match || process.env[match[1]]) continue;
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
}

export function rssText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return rssText(value[0]);
    if (typeof value === 'object') {
        if (typeof value._ === 'string') return value._.trim();
        if (typeof value['#text'] === 'string') return value['#text'].trim();
        if (typeof value.title === 'string') return value.title.trim();
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
        if (imgMatch && imgMatch[1]) img = imgMatch[1];
    }
    if (typeof img !== 'string' || !img) return FALLBACK_IMAGE;
    if (img.includes('ichef.bbci.co.uk') && img.includes('/240/')) img = img.replace('/240/', '/976/');
    else if (img.includes('scx1.b-cdn.net') && img.includes('/tmb/')) img = img.replace('/tmb/', '/800w/');
    else if ((img.includes('ignimgs.com') || img.includes('techcrunch.com') || img.includes('polygon.com')) && img.includes('?')) img = img.split('?')[0];
    else if (img.includes('nytimes.com')) img = img.replace('-moth.', '-superJumbo.').replace('-thumbStandard.', '-superJumbo.');
    return img;
}

export function countryDir(code) {
    return path.join(COUNTRY_DATA_DIR, code);
}

const NEWS_WORD = {
    am: 'ዜና', ar: 'أخبار', az: 'xəbərlər', be: 'навіны', bg: 'новини', bn: 'সংবাদ',
    bs: 'vijesti', ca: 'notícies', cs: 'zprávy', da: 'nyheder', de: 'Nachrichten',
    el: 'ειδήσεις', en: 'news', es: 'noticias', et: 'uudised', fa: 'اخبار',
    fi: 'uutiset', fr: 'actualités', he: 'חדשות', hr: 'vijesti', hu: 'hírek',
    hy: 'լուրեր', id: 'berita', is: 'fréttir', it: 'notizie', ja: 'ニュース',
    ka: 'სიახლეები', kk: 'жаңалықтар', km: 'ព័ត៌មាន', ko: '뉴스', ky: 'жаңылыктар',
    lo: 'ຂ່າວ', lt: 'naujienos', lv: 'ziņas', mk: 'вести', mn: 'мэдээ',
    ms: 'berita', my: 'သတင်း', nb: 'nyheter', ne: 'समाचार', nl: 'nieuws',
    pl: 'wiadomości', ps: 'خبرونه', pt: 'notícias', ro: 'știri', ru: 'новости',
    sk: 'správy', sl: 'novice', so: 'wararka', sq: 'lajme', sr: 'вести',
    sv: 'nyheter', tg: 'хабарҳо', th: 'ข่าว', tk: 'habarlar', tr: 'haberler',
    uk: 'новини', ur: 'خبریں', uz: 'yangiliklar', vi: 'tin tức', zh: '新闻'
};

export function newsQueryWord(country) {
    if (country.englishFallback) return 'news';
    const lang = String(country.language || 'en').slice(0, 2);
    return NEWS_WORD[lang] || 'news';
}

function googleSearchFeed(country, query, suffix, itemLimit = 80) {
    const ceid = encodeURIComponent(country.ceid);
    return {
        url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${encodeURIComponent(country.hl)}&gl=${country.gl}&ceid=${ceid}`,
        category: 'trending',
        source: `Google News ${country.code} ${suffix}`,
        tier: 1,
        homepage: true,
        itemLimit
    };
}

export function googleNewsFeeds(country) {
    const ceid = encodeURIComponent(country.ceid);
    const hl = encodeURIComponent(country.hl);
    const top = {
        url: `https://news.google.com/rss?hl=${hl}&gl=${country.gl}&ceid=${ceid}`,
        category: 'trending',
        source: `Google News ${country.code} top`,
        tier: 1,
        homepage: true,
        itemLimit: 40
    };
    const topics = GOOGLE_TOPICS.map(topic => ({
        url: `https://news.google.com/rss/headlines/section/topic/${topic.topic}?hl=${hl}&gl=${country.gl}&ceid=${ceid}`,
        category: topic.category,
        source: `Google News ${country.code} ${topic.category}`,
        tier: topic.tier,
        homepage: topic.homepage === true,
        itemLimit: topic.tier === 1 ? 20 : 12
    }));
    return [top, ...topics];
}

export function googleNewsDayFeed(country, day) {
    const next = shiftDay(day, 1);
    const names = qualitySearchNames(country.code);
    const orPart = names
        .map(name => (/\s/.test(name) ? `"${name}"` : name))
        .join(' OR ');
    return googleSearchFeed(country, `${orPart} after:${day} before:${next}`, day, 80);
}

export function googleNewsFallbackDayFeed(country, day) {
    const next = shiftDay(day, 1);
    const word = newsQueryWord(country);
    return googleSearchFeed(country, `${word} after:${day} before:${next}`, `${day}-fallback`, 80);
}

export function googleNewsSiteWeekFeed(country, domain, start, endExclusive) {
    return googleSearchFeed(
        country,
        `site:${domain} after:${start} before:${endExclusive}`,
        `${domain} ${start}`,
        100
    );
}

export function googleNewsWeekFallbackFeed(country, start, endExclusive) {
    const word = newsQueryWord(country);
    return googleSearchFeed(country, `${word} after:${start} before:${endExclusive}`, `${start}-week`, 80);
}

export function weekWindows(days = 32, size = 7) {
    const all = recentDays(days);
    const newest = all[0];
    const oldest = all[all.length - 1];
    const windows = [];
    let endExclusive = shiftDay(newest, 1);
    while (endExclusive > oldest) {
        let start = shiftDay(endExclusive, -size);
        if (start < oldest) start = oldest;
        windows.push({ start, endExclusive });
        if (start <= oldest) break;
        endExclusive = start;
    }
    return windows;
}

export function shiftDay(day, delta) {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
}

export function recentDays(count = 30) {
    const today = new Date();
    const days = [];
    for (let i = 0; i < count; i += 1) {
        const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
        days.push(date.toISOString().slice(0, 10));
    }
    return days;
}

function sanitizeRss(xml) {
    return String(xml || '')
        .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/gi, '&amp;')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseFeed(url) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
                redirect: 'follow'
            });
            if (response.status === 429 || response.status >= 500) {
                lastError = new Error(`HTTP ${response.status}`);
                await sleep(1500 * 2 ** attempt);
                continue;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const xml = sanitizeRss(await response.text());
            return parser.parseString(xml);
        } catch (error) {
            lastError = error;
            if (attempt === 3 || /HTTP (4\d\d)/.test(error.message)) throw error;
            await sleep(800 * 2 ** attempt);
        }
    }
    throw lastError;
}

export async function fetchFeedArticles(feed) {
    try {
        const parsed = await parseFeed(feed.url);
        const itemLimit = Number(feed.itemLimit) || (Number(feed.tier) === 1 ? 12 : 8);
        const articles = [];
        for (const item of (parsed.items || []).slice(0, itemLimit)) {
            try {
                let img = await extractImage(item);
                const rawTitle = rssText(item.title);
                const link = rssText(item.link || item.guid);
                if (!rawTitle || !link) continue;
                const parsedTitle = publisherFromTitle(rawTitle);
                const source = rssText(item.source) || parsedTitle.source || feed.source;
                const title = parsedTitle.title.replace(/\[(?:Image|Photo) \d+ of \d+\]/gi, '').trim();
                if (!title) continue;
                if (!img) img = FALLBACK_IMAGE;
                const id = `rss-${crypto.createHash('md5').update(link).digest('hex').substring(0, 12)}`;
                articles.push({
                    id,
                    title,
                    description: rssText(item.contentSnippet).substring(0, 200),
                    url: link,
                    image: img,
                    source,
                    category: feed.category,
                    feedCategory: feed.category,
                    feedTier: feed.tier,
                    feedHomepage: feed.homepage === true,
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

export function uniqueArticles(articles, feedBySource) {
    const merged = articles
        .map(article => {
            const feed = feedBySource.get(article.source) || {
                category: article.feedCategory || article.category,
                tier: article.feedTier,
                homepage: article.feedHomepage
            };
            const applied = applyFeedPolicy(article, feed);
            return { ...applied, source: article.source || applied.source };
        })
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
    return unique.filter(article => !isPromoArticle(article));
}

export async function loadExisting(code, { remote = true } = {}) {
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

    if (remote && r2Configured()) {
        const remoteMeta = await r2GetJson(`c/${code}/metadata.json`);
        remoteChunks = remoteMeta?.chunks || [];
        for (const chunk of remoteChunks.slice(0, 2)) {
            const remoteShard = await r2GetJson(`c/${code}/${chunk}.json`);
            (remoteShard?.articles || []).forEach(article => map.set(article.id, article));
        }
    }
    return { map, remoteChunks };
}

export function writeCountry(code, articles, remoteChunks = [], { replaceShards = false } = {}) {
    const chunks = {};
    articles.forEach(article => {
        const monthKey = `news-${String(article.publishedAt || '').substring(0, 7)}`;
        if (!/^news-\d{4}-\d{2}$/.test(monthKey)) return;
        if (!chunks[monthKey]) chunks[monthKey] = [];
        chunks[monthKey].push(article);
    });
    const writtenNames = Object.keys(chunks).sort().reverse();
    const chunkNames = [...new Set([
        ...writtenNames,
        ...(replaceShards ? [] : remoteChunks)
    ])]
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
    if (replaceShards && fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir).filter(file => file.startsWith('news-') && file.endsWith('.json'))) {
            const key = name.replace(/\.json$/, '');
            if (!writtenNames.includes(key)) fs.unlinkSync(path.join(dir, name));
        }
    }
    const metadata = {
        latest: chunkNames[0] || null,
        chunks: chunkNames,
        totalArticles: articles.length,
        country: code
    };
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    return { metadata, written };
}

export async function mergeAndSave(country, extraFeeds, incoming, {
    remote = true,
    upload = false,
    windowDays = 0,
    replaceShards = false
} = {}) {
    const feedBySource = new Map([
        ...googleNewsFeeds(country).map(feed => [feed.source, feed]),
        ...extraFeeds.map(feed => [feed.source, feed])
    ]);
    const { map: existing, remoteChunks } = await loadExisting(country.code, { remote });
    incoming.forEach(article => existing.set(article.id, article));
    let unique = uniqueArticles([...existing.values()], feedBySource);
    if (windowDays) {
        unique = unique.filter(article => isRecentArticle(article.publishedAt, windowDays));
    }
    const { metadata, written } = writeCountry(
        country.code,
        unique,
        replaceShards ? [] : remoteChunks,
        { replaceShards }
    );
    if (upload && r2Configured()) {
        await r2PutJson(`c/${country.code}/metadata.json`, metadata);
        const newest = written
            .slice()
            .sort((a, b) => b.chunkName.localeCompare(a.chunkName))
            .slice(0, 2);
        for (const shard of newest) {
            await r2PutJson(`c/${country.code}/${shard.chunkName}.json`, shard.payload);
        }
    }
    return { unique, metadata };
}
