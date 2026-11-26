import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTRY_QUALITY, COUNTRY_DOMAINS, GLOBAL_QUALITY, isPromoArticle, isQualityPublisher, isQualityArticle, isBlockedHost, isRecentArticle, filterNewsArticles, publisherFromTitle, qualitySearchNames } from './quality.js';
import { matchPublisherDomain } from './export-publishers.js';
import { weekWindows } from './rss-core.js';

test('drops coupon and percent-off shopping posts', () => {
    assert.equal(isPromoArticle({
        title: 'LG Promo Codes and Coupons for October 2026',
        url: 'https://www.wired.com/story/lg-promo-code/',
        description: 'Save 20% with an LG promo code today'
    }), true);
    assert.equal(isPromoArticle({
        title: 'Senate control is a coin flip',
        url: 'https://www.foxnews.com/politics/senate-control',
        description: 'Power rankings rate Senate control a toss-up'
    }), false);
});

test('splits Google News "title - outlet" into publisher', () => {
    const parsed = publisherFromTitle('Cyclone eases after lashing India coast - Reuters');
    assert.equal(parsed.source, 'Reuters');
    assert.equal(parsed.title.startsWith('Cyclone eases'), true);

    const parsedEnDash = publisherFromTitle('Astronomers redefine star cluster in a new study – The Hindu');
    assert.equal(parsedEnDash.source, 'The Hindu');
    assert.equal(parsedEnDash.title, 'Astronomers redefine star cluster in a new study');

    const parsedPipe = publisherFromTitle('Major Cricket Victory in Series Decider | Cricinfo');
    assert.equal(parsedPipe.source, 'Cricinfo');
    assert.equal(parsedPipe.title, 'Major Cricket Victory in Series Decider');
});

test('quality search names drop short tokens and keep local outlets first', () => {
    const names = qualitySearchNames('IN');
    assert.equal(names[0], 'The Hindu');
    assert.equal(names.includes('Reuters'), true);
    assert.equal(names.some(name => name.trim() === 'AP'), false);
});

test('India quality list matches The Hindu and Reuters', () => {
    assert.equal(isQualityPublisher('The Hindu', 'IN'), true);
    assert.equal(isQualityPublisher('Reuters', 'IN'), true);
    assert.equal(isQualityPublisher('Random Blog Deals', 'IN'), false);
});

test('keeps filler news when a small country has few prestige outlets', () => {
    const kept = filterNewsArticles([
        { title: 'Coupon codes for flights', url: 'https://example.com/coupon-code', source: 'Deals', publishedAt: '2026-10-01T00:00:00Z' },
        { title: 'Parliament debates budget', url: 'https://example.com/budget', source: 'Local Times', publishedAt: '2026-10-01T00:00:00Z' }
    ], 'TV', { minKeep: 1, maxKeep: 10 });
    assert.equal(kept.length, 1);
    assert.equal(kept[0].title, 'Parliament debates budget');
});

test('does not dump every unknown outlet when quality is scarce', () => {
    const articles = Array.from({ length: 20 }, (_, i) => ({
        title: `Local story ${i}`,
        url: `https://example.com/story-${i}`,
        source: 'Random Blog',
        publishedAt: '2026-10-01T00:00:00Z'
    }));
    const kept = filterNewsArticles(articles, 'TV', { minKeep: 4, maxKeep: 40 });
    assert.equal(kept.length, 4);
});

test('every country has a quality publisher list', () => {
    const countries = JSON.parse(fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/data/countries.json'),
        'utf8'
    ));
    const missing = countries.filter(country => !COUNTRY_QUALITY[country.code]).map(country => country.code);
    const missingDomains = countries.filter(country => !COUNTRY_DOMAINS[country.code]?.length).map(country => country.code);
    assert.deepEqual(missing, []);
    assert.deepEqual(missingDomains, []);
    assert.equal(countries.length, 193);
});

test('drops YouTube and coupon hosts entirely', () => {
    assert.equal(isBlockedHost('https://www.youtube.com/watch?v=abc'), true);
    assert.equal(isBlockedHost('https://www.thehindu.com/news/story'), false);
    const kept = filterNewsArticles([
        { title: 'Parliament debates budget', url: 'https://www.youtube.com/watch?v=abc', source: 'The Hindu', publishedAt: new Date().toISOString() },
        { title: 'Cyclone eases after lashing coast', url: 'https://www.thehindu.com/news/cyclone', source: 'The Hindu', publishedAt: new Date().toISOString() }
    ], 'IN', { minKeep: 1, maxKeep: 10 });
    assert.equal(kept.length, 1);
    assert.equal(kept[0].source, 'The Hindu');
});

test('marks known outlet domains as quality even without a source name', () => {
    assert.equal(isQualityArticle({
        title: 'RBI holds rates',
        url: 'https://www.thehindu.com/business/rbi',
        source: 'Unknown Feed',
        publishedAt: new Date().toISOString()
    }, 'IN'), true);
    assert.equal(isQualityPublisher('Random Blog Deals', 'IN'), false);
});

test('recent-window helper keeps last month and drops decade-old dates', () => {
    assert.equal(isRecentArticle(new Date().toISOString(), 32), true);
    assert.equal(isRecentArticle('2016-05-30T00:00:00.000Z', 32), false);
    assert.equal(isRecentArticle(new Date(Date.now() + 10 * 60 * 1000).toISOString(), 32), true);
    assert.equal(isRecentArticle(new Date(Date.now() + 30 * 60 * 1000).toISOString(), 32), false);
    assert.ok(weekWindows(32, 7).length >= 4);
});

test('short quality tokens use boundary matching and AP has no trailing space', () => {
    assert.equal(GLOBAL_QUALITY.includes('AP'), true);
    assert.equal(GLOBAL_QUALITY.includes('AP '), false);
    assert.equal(isQualityPublisher('AP', 'US'), true);
    assert.equal(isQualityPublisher('AP News', 'US'), true);
    assert.equal(isQualityPublisher('Associated Press (AP)', 'US'), true);
    assert.equal(isQualityPublisher('AppleInsider', 'US'), false);
    assert.equal(isQualityPublisher('Crap Blog', 'US'), false);
    assert.equal(isQualityPublisher('Android Police', 'DK'), false);
    assert.equal(isQualityPublisher('DR Nyheder', 'DK'), true);
    assert.equal(isQualityPublisher('RTÉ News', 'IE'), true);
    assert.equal(isQualityPublisher('ESPN1', 'RS'), false);
});

test('publisher-to-domain matcher pairs names accurately without blind fallbacks', () => {
    assert.equal(matchPublisherDomain('Wall Street Journal', COUNTRY_DOMAINS.US), 'wsj.com');
    assert.equal(matchPublisherDomain('TechCrunch', COUNTRY_DOMAINS.US), null);
    assert.equal(matchPublisherDomain('Associated Press', COUNTRY_DOMAINS.US), 'apnews.com');
    assert.equal(matchPublisherDomain('Süddeutsche Zeitung', COUNTRY_DOMAINS.DE), 'sueddeutsche.de');
    assert.equal(matchPublisherDomain('France Télévisions', COUNTRY_DOMAINS.FR), 'francetvinfo.fr');
    assert.notEqual(matchPublisherDomain('France Télévisions', COUNTRY_DOMAINS.FR), 'ft.com');
});
