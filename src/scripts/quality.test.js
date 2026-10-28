import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTRY_QUALITY, isPromoArticle, isQualityPublisher, filterNewsArticles, publisherFromTitle, qualitySearchNames } from './quality.js';

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
    assert.deepEqual(missing, []);
    assert.equal(countries.length, 193);
});
