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
    mergeAndSave
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
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

async function mapPool(items, limit, worker) {
    const pending = [...items];
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (pending.length) {
            const item = pending.shift();
            await worker(item);
        }
    });
    await Promise.all(runners);
}

async function backfillCountry(country, extraFeeds, days) {
    const extraQuality = extraFeeds.map(feed => feed.source);
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
    const live = await Promise.all(googleNewsFeeds(country).map(fetchFeedArticles));
    incoming.push(...filterNewsArticles(live.flat(), country.code, {
        extraQuality,
        minKeep: 8,
        maxKeep: 80
    }));
    if (extraFeeds.length) {
        const extras = await Promise.all(extraFeeds.map(fetchFeedArticles));
        incoming.push(...extras.flat());
    }
    const { unique, metadata } = await mergeAndSave(country, extraFeeds, incoming, {
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
            status.done.push(country.code);
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
