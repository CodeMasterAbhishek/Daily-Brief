import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COUNTRIES_FILE, DATA_DIR, writeJsonAtomic } from './rss-core.js';
import { COUNTRY_QUALITY, GLOBAL_QUALITY, COUNTRY_DOMAINS, GLOBAL_QUALITY_DOMAINS } from './quality.js';

const STOP_WORDS = new Set(['the', 'of', 'and', 'de', 'la', 'el', 'le', 'les', 'di', 'da', 'do', 'du', 'al', 'der', 'die', 'das']);
const GENERIC_WORDS = new Set(['daily', 'times', 'news', 'national', 'sunday', 'radio', 'observer', 'herald', 'tribune']);

function normalizePublisherText(value) {
    return String(value || '')
        .replace(/ä/gi, 'ae')
        .replace(/ö/gi, 'oe')
        .replace(/ü/gi, 'ue')
        .replace(/ß/g, 'ss')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/['’`]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function scoreDomainMatch(publisherName, domain, isLocal) {
    const clean = normalizePublisherText(publisherName);
    if (!clean) return 0;
    const compact = clean.replace(/\s+/g, '');
    const words = clean.split(' ').filter(Boolean);
    const sigWords = words.filter(word => !STOP_WORDS.has(word));
    const sigCompact = sigWords.join('');
    const initialsAll = words.map(word => word[0]).join('');
    const initialsSig = sigWords.map(word => word[0]).join('');

    const fullDomain = String(domain || '').toLowerCase();
    const parts = fullDomain.split('.');
    const first = parts[0] || '';
    const second = parts[1] || '';
    const label = first === 'news' && second ? second : first;
    const firstClean = first.replace(/[^a-z0-9]/g, '');
    const labelClean = label.replace(/[^a-z0-9]/g, '');

    if (publisherName.toLowerCase().includes(fullDomain)) return 100;
    if (compact === firstClean || compact === labelClean) return 95;
    if (sigCompact && (sigCompact === firstClean || sigCompact === labelClean)) return 92;

    if (words.length >= 2 && words[0].length >= 2 && (words[0] === firstClean || words[0] === labelClean)) {
        if (!STOP_WORDS.has(words[0]) && !GENERIC_WORDS.has(words[0])) return 85;
    }
    if (sigWords.length >= 1 && sigWords[0].length >= 4 && (sigWords[0] === firstClean || sigWords[0] === labelClean)) {
        if (!GENERIC_WORDS.has(sigWords[0])) return 82;
    }

    if (compact.length >= 3 && [`${compact}news`, `${compact}online`, `${compact}ng`, `${compact}info`].includes(firstClean)) {
        return 80;
    }
    if (isLocal && compact.length >= 3 && (firstClean.startsWith(compact) || labelClean.startsWith(compact))) {
        return 76;
    }
    if (compact.length >= 5 && firstClean.length >= 5 && (firstClean.includes(compact) || (words.length === 1 && compact.includes(firstClean)))) {
        return 74;
    }

    if (initialsAll.length >= 3 && [initialsAll, `${initialsAll}news`, `${initialsAll}online`].includes(firstClean)) {
        return 72;
    }
    if (initialsSig.length >= 3 && [initialsSig, `${initialsSig}news`, `${initialsSig}online`].includes(firstClean)) {
        return 70;
    }
    if (isLocal && initialsSig.length === 2 && (firstClean === initialsSig || firstClean === `${initialsSig}news`)) {
        return 68;
    }

    if (sigWords.length >= 2) {
        const prefixInitsLast = sigWords.slice(0, -1).map(word => word[0]).join('') + sigWords[sigWords.length - 1];
        if (firstClean === prefixInitsLast) return 75;
        if (sigWords.every(word => word.length >= 3 && firstClean.includes(word))) return 70;
        if (isLocal) {
            const firstTwo = `${sigWords[0]}${sigWords[1].slice(0, 2)}`;
            if (sigWords[0].length >= 4 && firstClean.startsWith(firstTwo)) return 67;
            if (sigWords[0].length >= 4 && sigWords[1].startsWith('televisi') && firstClean.includes(sigWords[0]) && firstClean.includes('tv')) return 67;
            const last = sigWords[sigWords.length - 1];
            if (last.length >= 4 && (firstClean === `the${last}` || firstClean === `${last}news`)) return 65;
        }
    }

    return 0;
}

export function matchPublisherDomain(publisherName, localDomains = [], globalDomains = GLOBAL_QUALITY_DOMAINS) {
    let best = null;
    let bestScore = 0;

    for (const domain of localDomains) {
        const score = scoreDomainMatch(publisherName, domain, true);
        if (score >= 65 && score + 1 > bestScore) {
            bestScore = score + 1;
            best = domain;
        }
    }
    if (best) return best;

    for (const domain of globalDomains) {
        const score = scoreDomainMatch(publisherName, domain, false);
        if (score >= 65 && score > bestScore) {
            bestScore = score;
            best = domain;
        }
    }
    return best;
}

export function buildQualityPublishers(countries) {
    const byCode = Object.fromEntries(countries.map(country => [country.code, country]));
    const list = {};
    for (const [code, publishers] of Object.entries(COUNTRY_QUALITY)) {
        const country = byCode[code];
        const domains = COUNTRY_DOMAINS[code] || [];
        list[code] = {
            name: country?.name || code,
            language: country?.englishFallback ? 'en' : country?.language || 'en',
            publishers: publishers.map(name => ({
                name,
                domain: matchPublisherDomain(name, domains, GLOBAL_QUALITY_DOMAINS)
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
    writeJsonAtomic(file, payload);
    return file;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
    const file = writeQualityPublishers(countries);
    console.log(`Wrote ${file} (${Object.keys(COUNTRY_QUALITY).length} countries)`);
}
