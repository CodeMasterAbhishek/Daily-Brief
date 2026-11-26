import fs from 'fs';
import path from 'path';
import {
    FEEDS_FILE,
    COUNTRIES_FILE,
    DATA_DIR,
    loadDotEnv,
    googleNewsFeeds,
    googleNewsDayFeed,
    googleNewsFallbackDayFeed,
    recentDays,
    fetchFeedArticles,
    mergeAndSave,
    writeJsonAtomic,
    mapPool
} from './rss-core.js';
import { filterNewsArticles } from './quality.js';

const STATUS_FILE = path.join(DATA_DIR, 'backfill-status.json');
const DAYS = Math.max(1, Number(process.env.BACKFILL_DAYS || 30));
const CONCURRENCY = Math.max(1, Number(process.env.BACKFILL_CONCURRENCY || 2));
const DELAY_MS = Math.max(0, Number(process.env.BACKFILL_DELAY_MS || 400));

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadStatus() {
    try {
        return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    } catch {
        return { done: [], counts: {}, startedAt: new Date().toISOString() };
    }
}

function saveStatus(status) {
    writeJsonAtomic(STATUS_FILE, status);
}

async function backfillCountry(country, extraFeeds, days) {
    const taggedExtras = (extraFeeds || []).map(feed => ({ ...feed, country: country.code }));
    const extraQuality = taggedExtras.map(feed => feed.source);
    const incoming = [];
    for (const day of days) {
        let batch = await fetchFeedArticles(googleNewsDayFeed(country, day));
        if (batch.length < 8) {
            batch = [...batch, ...await fetchFeedArticles(googleNewsFallbackDayFeed(country, day))];
        }
        incoming.push(...filterNewsArticles(batch, country.code, {
            extraQuality,
            minKeep: 6,
            maxKeep: 40
        }));
        await sleep(DELAY_MS);
    }
    const live = await mapPool(googleNewsFeeds(country), 4, fetchFeedArticles);
    incoming.push(...filterNewsArticles(live.flat(), country.code, {
        extraQuality,
        minKeep: 8,
        maxKeep: 80
    }));
    if (taggedExtras.length) {
        const extras = await mapPool(taggedExtras, 4, fetchFeedArticles);
        incoming.push(...extras.flat());
    }
    const { unique, metadata } = await mergeAndSave(country, taggedExtras, incoming, {
        remote: false,
        upload: false
    });
    const daysCovered = new Set(unique.map(article => String(article.publishedAt || '').slice(0, 10))).size;
    console.log(`${country.code} ${country.name}: ${unique.length} kept, ${daysCovered} days, ${metadata.chunks.length} months`);
    return unique.length;
}

async function run() {
    loadDotEnv();
    const countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
    const extraByCountry = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf8'));
    const requested = String(process.env.FETCH_COUNTRIES || '')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean);
    const selected = requested.length
        ? countries.filter(country => requested.includes(country.code))
        : countries;
    const days = recentDays(DAYS);
    const status = loadStatus();
    const remaining = selected.filter(country => !status.done.includes(country.code));
    console.log(`[${new Date().toISOString()}] Backfill ${remaining.length}/${selected.length} countries, ${DAYS} days, concurrency ${CONCURRENCY}`);

    await mapPool(remaining, CONCURRENCY, async (country) => {
        try {
            const kept = await backfillCountry(country, extraByCountry[country.code] || [], days);
            if (!status.done.includes(country.code)) status.done.push(country.code);
            status.counts = status.counts || {};
            status.counts[country.code] = kept;
            status.updatedAt = new Date().toISOString();
            saveStatus(status);
        } catch (error) {
            console.error(`${country.code} failed: ${error.message}`);
        }
    });

    console.log(`[${new Date().toISOString()}] Backfill finished. ${status.done.length} countries on disk.`);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
