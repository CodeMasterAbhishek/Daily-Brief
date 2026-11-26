import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    FALLBACK_IMAGE,
    GOOGLE_TOPICS,
    countryDir,
    decodeEntities,
    extractImage,
    fetchFeedArticles,
    isSafePublicUrl,
    loadDotEnv,
    loadExisting,
    mergeAndSave,
    parseFeed,
    rssDate,
    safeHttpUrl,
    uniqueArticles,
    writeCountry,
    writeJsonAtomic
} from './rss-core.js';
import { r2GetJson, r2PutJson, encodeRfc3986 } from './r2.js';
import { selectCountries } from './fetch-rss.js';

function withTempDir(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-brief-test-'));
    try {
        return fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function withEnv(overrides, fn) {
    const saved = {};
    for (const [k, v] of Object.entries(overrides)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try {
        return await fn();
    } finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

async function withMockFetch(handler, fn) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = handler;
    try {
        return await fn();
    } finally {
        globalThis.fetch = originalFetch;
    }
}

test('writeJsonAtomic writes JSON cleanly without leaving temp files', () => {
    withTempDir(dir => {
        const target = path.join(dir, 'nested', 'sample.json');
        writeJsonAtomic(target, { ok: true, count: 2 });
        writeJsonAtomic(target, { ok: true, count: 3 });
        assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { ok: true, count: 3 });
        const entries = fs.readdirSync(path.dirname(target));
        assert.deepEqual(entries, ['sample.json']);
    });
});

test('safeHttpUrl validates protocols and rejects unsafe/relative URLs', () => {
    assert.equal(safeHttpUrl('https://example.com/news'), 'https://example.com/news');
    assert.equal(safeHttpUrl('http://example.com/news'), 'http://example.com/news');
    assert.equal(safeHttpUrl('http://example.com/news', { allowHttp: false }), '');
    assert.equal(safeHttpUrl('javascript:alert(1)'), '');
    assert.equal(safeHttpUrl('data:text/html,<script>alert(1)</script>'), '');
    assert.equal(safeHttpUrl('/relative/path'), '');
    assert.equal(safeHttpUrl('//example.com/proto-relative'), '');
    assert.equal(safeHttpUrl('   '), '');
    assert.equal(safeHttpUrl(null), '');
});

test('isSafePublicUrl blocks private, loopback, metadata, and local hostnames', () => {
    assert.equal(isSafePublicUrl('https://feeds.bbci.co.uk/news/rss.xml'), true);
    assert.equal(isSafePublicUrl('https://[2606:4700:4700::1111]/feed'), true);
    assert.equal(isSafePublicUrl('http://localhost/rss'), false);
    assert.equal(isSafePublicUrl('http://api.localhost/rss'), false);
    assert.equal(isSafePublicUrl('http://127.0.0.1/rss'), false);
    assert.equal(isSafePublicUrl('http://127.10.20.30/rss'), false);
    assert.equal(isSafePublicUrl('http://10.0.0.5/rss'), false);
    assert.equal(isSafePublicUrl('http://172.16.0.1/rss'), false);
    assert.equal(isSafePublicUrl('http://172.31.255.254/rss'), false);
    assert.equal(isSafePublicUrl('http://192.168.1.10/rss'), false);
    assert.equal(isSafePublicUrl('http://169.254.169.254/latest/meta-data/'), false);
    assert.equal(isSafePublicUrl('http://0.0.0.0/'), false);
    assert.equal(isSafePublicUrl('http://[::1]/'), false);
    assert.equal(isSafePublicUrl('http://[fc00::1]/'), false);
    assert.equal(isSafePublicUrl('http://[fd12:3456::1]/'), false);
    assert.equal(isSafePublicUrl('http://[fe80::1]/'), false);
    assert.equal(isSafePublicUrl('http://[::ffff:127.0.0.1]/'), false);
    assert.equal(isSafePublicUrl('http://[::ffff:169.254.169.254]/'), false);
    assert.equal(isSafePublicUrl('http://printer.local/feed'), false);
    assert.equal(isSafePublicUrl('http://metadata.internal/feed'), false);
    assert.equal(isSafePublicUrl('http://redis:6379/'), false);
    assert.equal(isSafePublicUrl('https://user:pass@example.com/rss'), false);
});

test('decodeEntities decodes named, decimal, and hex HTML entities once', () => {
    assert.equal(
        decodeEntities('AT&amp;T &lt;tag&gt; &quot;hi&quot; &apos;ok&apos; &#39;A&#8217;s &#8216;B&#8220;C&#8221; &#8211; &#8212;&nbsp;end&#x27;&#X2026;'),
        'AT&T <tag> "hi" \'ok\' \'A’s ‘B“C” – — end\'…'
    );
    assert.equal(decodeEntities('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
    assert.equal(decodeEntities(null), '');
});

test('loadDotEnv handles export prefix, comments, and matching quotes only', async () => {
    await withTempDir(async dir => {
        const envPath = path.join(dir, '.env');
        fs.writeFileSync(envPath, [
            '# comment line',
            '   # indented comment',
            'PLAIN=hello',
            'export EXPORTED="quoted value"',
            "SINGLE='single value'",
            'MISMATCH="not-matched\'',
            'EXISTING=should_not_override'
        ].join('\n'));
        await withEnv({
            PLAIN: undefined,
            EXPORTED: undefined,
            SINGLE: undefined,
            MISMATCH: undefined,
            EXISTING: 'keep_me'
        }, () => {
            loadDotEnv(envPath);
            assert.equal(process.env.PLAIN, 'hello');
            assert.equal(process.env.EXPORTED, 'quoted value');
            assert.equal(process.env.SINGLE, 'single value');
            assert.equal(process.env.MISMATCH, '"not-matched\'');
            assert.equal(process.env.EXISTING, 'keep_me');
        });
    });
});

test('countryDir validates uppercase 2-letter ISO code', () => {
    assert.ok(countryDir('US').endsWith(path.join('c', 'US')));
    assert.throws(() => countryDir('us'), /Invalid country code/);
    assert.throws(() => countryDir('../etc'), /Invalid country code/);
    assert.throws(() => countryDir('USA'), /Invalid country code/);
    assert.throws(() => countryDir(''), /Invalid country code/);
});

test('rssDate returns null for missing/invalid/far-future and clamps small clock skew', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    assert.equal(rssDate(undefined, now), null);
    assert.equal(rssDate('', now), null);
    assert.equal(rssDate('not-a-date', now), null);
    assert.equal(rssDate('2026-11-26T13:30:00.000Z', now), null); // +90m > 1h
    assert.equal(rssDate('2026-11-26T12:30:00.000Z', now), '2026-11-26T12:00:00.000Z'); // +30m clamped
    assert.equal(rssDate('2026-11-26T12:03:00.000Z', now), '2026-11-26T12:03:00.000Z'); // +3m kept
    assert.equal(rssDate('2026-11-25T10:00:00.000Z', now), '2026-11-25T10:00:00.000Z');
});

test('extractImage handles arrays, enclosures, single/double quotes, HTTPS upgrades, and fallback', () => {
    assert.equal(
        extractImage({
            mediaContent: [
                { $: { url: 'https://example.com/video.mp4', medium: 'video', type: 'video/mp4' } },
                { $: { url: 'http://ichef.bbci.co.uk/news/240/cpsprodpb/photo.jpg', medium: 'image' } }
            ]
        }),
        'https://ichef.bbci.co.uk/news/976/cpsprodpb/photo.jpg'
    );
    assert.equal(
        extractImage({
            mediaThumbnail: [{ $: { url: 'http://media.wired.com/photos/lead.jpg' } }]
        }),
        'https://media.wired.com/photos/lead.jpg'
    );
    assert.equal(
        extractImage({
            enclosure: { url: 'https://example.com/podcast.mp3', type: 'audio/mpeg' }
        }),
        FALLBACK_IMAGE
    );
    assert.equal(
        extractImage({
            enclosure: { url: 'http://assets2.ignimgs.com/2026/11/hero.png?width=300', type: 'image/png' }
        }),
        'https://assets2.ignimgs.com/2026/11/hero.png'
    );
    assert.equal(
        extractImage({
            content: "<p>Lead <img alt='pic' src='http://i.guim.co.uk/img/media/abc.jpg?w=600&amp;q=85'></p>"
        }),
        'https://i.guim.co.uk/img/media/abc.jpg?w=600&q=85'
    );
    assert.equal(
        extractImage({
            content: '<img src="javascript:alert(1)">'
        }),
        FALLBACK_IMAGE
    );
});

test('GOOGLE_TOPICS includes WORLD politics coverage', () => {
    assert.ok(GOOGLE_TOPICS.some(t => t.topic === 'WORLD' && t.category === 'politics' && t.tier === 2));
});

test('parseFeed enforces SSRF redirect checks, Content-Type, Google News gl checks, and 5MB cap', async () => {
    await withMockFetch(async () => new Response('<html>hi</html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
    }), async () => {
        await assert.rejects(() => parseFeed('https://example.com/rss.xml', { retryBaseMs: 1 }), /Content-Type/);
    });

    await withMockFetch(async () => new Response('', {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' }
    }), async () => {
        await assert.rejects(() => parseFeed('https://example.com/rss.xml', { retryBaseMs: 1 }), /Unsafe feed URL/);
    });

    await withMockFetch(async () => new Response('', {
        status: 302,
        headers: { location: 'https://news.google.com/rss?hl=en&gl=US&ceid=US:en' }
    }), async () => {
        await assert.rejects(
            () => parseFeed('https://news.google.com/rss?hl=fr&gl=FR&ceid=FR:fr', { expectedCountry: 'FR', retryBaseMs: 1 }),
            /gl=US/
        );
    });

    await withMockFetch(async () => new Response('', {
        status: 302,
        headers: { location: 'https://news.google.com/home?hl=en-US' }
    }), async () => {
        await assert.rejects(
            () => parseFeed('https://news.google.com/rss?hl=en&gl=US&ceid=US:en', { expectedCountry: 'US', retryBaseMs: 1 }),
            /\/home/
        );
    });

    await withMockFetch(async () => new Response('x'.repeat(2048), {
        status: 200,
        headers: { 'content-type': 'application/xml', 'content-length': '99999999' }
    }), async () => {
        await assert.rejects(
            () => parseFeed('https://example.com/rss.xml', { maxBytes: 1024, retryBaseMs: 1 }),
            /byte limit/
        );
    });

    let calls = 0;
    const validRss = '<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>Story &amp; More</title><link>https://example.com/story</link><pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>';
    await withMockFetch(async (url, init) => {
        calls += 1;
        assert.equal(init.redirect, 'manual');
        assert.ok(init.signal instanceof AbortSignal);
        if (calls === 1) return new Response('busy', { status: 503 });
        return new Response(validRss, {
            status: 200,
            headers: { 'content-type': 'application/rss+xml' }
        });
    }, async () => {
        const parsed = await parseFeed('https://example.com/rss.xml', { retryBaseMs: 1 });
        assert.equal(calls, 2);
        assert.equal(parsed.items.length, 1);
    });
});

test('fetchFeedArticles skips undated items and decodes entities', async () => {
    const rss = `<?xml version="1.0"?>
    <rss version="2.0"><channel><title>Test</title>
      <item>
        <title>Undated Old Story</title>
        <link>https://example.com/undated</link>
      </item>
      <item>
        <title>Fresh Story&#8217;s &amp; Headline</title>
        <description>Details &amp; notes&#8230;</description>
        <link>https://example.com/fresh</link>
        <pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;

    await withMockFetch(async () => new Response(rss, {
        status: 200,
        headers: { 'content-type': 'application/xml' }
    }), async () => {
        const articles = await fetchFeedArticles({
            url: 'https://example.com/rss.xml',
            category: 'technology',
            source: 'Example Tech',
            tier: 1
        });
        assert.equal(articles.length, 1);
        assert.equal(articles[0].title, 'Fresh Story’s & Headline');
        assert.equal(articles[0].description, 'Details & notes…');
    });
});

test('uniqueArticles preserves Tier-1/trending on reload and dedupes deterministically', () => {
    const nowIso = new Date().toISOString();
    const loadedFromDisk = {
        id: 'rss-reloaded',
        title: 'Major Summit Opens',
        description: 'Global leaders gather.',
        url: 'https://www.reuters.com/world/summit',
        image: 'https://www.reuters.com/img/summit.jpg',
        source: 'Reuters',
        category: 'trending',
        publishedAt: nowIso,
        tier: 1,
        trending: true
    };
    const googleRedirectDup = {
        id: 'rss-gnews-dup',
        title: 'Major Summit Opens',
        description: '',
        url: 'https://news.google.com/rss/articles/CBMi123',
        image: FALLBACK_IMAGE,
        source: 'Reuters',
        category: 'trending',
        publishedAt: nowIso,
        tier: 2,
        trending: false
    };
    const result = uniqueArticles([googleRedirectDup, loadedFromDisk], new Map());
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'rss-reloaded');
    assert.equal(result[0].tier, 1);
    assert.equal(result[0].trending, true);
    assert.equal(result[0].url, 'https://www.reuters.com/world/summit');

    // Same timestamp & tier: direct URL beats Google News URL even when Google News appears first
    const directTier1 = { ...loadedFromDisk, id: 'direct', tier: 1, trending: true };
    const gnewsTier1 = { ...googleRedirectDup, id: 'gnews', tier: 1, trending: true };
    const tieBroken = uniqueArticles([gnewsTier1, directTier1], new Map());
    assert.equal(tieBroken[0].id, 'direct');
});

test('loadExisting drops 404 ghost chunks and mergeAndSave tracks shardCounts and uploads all written shards', async () => {
    await withTempDir(async dir => {
        const uploads = [];
        await withEnv({
            R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
            R2_BUCKET: 'daily-brief-test',
            R2_ACCESS_KEY_ID: 'testaccesskey',
            R2_SECRET_ACCESS_KEY: 'testsecretkey'
        }, async () => {
            await withMockFetch(async (url, init) => {
                const method = init?.method || 'GET';
                const pathname = new URL(url).pathname;
                if (method === 'GET') {
                    if (pathname.endsWith('/c/US/metadata.json')) {
                        return new Response(JSON.stringify({
                            latest: 'news-2026-11',
                            chunks: ['news-2026-11', 'news-2025-02', 'news-2026-09'],
                            shardCounts: { 'news-2026-11': 1, 'news-2025-02': 99, 'news-2026-09': 40 },
                            country: 'US'
                        }), { status: 200 });
                    }
                    if (pathname.endsWith('/c/US/news-2026-11.json')) {
                        return new Response(JSON.stringify({
                            articles: [{
                                id: 'rss-existing',
                                title: 'Existing Nov Story',
                                url: 'https://example.com/nov-1',
                                image: FALLBACK_IMAGE,
                                source: 'Reuters',
                                category: 'trending',
                                publishedAt: '2026-11-25T10:00:00.000Z',
                                tier: 1,
                                trending: false
                            }]
                        }), { status: 200 });
                    }
                    if (pathname.endsWith('/c/US/news-2025-02.json')) {
                        return new Response('Not Found', { status: 404 });
                    }
                }
                if (method === 'PUT') {
                    uploads.push({ pathname, body: JSON.parse(init.body) });
                    return new Response('', { status: 200 });
                }
                return new Response('unexpected', { status: 500 });
            }, async () => {
                const loaded = await loadExisting('US', { remote: true, baseDir: dir });
                assert.deepEqual(loaded.remoteChunks, ['news-2026-11', 'news-2026-09']);
                assert.equal(loaded.remoteShardCounts['news-2025-02'], undefined);
                assert.equal(loaded.remoteShardCounts['news-2026-09'], 40);

                const { metadata } = await mergeAndSave(
                    { code: 'US', hl: 'en-US', gl: 'US', ceid: 'US:en', language: 'en' },
                    [],
                    [{
                        id: 'rss-oct',
                        title: 'October Story',
                        url: 'https://example.com/oct-1',
                        image: FALLBACK_IMAGE,
                        source: 'Reuters',
                        category: 'trending',
                        publishedAt: '2026-10-15T10:00:00.000Z',
                        tier: 1,
                        trending: false
                    }],
                    { remote: true, upload: true, baseDir: dir }
                );

                assert.deepEqual(metadata.chunks, ['news-2026-11', 'news-2026-10', 'news-2026-09']);
                assert.deepEqual(metadata.shardCounts, {
                    'news-2026-11': 1,
                    'news-2026-10': 1,
                    'news-2026-09': 40
                });
                assert.equal(metadata.totalArticles, 42);
                const uploadedPaths = uploads.map(u => u.pathname);
                assert.ok(uploadedPaths.some(p => p.endsWith('/c/US/metadata.json')));
                assert.ok(uploadedPaths.some(p => p.endsWith('/c/US/news-2026-11.json')));
                assert.ok(uploadedPaths.some(p => p.endsWith('/c/US/news-2026-10.json')));
            });
        });
    });

    // Direct writeCountry test for empty/remoteShardCounts edge case
    await withTempDir(dir => {
        const { metadata } = writeCountry('GB', [{
            id: 'a1',
            title: 'UK Story',
            url: 'https://bbc.co.uk/1',
            publishedAt: '2026-11-20T10:00:00.000Z'
        }], ['news-2026-10'], {
            baseDir: dir,
            remoteShardCounts: { 'news-2026-10': 15 }
        });
        assert.equal(metadata.totalArticles, 16);
    });

    // Legacy metadata without shardCounts self-heals ghost chunks beyond slice(0, 2)
    await withTempDir(async dir => {
        await withEnv({
            R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
            R2_BUCKET: 'daily-brief-test',
            R2_ACCESS_KEY_ID: 'testaccesskey',
            R2_SECRET_ACCESS_KEY: 'testsecretkey'
        }, async () => {
            await withMockFetch(async url => {
                const pathname = new URL(url).pathname;
                if (pathname.endsWith('/c/US/metadata.json')) {
                    return new Response(JSON.stringify({
                        latest: 'news-2026-11',
                        chunks: ['news-2026-11', 'news-2026-10', 'news-2025-12', 'news-2025-02', 'news-2025-01'],
                        country: 'US'
                    }), { status: 200 });
                }
                if (pathname.endsWith('/news-2026-11.json') || pathname.endsWith('/news-2026-10.json')) {
                    return new Response(JSON.stringify({ articles: [] }), { status: 200 });
                }
                if (pathname.endsWith('/news-2025-01.json')) {
                    return new Response(JSON.stringify({ articles: [{ id: 'x1' }, { id: 'x2' }] }), { status: 200 });
                }
                return new Response('Not Found', { status: 404 });
            }, async () => {
                const loaded = await loadExisting('US', { remote: true, baseDir: dir });
                assert.deepEqual(loaded.remoteChunks, ['news-2026-11', 'news-2026-10', 'news-2025-01']);
                assert.equal(loaded.remoteShardCounts['news-2025-01'], 2);
                assert.equal(loaded.remoteShardCounts['news-2025-02'], undefined);
            });
        });
    });

    const filtered = uniqueArticles([{
        id: 'cnn-poison',
        title: 'Trump pleads not guilty to 34 felony counts',
        url: 'https://edition.cnn.com/webview/politics/live-news/trump-indictment-stormy-daniels-news-04-03-23/index.html',
        image: FALLBACK_IMAGE,
        source: 'CNN',
        category: 'politics',
        publishedAt: new Date().toISOString(),
        tier: 2,
        trending: false
    }], new Map());
    assert.equal(filtered.length, 0);
});

test('r2 client validates config/keys, uses RFC 3986 encoding, retries once, and redacts XML errors', async () => {
    assert.equal(encodeRfc3986("a!'()*b"), 'a%21%27%28%29%2Ab');

    await withEnv({
        R2_ACCOUNT_ID: 'invalid-id',
        R2_BUCKET: 'valid-bucket',
        R2_ACCESS_KEY_ID: 'ak',
        R2_SECRET_ACCESS_KEY: 'sk'
    }, async () => {
        await assert.rejects(() => r2GetJson('c/US/metadata.json'), /Invalid R2_ACCOUNT_ID/);
    });

    await withEnv({
        R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
        R2_BUCKET: 'Bad_Bucket',
        R2_ACCESS_KEY_ID: 'ak',
        R2_SECRET_ACCESS_KEY: 'sk'
    }, async () => {
        await assert.rejects(() => r2GetJson('c/US/metadata.json'), /Invalid R2_BUCKET/);
    });

    await withEnv({
        R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
        R2_BUCKET: 'valid-bucket',
        R2_ACCESS_KEY_ID: 'ak',
        R2_SECRET_ACCESS_KEY: 'sk'
    }, async () => {
        await assert.rejects(() => r2PutJson('../secret.json', {}), /Invalid R2 key/);
        await assert.rejects(() => r2PutJson('/leading.json', {}), /Invalid R2 key/);
        await assert.rejects(() => r2PutJson('bad\nkey.json', {}), /Invalid R2 key/);

        let attempts = 0;
        await withMockFetch(async (url) => {
            attempts += 1;
            assert.ok(url.includes('a%21b.json'));
            if (attempts === 1) return new Response('rate limit', { status: 429 });
            return new Response(
                '<Error><Code>AccessDenied</Code><Message>Access Denied Credential=SUPERSECRET</Message><AWSAccessKeyId>MY_KEY_ID</AWSAccessKeyId></Error>',
                { status: 403 }
            );
        }, async () => {
            await assert.rejects(
                () => r2GetJson("c/US/a!b.json"),
                (err) => {
                    assert.equal(attempts, 2);
                    assert.match(err.message, /403 \(AccessDenied: Access Denied Credential=\[REDACTED\]\)/);
                    assert.equal(err.message.includes('MY_KEY_ID'), false);
                    assert.equal(err.message.includes('SUPERSECRET'), false);
                    return true;
                }
            );
        });

        await withMockFetch(async () => new Response('<AWSAccessKeyId>SECRET</AWSAccessKeyId>', { status: 400 }), async () => {
            await assert.rejects(
                () => r2PutJson('c/US/test.json', { ok: true }),
                (err) => {
                    assert.equal(err.message, 'R2 PUT c/US/test.json failed: 400');
                    return true;
                }
            );
        });
    });
});

test('selectCountries always includes US and rotates remaining countries cleanly', () => {
    const countries = JSON.parse(fs.readFileSync('public/data/countries.json', 'utf8'));
    const off = selectCountries(countries, { r2On: false });
    assert.deepEqual(off.map(c => c.code), ['US']);

    const on = selectCountries(countries, { r2On: true, now: 1700000000000 });
    assert.equal(on[0].code, 'US');
    assert.equal(on.length, 25);
    assert.equal(new Set(on.map(c => c.code)).size, 25);
});

test('curated repo feeds and US metadata/storage files pass offline integrity checks', () => {
    const feedsByCountry = JSON.parse(fs.readFileSync('public/data/rss-feeds.json', 'utf8'));
    const allFeeds = Object.values(feedsByCountry).flat();
    assert.equal(allFeeds.some(f => f.url.startsWith('http://')), false);
    const usSources = new Set(feedsByCountry.US.map(f => f.source));
    for (const removed of ['CNN', 'CNN Politics', 'CNN Health', 'WSJ', 'WSJ Business', 'VentureBeat', 'VentureBeat AI', 'New Scientist', 'Nature']) {
        assert.equal(usSources.has(removed), false);
    }
    for (const added of ['BBC World', 'NPR News', 'Politico', 'CBS News Politics', 'The Hill', 'IEEE Spectrum AI', 'Google DeepMind']) {
        assert.equal(usSources.has(added), true);
    }

    const storage = JSON.parse(fs.readFileSync('public/data/storage.json', 'utf8'));
    assert.equal(storage.base, 'https://pub-80d5b317212242cab2851c0cd4fe7b89.r2.dev');

    const usDir = 'public/data/c/US';
    const meta = JSON.parse(fs.readFileSync(path.join(usDir, 'metadata.json'), 'utf8'));
    const diskChunks = fs.readdirSync(usDir)
        .filter(f => /^news-\d{4}-\d{2}\.json$/.test(f))
        .map(f => f.replace(/\.json$/, ''))
        .sort()
        .reverse();
    assert.deepEqual(meta.chunks, diskChunks);
    assert.equal(meta.chunks.includes('news-2025-02'), false);
    const actualSum = diskChunks.reduce((sum, c) => {
        const shard = JSON.parse(fs.readFileSync(path.join(usDir, `${c}.json`), 'utf8'));
        assert.equal(shard.count, shard.articles.length);
        return sum + shard.articles.length;
    }, 0);
    assert.equal(meta.totalArticles, actualSum);
});
