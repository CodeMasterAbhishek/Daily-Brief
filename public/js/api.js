/**
 * API module for country-partitioned news archives.
 */

const LOCAL_DATA = 'data';
const COUNTRY_KEY = 'dailyBriefCountry';
const ALLOWED_R2_HOST = 'pub-80d5b317212242cab2851c0cd4fe7b89.r2.dev';
const CHUNK_NAME_PATTERN = /^news-\d{4}-\d{2}$/;

export let currentMetadata = null;
export let currentCountry = 'US';
export let countries = [];

let dataBase = `${LOCAL_DATA}/c/US`;
export const TIMEZONE_COUNTRY = {
    'Asia/Calcutta': 'IN', 'Asia/Kolkata': 'IN',
    'Europe/London': 'GB',
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Los_Angeles': 'US',
    'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Detroit': 'US',
    'America/Indianapolis': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Montreal': 'CA',
    'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
    'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU',
    'Australia/Darwin': 'AU',
    'Asia/Tokyo': 'JP', 'Asia/Singapore': 'SG', 'Asia/Dubai': 'AE',
    'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK',
    'Asia/Kathmandu': 'NP', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID',
    'Asia/Seoul': 'KR', 'Asia/Manila': 'PH', 'Asia/Kuala_Lumpur': 'MY',
    'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
    'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'CN', 'Asia/Taipei': 'CN',
    'Asia/Jerusalem': 'IL',
    'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT',
    'Europe/Madrid': 'ES', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
    'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE',
    'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
    'Europe/Warsaw': 'PL', 'Europe/Athens': 'GR', 'Europe/Lisbon': 'PT',
    'Europe/Dublin': 'IE', 'Europe/Moscow': 'RU', 'Europe/Istanbul': 'TR',
    'Pacific/Auckland': 'NZ', 'America/Sao_Paulo': 'BR',
    'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG',
    'America/Mexico_City': 'MX', 'America/Buenos_Aires': 'AR',
    'America/Bogota': 'CO', 'America/Santiago': 'CL', 'America/Lima': 'PE'
};

function isKnownCode(code, knownCodes) {
    return Boolean(code && (!knownCodes || knownCodes.has(code)));
}

export function detectFromTimezone(knownCodes) {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && TIMEZONE_COUNTRY[tz] && isKnownCode(TIMEZONE_COUNTRY[tz], knownCodes)) {
            return TIMEZONE_COUNTRY[tz];
        }
    } catch {}
    return null;
}

export function detectFromLocale(knownCodes) {
    try {
        const locale = Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || '';
        let region = '';
        if (typeof Intl.Locale === 'function' && locale) {
            try {
                region = (new Intl.Locale(locale).region || '').toUpperCase();
            } catch {}
        }
        if (!region && locale) {
            const subtag = locale.split(/[-_]/).slice(1).find(part => /^[A-Za-z]{2}$/.test(part));
            region = subtag ? subtag.toUpperCase() : '';
        }
        if (isKnownCode(region, knownCodes)) {
            return region;
        }
    } catch {}
    return null;
}

export function flagEmoji(code) {
    return String(code || '')
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 2)
        .split('')
        .map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0)))
        .join('');
}

export function countryByCode(code) {
    return countries.find(country => country.code === code) || null;
}

export async function loadCountries() {
    const response = await fetch(`${LOCAL_DATA}/countries.json`);
    if (!response.ok) throw new Error(`Could not load countries (${response.status})`);
    countries = await response.json();
    return countries;
}

function validateR2Base(raw) {
    try {
        const url = new URL(String(raw || '').trim());
        if (url.protocol !== 'https:') return '';
        if (url.hostname !== ALLOWED_R2_HOST && !url.hostname.endsWith('.r2.dev')) return '';
        return `${url.origin}${url.pathname}`.replace(/\/$/, '');
    } catch {
        return '';
    }
}

async function storageBase() {
    try {
        const response = await fetch(`${LOCAL_DATA}/storage.json?t=${Date.now()}`);
        if (!response.ok) return '';
        const data = await response.json();
        return validateR2Base(data?.base);
    } catch {
        return '';
    }
}

function countryBase(code, r2Base) {
    if (!r2Base) return `${LOCAL_DATA}/c/${code}`;
    return `${r2Base}/c/${code}`;
}

async function parseTraceCountry(url, knownCodes, timeoutMs = 1200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error('trace failed');
        const text = await response.text();
        const loc = text.match(/^loc=([A-Z]{2})$/m)?.[1];
        if (!loc || loc === 'XX' || loc === 'T1' || !isKnownCode(loc, knownCodes)) {
            throw new Error('no country');
        }
        return loc;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

export async function detectCountry(knownCodes) {
    // 1. Saved user selection (read-only)
    try {
        const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(COUNTRY_KEY) : null;
        if (isKnownCode(saved, knownCodes)) {
            currentCountry = saved;
            return saved;
        }
    } catch {}

    // 2. Pre-computed detection from preload.js (validated against knownCodes)
    if (typeof window !== 'undefined' && isKnownCode(window.__INITIAL_COUNTRY__, knownCodes)) {
        currentCountry = window.__INITIAL_COUNTRY__;
        return window.__INITIAL_COUNTRY__;
    }

    // 3. Browser timezone detection
    const fromTz = detectFromTimezone(knownCodes);
    if (fromTz) {
        currentCountry = fromTz;
        return fromTz;
    }

    // 4. Browser locale detection
    const fromLocale = detectFromLocale(knownCodes);
    if (fromLocale) {
        currentCountry = fromLocale;
        return fromLocale;
    }

    // 5. External Cloudflare trace endpoints (no same-origin /cdn-cgi/trace 404)
    const traces = [
        'https://www.cloudflare.com/cdn-cgi/trace',
        'https://one.one.one.one/cdn-cgi/trace'
    ];
    try {
        const traceResult = await Promise.any(traces.map(url => parseTraceCountry(url, knownCodes, 1200)));
        if (isKnownCode(traceResult, knownCodes)) {
            currentCountry = traceResult;
            return traceResult;
        }
    } catch {}

    currentCountry = 'US';
    return 'US';
}

export function rememberCountry(code) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(COUNTRY_KEY, code);
        }
    } catch {}
    currentCountry = code;
}

export function forgetCountry() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(COUNTRY_KEY);
        }
    } catch {}
}

export async function initMetadata(code = currentCountry) {
    currentCountry = code;
    const r2Base = await storageBase();
    dataBase = countryBase(code, r2Base);
    try {
        const response = await fetch(`${dataBase}/metadata.json?t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        currentMetadata = await response.json();
        return currentMetadata;
    } catch (error) {
        if (r2Base && dataBase.startsWith(r2Base)) {
            dataBase = countryBase(code, '');
            try {
                const response = await fetch(`${dataBase}/metadata.json?t=${Date.now()}`);
                if (response.ok) {
                    currentMetadata = await response.json();
                    return currentMetadata;
                }
            } catch {
                // Fall through to empty metadata.
            }
        }
        console.error('Could not fetch metadata:', error);
        currentMetadata = { latest: null, chunks: [], country: code };
        return currentMetadata;
    }
}

export async function fetchChunkData(chunkName) {
    if (typeof chunkName !== 'string' || !CHUNK_NAME_PATTERN.test(chunkName)) {
        console.warn(`Rejected invalid chunk name: ${chunkName}`);
        return [];
    }
    try {
        const response = await fetch(`${dataBase}/${chunkName}.json?t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return Array.isArray(data.articles) ? data.articles : [];
    } catch (error) {
        console.error(`Could not fetch chunk ${chunkName}:`, error);
        return [];
    }
}
