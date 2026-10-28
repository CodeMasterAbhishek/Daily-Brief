/**
 * API module for country-partitioned news archives.
 */

const LOCAL_DATA = 'data';
const COUNTRY_KEY = 'dailyBriefCountry';

export let currentMetadata = null;
export let currentCountry = 'US';
export let countries = [];

let dataBase = `${LOCAL_DATA}/c/US`;

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

async function storageBase() {
    try {
        const response = await fetch(`${LOCAL_DATA}/storage.json?t=${Date.now()}`);
        if (!response.ok) return '';
        const data = await response.json();
        return String(data.base || '').replace(/\/$/, '');
    } catch {
        return '';
    }
}

function countryBase(code, r2Base) {
    if (code === 'US' || !r2Base) return `${LOCAL_DATA}/c/${code}`;
    return `${r2Base}/c/${code}`;
}

async function parseTraceCountry(url, knownCodes) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('trace failed');
    const text = await response.text();
    const loc = text.match(/^loc=([A-Z]{2})$/m)?.[1];
    if (!loc || loc === 'XX' || loc === 'T1' || !knownCodes.has(loc)) {
        throw new Error('no country');
    }
    return loc;
}

export async function detectCountry(knownCodes) {
    const saved = localStorage.getItem(COUNTRY_KEY);
    if (saved && knownCodes.has(saved)) return saved;

    const traces = [
        '/cdn-cgi/trace',
        'https://www.cloudflare.com/cdn-cgi/trace',
        'https://one.one.one.one/cdn-cgi/trace'
    ];
    for (const url of traces) {
        try {
            return await parseTraceCountry(url, knownCodes);
        } catch {
            // Try the next geo source.
        }
    }

    const locale = Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || '';
    const region = String(locale.split(/[-_]/)[1] || '').toUpperCase();
    if (knownCodes.has(region)) return region;
    return 'US';
}

export function rememberCountry(code) {
    localStorage.setItem(COUNTRY_KEY, code);
    currentCountry = code;
}

export function forgetCountry() {
    localStorage.removeItem(COUNTRY_KEY);
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
        console.error('Could not fetch metadata:', error);
        if (r2Base && code === 'US') {
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
        currentMetadata = { latest: null, chunks: [], country: code };
        return currentMetadata;
    }
}

export async function fetchChunkData(chunkName) {
    try {
        const response = await fetch(`${dataBase}/${chunkName}.json?t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.articles || [];
    } catch (error) {
        console.error(`Could not fetch chunk ${chunkName}:`, error);
        return [];
    }
}
