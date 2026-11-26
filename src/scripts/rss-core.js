import fs from 'fs';
import net from 'net';
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
    { topic: 'WORLD', category: 'politics', tier: 2 },
    { topic: 'BUSINESS', category: 'business', tier: 2 },
    { topic: 'TECHNOLOGY', category: 'technology', tier: 2 },
    { topic: 'ENTERTAINMENT', category: 'entertainment', tier: 2 },
    { topic: 'SPORTS', category: 'sports', tier: 2 },
    { topic: 'SCIENCE', category: 'science', tier: 2 },
    { topic: 'HEALTH', category: 'health', tier: 2 }
];

const USER_AGENT = 'Mozilla/5.0 (compatible; DailyBrief/1.0; +https://codemasterabhishek.github.io/Daily-Brief/)';
const FEED_TIMEOUT_MS = 12000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const SHARD_NAME_RE = /^news-\d{4}-\d{2}$/;
const HTTPS_UPGRADE_HOSTS = [
    'ichef.bbci.co.uk',
    'p.imgci.com',
    'assets2.ignimgs.com',
    'ignimgs.com',
    'media.wired.com',
    'nytimes.com',
    'guim.co.uk'
];
const HTML_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    rsquo: '\u2019',
    lsquo: '\u2018',
    rdquo: '\u201D',
    ldquo: '\u201C',
    ndash: '\u2013',
    mdash: '\u2014',
    hellip: '\u2026'
};

export function writeJsonAtomic(filePath, data) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
        fs.renameSync(tmpPath, filePath);
    } catch (error) {
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
            // Ignore cleanup failure.
        }
        throw error;
    }
}

export function safeHttpUrl(value, { allowHttp = true } = {}) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
        const parsed = new URL(trimmed);
        if (!parsed.hostname) return '';
        if (parsed.protocol === 'https:') return parsed.href;
        if (allowHttp && parsed.protocol === 'http:') return parsed.href;
        return '';
    } catch {
        return '';
    }
}

function isBlockedIPv4Bytes(a, b, c) {
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a >= 224) return true; // multicast & reserved
    return false;
}

function parseIPv6Groups(ip) {
    const clean = String(ip).split('%')[0].toLowerCase();
    const halves = clean.split('::');
    if (halves.length > 2) return null;

    const parseSide = (part) => {
        if (!part) return [];
        const tokens = part.split(':');
        const out = [];
        for (let i = 0; i < tokens.length; i += 1) {
            const token = tokens[i];
            if (i === tokens.length - 1 && token.includes('.')) {
                if (!net.isIPv4(token)) return null;
                const octets = token.split('.').map(Number);
                out.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
            } else {
                if (!/^[0-9a-f]{1,4}$/.test(token)) return null;
                out.push(Number.parseInt(token, 16));
            }
        }
        return out;
    };

    const left = parseSide(halves[0]);
    if (!left) return null;
    if (halves.length === 1) return left.length === 8 ? left : null;

    const right = parseSide(halves[1]);
    if (!right) return null;
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    return [...left, ...new Array(missing).fill(0), ...right];
}

function isBlockedIPv6(ip) {
    const groups = parseIPv6Groups(ip);
    if (!groups) return true;
    const allZeroExceptLast = groups.slice(0, 7).every(g => g === 0);
    if (allZeroExceptLast && (groups[7] === 0 || groups[7] === 1)) return true; // :: or ::1
    const firstFiveZero = groups.slice(0, 5).every(g => g === 0);
    if (firstFiveZero && (groups[5] === 0xffff || groups[5] === 0)) {
        const hi = groups[6];
        const lo = groups[7];
        return isBlockedIPv4Bytes((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff);
    }
    if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8
    return false;
}

export function isSafePublicUrl(urlString) {
    const safe = safeHttpUrl(urlString);
    if (!safe) return false;
    let parsed;
    try {
        parsed = new URL(safe);
    } catch {
        return false;
    }
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
    if (!host) return false;

    const cleanIp = host.split('%')[0];
    if (net.isIPv4(cleanIp)) {
        const [a, b, c] = cleanIp.split('.').map(Number);
        return !isBlockedIPv4Bytes(a, b, c);
    }
    if (net.isIPv6(cleanIp)) {
        return !isBlockedIPv6(cleanIp);
    }

    if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host === 'local' ||
        host.endsWith('.local') ||
        host === 'internal' ||
        host.endsWith('.internal') ||
        host.endsWith('.localdomain') ||
        host.endsWith('.home.arpa') ||
        !host.includes('.')
    ) {
        return false;
    }
    return true;
}

export function decodeEntities(str) {
    if (str == null) return '';
    return String(str).replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, dec, hex, named) => {
        if (named) {
            const replacement = HTML_ENTITIES[named.toLowerCase()];
            return replacement !== undefined ? replacement : match;
        }
        const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
            return match;
        }
        if (code === 160) return ' ';
        if (code < 32) return code === 9 || code === 10 || code === 13 ? ' ' : '';
        try {
            return String.fromCodePoint(code);
        } catch {
            return match;
        }
    });
}

export function upgradeImageUrl(rawUrl) {
    if (!rawUrl || rawUrl === FALLBACK_IMAGE) return FALLBACK_IMAGE;
    const safe = safeHttpUrl(decodeEntities(String(rawUrl)));
    if (!safe) return FALLBACK_IMAGE;

    let img = safe;
    try {
        const parsed = new URL(img);
        const host = parsed.hostname.toLowerCase();
        if (
            parsed.protocol === 'http:' &&
            HTTPS_UPGRADE_HOSTS.some(cdn => host === cdn || host.endsWith(`.${cdn}`))
        ) {
            parsed.protocol = 'https:';
            img = parsed.href;
        }
    } catch {
        return FALLBACK_IMAGE;
    }

    if (img.includes('ichef.bbci.co.uk') && img.includes('/240/')) {
        img = img.replace('/240/', '/976/');
    } else if (img.includes('scx1.b-cdn.net') && img.includes('/tmb/')) {
        img = img.replace('/tmb/', '/800w/');
    } else if ((img.includes('ignimgs.com') || img.includes('techcrunch.com') || img.includes('polygon.com')) && img.includes('?')) {
        img = img.split('?')[0];
    } else if (img.includes('nytimes.com')) {
        img = img.replace('-moth.', '-superJumbo.').replace('-thumbStandard.', '-superJumbo.');
    }
    return img;
}

export async function mapPool(items, limit, worker) {
    if (!items.length) return [];
    const concurrency = Math.max(1, Math.min(limit, items.length));
    const results = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: concurrency }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await worker(items[index], index);
        }
    });
    await Promise.all(runners);
    return results;
}

export function loadDotEnv(envFile = path.join(__dirname, '../../.env')) {
    if (!fs.existsSync(envFile)) return;
    for (const rawLine of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match || process.env[match[1]]) continue;
        let value = match[2].trim();
        if (
            value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        ) {
            value = value.slice(1, -1);
        }
        process.env[match[1]] = value;
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

export function rssDate(value, now = Date.now()) {
    const raw = value instanceof Date ? value.toISOString() : rssText(value);
    if (!raw) return null;
    const time = Date.parse(raw);
    if (!Number.isFinite(time)) return null;
    const diff = time - now;
    if (diff > 60 * 60 * 1000) return null;
    if (diff > 5 * 60 * 1000) return new Date(now).toISOString();
    return new Date(time).toISOString();
}

function rssCategoriesFromItem(item) {
    return []
        .concat(item.categories || [], item.category || [])
        .flat()
        .map(value => rssText(value && typeof value === 'object' && value.term ? value.term : value))
        .filter(Boolean);
}

function firstImageCandidate(field, { requireImageType = false } = {}) {
    if (!field) return null;
    const list = Array.isArray(field) ? field : [field];
    for (const entry of list) {
        if (!entry) continue;
        if (typeof entry === 'string') {
            const candidate = safeHttpUrl(decodeEntities(entry));
            if (candidate) return candidate;
            continue;
        }
        const attrs = entry['$'] || entry;
        const url = attrs?.url || entry.url;
        if (typeof url !== 'string' || !url.trim()) continue;
        const medium = String(attrs?.medium || '').toLowerCase();
        const type = String(attrs?.type || '').toLowerCase();
        if (medium === 'video' || medium === 'audio' || type.startsWith('video/') || type.startsWith('audio/')) {
            continue;
        }
        const cleanUrl = safeHttpUrl(decodeEntities(url));
        if (!cleanUrl) continue;
        if (requireImageType) {
            const isImageType = type.startsWith('image/');
            const hasImageExt = /\.(?:jpe?g|png|webp|gif|avif|bmp|svg)(?:$|[?#])/i.test(cleanUrl);
            if (!isImageType && !hasImageExt) continue;
        }
        return cleanUrl;
    }
    return null;
}

export function extractImage(item) {
    if (!item || typeof item !== 'object') return FALLBACK_IMAGE;
    let img =
        firstImageCandidate(item.mediaContent) ||
        firstImageCandidate(item.mediaThumbnail) ||
        firstImageCandidate(item.enclosure, { requireImageType: true }) ||
        firstImageCandidate(item.image);

    if (!img) {
        const content = rssText(item.content) || rssText(item['content:encoded']) || rssText(item.summary) || rssText(item.description);
        const imgMatch = content.match(/<img\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1/i);
        if (imgMatch && imgMatch[2]) {
            const candidate = safeHttpUrl(decodeEntities(imgMatch[2]));
            if (candidate) img = candidate;
        }
    }

    return upgradeImageUrl(img);
}

export function countryDir(code, baseDir = COUNTRY_DATA_DIR) {
    const normalized = String(code || '');
    if (!/^[A-Z]{2}$/.test(normalized)) {
        throw new Error(`Invalid country code: ${code}`);
    }
    return path.join(baseDir, normalized);
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
        country: country.code,
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
        country: country.code,
        tier: 1,
        homepage: true,
        itemLimit: 40
    };
    const topics = GOOGLE_TOPICS.map(topic => ({
        url: `https://news.google.com/rss/headlines/section/topic/${topic.topic}?hl=${hl}&gl=${country.gl}&ceid=${ceid}`,
        category: topic.category,
        source: `Google News ${country.code} ${topic.category}`,
        country: country.code,
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

function noRetryError(message) {
    const err = new Error(message);
    err.noRetry = true;
    return err;
}

function assertValidFeedTarget(targetUrl, expectedCountry) {
    if (!isSafePublicUrl(targetUrl)) {
        throw noRetryError(`Unsafe feed URL blocked: ${targetUrl}`);
    }
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === 'news.google.com' || host.endsWith('.news.google.com')) {
        if (parsed.pathname === '/home' || parsed.pathname.startsWith('/home/')) {
            throw noRetryError('Google News redirected to /home');
        }
        if (expectedCountry && String(expectedCountry).toUpperCase() !== 'US') {
            const gl = parsed.searchParams.get('gl');
            if (gl && gl.toUpperCase() === 'US') {
                throw noRetryError(`Google News silently redirected ${expectedCountry} feed to gl=US`);
            }
        }
    }
}

async function readTextWithLimit(response, maxBytes) {
    const contentLength = Number(response.headers?.get?.('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        await response.body?.cancel?.().catch(() => {});
        throw noRetryError(`Feed exceeds ${maxBytes} byte limit`);
    }
    if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks = [];
        let total = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                total += value.byteLength;
                if (total > maxBytes) {
                    await reader.cancel().catch(() => {});
                    throw noRetryError(`Feed exceeds ${maxBytes} byte limit`);
                }
                chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
            }
        } finally {
            reader.releaseLock?.();
        }
        return Buffer.concat(chunks).toString('utf8');
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        throw noRetryError(`Feed exceeds ${maxBytes} byte limit`);
    }
    return text;
}

export async function parseFeed(url, {
    expectedCountry,
    maxAttempts = 4,
    retryBaseMs = 800,
    maxBytes = MAX_FEED_BYTES
} = {}) {
    assertValidFeedTarget(url, expectedCountry);
    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            let currentUrl = url;
            let response;
            for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
                response = await fetch(currentUrl, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml'
                    },
                    redirect: 'manual',
                    signal: AbortSignal.timeout(FEED_TIMEOUT_MS)
                });
                if (response.status >= 300 && response.status < 400) {
                    const location = response.headers?.get?.('location');
                    await response.body?.cancel?.().catch(() => {});
                    if (!location) throw noRetryError(`HTTP ${response.status} redirect missing Location`);
                    if (hop >= MAX_REDIRECTS) throw noRetryError(`Too many redirects (> ${MAX_REDIRECTS})`);
                    currentUrl = new URL(location, currentUrl).href;
                    assertValidFeedTarget(currentUrl, expectedCountry);
                    continue;
                }
                break;
            }

            if (response.url) {
                assertValidFeedTarget(response.url, expectedCountry);
            }

            if (response.status === 429 || response.status >= 500) {
                await response.body?.cancel?.().catch(() => {});
                lastError = new Error(`HTTP ${response.status}`);
                if (attempt < maxAttempts - 1) {
                    await sleep(retryBaseMs * 2 ** attempt);
                    continue;
                }
                throw lastError;
            }

            if (!response.ok) {
                await response.body?.cancel?.().catch(() => {});
                throw noRetryError(`HTTP ${response.status}`);
            }

            const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
            if (
                contentType.includes('text/html') ||
                contentType.includes('application/xhtml') ||
                (contentType && !/(xml|rss|atom|text\/plain)/i.test(contentType))
            ) {
                await response.body?.cancel?.().catch(() => {});
                throw noRetryError(`Unexpected Content-Type: ${contentType}`);
            }

            const rawText = await readTextWithLimit(response, maxBytes);
            if (/^\s*(?:<!doctype\s+html|<html[\s>])/i.test(rawText)) {
                throw noRetryError('Received HTML document instead of RSS/XML');
            }
            return parser.parseString(sanitizeRss(rawText));
        } catch (error) {
            lastError = error;
            if (error.noRetry || attempt === maxAttempts - 1 || /HTTP (4\d\d)/.test(error.message)) {
                throw error;
            }
            await sleep(retryBaseMs * 2 ** attempt);
        }
    }
    throw lastError;
}

function inferExpectedCountry(feed) {
    if (feed.country) return feed.country;
    try {
        const parsed = new URL(feed.url);
        if (parsed.hostname.includes('news.google.com')) {
            return parsed.searchParams.get('gl') || undefined;
        }
    } catch {
        // Ignore URL parse error here; parseFeed will reject it.
    }
    return undefined;
}

export async function fetchFeedArticles(feed) {
    try {
        const parsed = await parseFeed(feed.url, { expectedCountry: inferExpectedCountry(feed) });
        const itemLimit = Number(feed.itemLimit) || (Number(feed.tier) === 1 ? 12 : 8);
        const articles = [];
        for (const item of (parsed.items || []).slice(0, itemLimit)) {
            try {
                const publishedAt = rssDate(item.isoDate || item.pubDate);
                if (publishedAt === null) continue;

                const img = extractImage(item);
                const rawTitle = decodeEntities(rssText(item.title));
                const link = safeHttpUrl(rssText(item.link)) || safeHttpUrl(rssText(item.guid));
                if (!rawTitle || !link) continue;

                let source = feed.source;
                let title = rawTitle;

                if (/google\s*news/i.test(feed.source)) {
                    const itemSource = decodeEntities(rssText(item.source));
                    const parsedTitle = publisherFromTitle(rawTitle);
                    source = (itemSource && !/google\s*news/i.test(itemSource)) ? itemSource : (parsedTitle.source || feed.source);
                    if (parsedTitle.title) {
                        title = parsedTitle.title;
                    }
                }
                title = title.replace(/\[(?:Image|Photo) \d+ of \d+\]/gi, '').trim();
                if (!title) continue;

                const description = decodeEntities(rssText(item.contentSnippet)).substring(0, 200);
                const id = `rss-${crypto.createHash('md5').update(link).digest('hex').substring(0, 12)}`;
                articles.push({
                    id,
                    title,
                    description,
                    url: link,
                    image: img || FALLBACK_IMAGE,
                    source,
                    category: feed.category,
                    feedCategory: feed.category,
                    feedTier: feed.tier,
                    feedHomepage: feed.homepage === true,
                    rssCategories: rssCategoriesFromItem(item),
                    publishedAt
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

function isLegacyPoisonedArticle(article) {
    const url = String(article?.url || '');
    return /^https?:\/\/(?:[^/]+\.)?cnn\.(?:com|it)\/.*(?:04-03-23|411KYN7|\/audio\/podcasts\/)/i.test(url);
}

function isGoogleNewsUrl(url) {
    try {
        const host = new URL(String(url || '')).hostname.toLowerCase();
        return host === 'news.google.com' || host.endsWith('.news.google.com');
    } catch {
        return false;
    }
}

export function uniqueArticles(articles, feedBySource = new Map()) {
    const merged = articles
        .map(article => {
            const feed = feedBySource.get(article.source) || {
                category: article.feedCategory || article.category,
                tier: article.feedTier ?? article.tier,
                homepage: article.feedHomepage ?? (Number(article.tier) === 1 && article.trending === true)
            };
            const applied = applyFeedPolicy(article, feed);
            let finalSource = article.source || applied.source;
            let finalTitle = applied.title;
            if (/google\s*news/i.test(finalSource)) {
                const parsed = publisherFromTitle(finalTitle);
                if (parsed.source) {
                    finalSource = parsed.source;
                    finalTitle = parsed.title;
                }
            }
            return { ...applied, title: finalTitle, source: finalSource };
        })
        .sort((a, b) => {
            const timeA = Date.parse(a.publishedAt || '');
            const timeB = Date.parse(b.publishedAt || '');
            const safeA = Number.isFinite(timeA) ? timeA : 0;
            const safeB = Number.isFinite(timeB) ? timeB : 0;
            if (safeB !== safeA) return safeB - safeA;

            const tierDiff = (Number(a.tier) || 2) - (Number(b.tier) || 2);
            if (tierDiff !== 0) return tierDiff;

            const aGoogle = isGoogleNewsUrl(a.url) ? 1 : 0;
            const bGoogle = isGoogleNewsUrl(b.url) ? 1 : 0;
            if (aGoogle !== bGoogle) return aGoogle - bGoogle;

            const aFallback = (!a.image || a.image === FALLBACK_IMAGE) ? 1 : 0;
            const bFallback = (!b.image || b.image === FALLBACK_IMAGE) ? 1 : 0;
            if (aFallback !== bFallback) return aFallback - bFallback;

            return String(a.url || '').localeCompare(String(b.url || ''));
        });

    const seenTitles = new Set();
    const seenUrls = new Set();
    const unique = [];
    for (const article of merged) {
        if (!article.title || !safeHttpUrl(article.url)) continue;
        const titleLower = article.title.toLowerCase().trim();
        const urlLower = article.url.toLowerCase().trim();
        if (seenTitles.has(titleLower) || seenUrls.has(urlLower)) continue;
        seenTitles.add(titleLower);
        seenUrls.add(urlLower);
        unique.push(article);
    }
    return unique.filter(article => !isPromoArticle(article) && !isLegacyPoisonedArticle(article));
}

export async function loadExisting(code, { remote = true, baseDir = COUNTRY_DATA_DIR } = {}) {
    const map = new Map();
    let remoteChunks = [];
    const remoteShardCounts = Object.create(null);
    const local = countryDir(code, baseDir);
    if (fs.existsSync(local)) {
        for (const file of fs.readdirSync(local).filter(name => /^news-\d{4}-\d{2}\.json$/.test(name))) {
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
        const candidateChunks = (remoteMeta?.chunks || []).filter(name => SHARD_NAME_RE.test(name));
        const hasCounts = Boolean(remoteMeta?.shardCounts && typeof remoteMeta.shardCounts === 'object');
        if (hasCounts) {
            for (const [k, v] of Object.entries(remoteMeta.shardCounts)) {
                if (SHARD_NAME_RE.test(k) && Number.isFinite(Number(v))) {
                    remoteShardCounts[k] = Number(v);
                }
            }
        }
        const ghostChunks = new Set();
        const recentSet = new Set(candidateChunks.slice(0, 2));
        for (const chunk of candidateChunks) {
            const needsCountAudit = remoteShardCounts[chunk] === undefined;
            if (!recentSet.has(chunk) && !needsCountAudit) continue;
            const remoteShard = await r2GetJson(`c/${code}/${chunk}.json`);
            if (remoteShard === null) {
                ghostChunks.add(chunk);
                delete remoteShardCounts[chunk];
                continue;
            }
            const articles = Array.isArray(remoteShard?.articles) ? remoteShard.articles : [];
            if (recentSet.has(chunk)) {
                articles.forEach(article => map.set(article.id, article));
            } else {
                remoteShardCounts[chunk] = articles.length;
            }
        }
        remoteChunks = candidateChunks.filter(chunk => !ghostChunks.has(chunk));
    }
    return { map, remoteChunks, remoteShardCounts };
}

export function writeCountry(code, articles, remoteChunks = [], { replaceShards = false, remoteShardCounts = {}, baseDir = COUNTRY_DATA_DIR } = {}) {
    const chunks = new Map();
    articles.forEach(article => {
        const monthKey = `news-${String(article.publishedAt || '').substring(0, 7)}`;
        if (!SHARD_NAME_RE.test(monthKey)) return;
        if (!chunks.has(monthKey)) chunks.set(monthKey, []);
        chunks.get(monthKey).push(article);
    });
    const writtenNames = [...chunks.keys()].sort().reverse();
    const validRemoteChunks = (replaceShards ? [] : remoteChunks).filter(name => SHARD_NAME_RE.test(name));
    const chunkNames = [...new Set([...writtenNames, ...validRemoteChunks])]
        .filter(name => SHARD_NAME_RE.test(name))
        .sort()
        .reverse();
    const dir = countryDir(code, baseDir);
    fs.mkdirSync(dir, { recursive: true });

    const written = [];
    writtenNames.forEach(chunkName => {
        const chunkArticles = chunks.get(chunkName);
        const payload = {
            lastUpdated: new Date().toISOString(),
            count: chunkArticles.length,
            articles: chunkArticles
        };
        writeJsonAtomic(path.join(dir, `${chunkName}.json`), payload);
        written.push({ chunkName, payload });
    });

    if (replaceShards && fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir).filter(file => /^news-\d{4}-\d{2}\.json$/.test(file))) {
            const key = name.replace(/\.json$/, '');
            if (!chunks.has(key)) fs.unlinkSync(path.join(dir, name));
        }
    }

    const shardCountsMap = Object.create(null);
    let totalArticles = 0;
    for (const chunkName of chunkNames) {
        let count;
        if (chunks.has(chunkName)) {
            count = chunks.get(chunkName).length;
        } else if (!replaceShards && Number.isFinite(Number(remoteShardCounts?.[chunkName]))) {
            count = Number(remoteShardCounts[chunkName]);
        }
        if (count !== undefined) {
            shardCountsMap[chunkName] = count;
            totalArticles += count;
        }
    }

    const metadata = {
        latest: chunkNames[0] || null,
        chunks: chunkNames,
        shardCounts: { ...shardCountsMap },
        totalArticles,
        country: code
    };
    writeJsonAtomic(path.join(dir, 'metadata.json'), metadata);
    return { metadata, written };
}

export async function mergeAndSave(country, extraFeeds, incoming, {
    remote = true,
    upload = false,
    windowDays = 0,
    replaceShards = false,
    baseDir = COUNTRY_DATA_DIR
} = {}) {
    const feedBySource = new Map([
        ...googleNewsFeeds(country).map(feed => [feed.source, feed]),
        ...extraFeeds.map(feed => [feed.source, feed])
    ]);
    const { map: existing, remoteChunks, remoteShardCounts } = await loadExisting(country.code, { remote, baseDir });
    incoming.forEach(article => existing.set(article.id, article));
    let unique = uniqueArticles([...existing.values()], feedBySource);
    if (windowDays) {
        unique = unique.filter(article => isRecentArticle(article.publishedAt, windowDays));
    }
    const { metadata, written } = writeCountry(
        country.code,
        unique,
        replaceShards ? [] : remoteChunks,
        { replaceShards, remoteShardCounts, baseDir }
    );
    if (upload && r2Configured()) {
        await r2PutJson(`c/${country.code}/metadata.json`, metadata);
        for (const shard of written) {
            await r2PutJson(`c/${country.code}/${shard.chunkName}.json`, shard.payload);
        }
    }
    return { unique, metadata };
}
