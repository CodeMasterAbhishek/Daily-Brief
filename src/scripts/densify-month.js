import fs from 'fs';
import path from 'path';
import {
    FEEDS_FILE,
    COUNTRIES_FILE,
    DATA_DIR,
    loadDotEnv,
    googleNewsFeeds,
    googleNewsSiteWeekFeed,
    googleNewsWeekFallbackFeed,
    weekWindows,
    fetchFeedArticles,
    mergeAndSave,
    writeJsonAtomic,
    mapPool
} from './rss-core.js';
import { filterNewsArticles, qualityDomainsFor } from './quality.js';
import { writeQualityPublishers } from './export-publishers.js';

const STATUS_FILE = path.join(DATA_DIR, 'densify-status.json');
const DAYS = Math.max(7, Number(process.env.BACKFILL_DAYS || 32));
const CONCURRENCY = Math.max(1, Number(process.env.BACKFILL_CONCURRENCY || 2));
const DELAY_MS = Math.max(0, Number(process.env.BACKFILL_DELAY_MS || 350));
const DOMAIN_LIMIT = Math.max(1, Number(process.env.DENSIFY_DOMAINS || 5));

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadStatus() {
    try {
        return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    } catch {
        return { done: [], counts: {}, days: {}, startedAt: new Date().toISOString() };
    }
}

function saveStatus(status) {
    writeJsonAtomic(STATUS_FILE, status);
}

async function densifyCountry(country, extraFeeds, windows) {
    const taggedExtras = (extraFeeds || []).map(feed => ({ ...feed, country: country.code }));
    const extraQuality = taggedExtras.map(feed => feed.source);
    const incoming = [];
    const domains = qualityDomainsFor(country.code, DOMAIN_LIMIT);

    for (const window of windows) {
        const weekBatch = [];
        for (const domain of domains) {
            weekBatch.push(...await fetchFeedArticles(
                googleNewsSiteWeekFeed(country, domain, window.start, window.endExclusive)
            ));
            await sleep(DELAY_MS);
        }
        if (weekBatch.length < 10) {
            weekBatch.push(...await fetchFeedArticles(
                googleNewsWeekFallbackFeed(country, window.start, window.endExclusive)
            ));
            await sleep(DELAY_MS);
        }
        incoming.push(...filterNewsArticles(weekBatch, country.code, {
            extraQuality,
            minKeep: 8,
            maxKeep: 220,
            windowDays: DAYS
        }));
    }

    const live = await mapPool(googleNewsFeeds(country), 4, fetchFeedArticles);
    incoming.push(...filterNewsArticles(live.flat(), country.code, {
        extraQuality,
        minKeep: 8,
        maxKeep: 80,
        windowDays: DAYS
    }));

    if (taggedExtras.length) {
        const extras = await mapPool(taggedExtras, 4, fetchFeedArticles);
        incoming.push(...filterNewsArticles(extras.flat(), country.code, {
            extraQuality,
            minKeep: 0,
            maxKeep: 400,
            windowDays: country.code === 'US' ? 0 : DAYS
        }));
    }

    const prune = country.code !== 'US';
    const { unique, metadata } = await mergeAndSave(country, taggedExtras, incoming, {
        remote: false,
        upload: false,
        windowDays: prune ? DAYS : 0,
        replaceShards: prune
    });
    const daysCovered = new Set(
        unique
            .map(article => String(article.publishedAt || '').slice(0, 10))
            .filter(day => day)
    ).size;
    console.log(`${country.code} ${country.name}: ${unique.length} kept, ${daysCovered} days, ${metadata.chunks.length} months`);
    return { kept: unique.length, daysCovered };
}

async function run() {
    loadDotEnv();
    const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
    const extraByCountry = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf8'));
    const requested = String(process.env.FETCH_COUNTRIES || '')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean);
    if (!requested.length) {
        writeQualityPublishers(countries);
    }
    const selected = requested.length
        ? countries.filter(country => requested.includes(country.code))
        : countries;
    const windows = weekWindows(DAYS, 7);
    const status = loadStatus();
    const remaining = selected.filter(country => !status.done.includes(country.code));
    console.log(`[${new Date().toISOString()}] Densify ${remaining.length}/${selected.length} countries, ${DAYS} days, ${windows.length} weeks, concurrency ${CONCURRENCY}`);

    await mapPool(remaining, CONCURRENCY, async (country) => {
        try {
            const { kept, daysCovered } = await densifyCountry(
                country,
                extraByCountry[country.code] || [],
                windows
            );
            if (!status.done.includes(country.code)) status.done.push(country.code);
            status.counts = status.counts || {};
            status.days = status.days || {};
            status.counts[country.code] = kept;
            status.days[country.code] = daysCovered;
            status.updatedAt = new Date().toISOString();
            saveStatus(status);
        } catch (error) {
            console.error(`${country.code} failed: ${error.message}`);
        }
    });

    console.log(`[${new Date().toISOString()}] Densify finished. ${status.done.length} countries on disk.`);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
