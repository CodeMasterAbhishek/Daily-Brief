import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyArticle, isTrendingArticle, categoryFromUrl } from './classify-article.js';

test('Verge games URL is gaming, not technology', () => {
    const category = classifyArticle({
        title: 'GTA VI keeps leaking ahead of its gameplay premiere',
        url: 'https://www.theverge.com/games/2026/8/19/gta-vi-leaks',
        defaultCategory: 'technology'
    });
    assert.equal(category, 'gaming');
});

test('NYT politics URL is politics', () => {
    const category = classifyArticle({
        title: 'Senate race tightens in Florida',
        url: 'https://www.nytimes.com/2026/08/18/us/politics/florida-senate.html',
        defaultCategory: 'trending'
    });
    assert.equal(category, 'politics');
});

test('Ars health URL is health', () => {
    const category = classifyArticle({
        title: 'mRNA cancer vaccine succeeded in Phase 3 melanoma trial',
        url: 'https://arstechnica.com/health/2026/08/mrna-cancer-vaccine/',
        defaultCategory: 'technology'
    });
    assert.equal(category, 'health');
});

test('RSS category can override a generic feed default', () => {
    const category = classifyArticle({
        title: 'New album drops Friday',
        url: 'https://www.example.com/story/123',
        rssCategories: ['Music', 'Entertainment'],
        defaultCategory: 'technology'
    });
    assert.equal(category, 'entertainment');
});

test('falls back to the feed default when there is no signal', () => {
    const category = classifyArticle({
        title: 'Company updates its terms',
        url: 'https://www.example.com/news/terms-update',
        defaultCategory: 'business'
    });
    assert.equal(category, 'business');
});

test('categoryFromUrl prefers AI paths over generic tech', () => {
    assert.equal(
        categoryFromUrl('https://www.theverge.com/ai-artificial-intelligence/2026/8/19/openai'),
        'ai'
    );
});

test('only recent tier-1 or homepage stories are trending', () => {
    const recent = { publishedAt: new Date().toISOString() };
    const old = { publishedAt: '2026-08-01T00:00:00.000Z' };
    assert.equal(isTrendingArticle(recent, { homepage: true }), true);
    assert.equal(isTrendingArticle(recent, { tier: 1 }), true);
    assert.equal(isTrendingArticle(recent, { tier: 2 }), false);
    assert.equal(isTrendingArticle(old, { homepage: true, tier: 1 }, Date.parse('2026-10-28')), false);
});
