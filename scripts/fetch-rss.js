import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Parser from 'rss-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parser = new Parser({
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['enclosure', 'enclosure'],
            ['image', 'image']
        ]
    }
});

const FEEDS_FILE = path.join(__dirname, '../data/rss-feeds.json');
const OUTPUT_FILE = path.join(__dirname, '../data/news.json');

async function extractImage(item) {
    if (item.mediaContent && item.mediaContent['$'] && item.mediaContent['$'].url) {
        return item.mediaContent['$'].url;
    }
    if (item.enclosure && item.enclosure.url) {
        return item.enclosure.url;
    }
    if (item.image && item.image.url) {
        return item.image.url;
    }
    // Try finding img tag in content
    const content = item.content || item['content:encoded'] || '';
    const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
    if (imgMatch && imgMatch[1]) {
        return imgMatch[1];
    }
    return null;
}

async function run() {
    console.log(`[${new Date().toISOString()}] Starting RSS fetch from ${FEEDS_FILE}...`);
    const feeds = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf-8'));
    
    let allArticles = [];
    
    // Load existing to merge and deduplicate
    let existingData = { articles: [] };
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
        } catch(e) {}
    }

    const fetchPromises = feeds.map(async feed => {
        try {
            console.log(`Fetching ${feed.source}...`);
            const parsed = await parser.parseURL(feed.url);
            
            const articles = await Promise.all(parsed.items.slice(0, 15).map(async item => {
                const img = await extractImage(item);
                let title = item.title ? item.title.trim() : '';
                const link = item.link || '';
                if (!title || !link) return null;
                
                // Clean gallery tags like "[Image 1 of 11]" to prevent duplicates
                title = title.replace(/\[(?:Image|Photo) \d+ of \d+\]/gi, '').trim();
                
                // Deduplicate strictly based on the cleaned title and source, so galleries collapse into 1 item
                const dedupeKey = title + feed.source;
                const id = `rss-${crypto.createHash('md5').update(dedupeKey).digest('hex').substring(0, 12)}`;
                
                return {
                    id,
                    title,
                    description: item.contentSnippet ? item.contentSnippet.substring(0, 200) : '',
                    url: link,
                    image: img,
                    source: feed.source,
                    category: feed.category,
                    publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
                };
            }));
            
            return articles.filter(a => a !== null && a.image); // Only keep items with images
        } catch (e) {
            console.error(`Error fetching ${feed.source}: ${e.message}`);
            return [];
        }
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(res => {
        allArticles = allArticles.concat(res);
    });
    
    // Merge
    const mergedMap = new Map();
    existingData.articles.forEach(a => mergedMap.set(a.id, a));
    allArticles.forEach(a => mergedMap.set(a.id, a));
    
    let mergedArray = Array.from(mergedMap.values())
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // Global Deduplication (Catch cross-category & wire duplicates)
    const seenTitles = new Set();
    const seenUrls = new Set();
    const uniqueArray = [];

    for (const article of mergedArray) {
        if (!article.title || !article.url) continue;
        const titleLower = article.title.toLowerCase().trim();
        const urlLower = article.url.toLowerCase().trim();
        
        if (!seenTitles.has(titleLower) && !seenUrls.has(urlLower)) {
            seenTitles.add(titleLower);
            seenUrls.add(urlLower);
            uniqueArray.push(article);
        }
    }

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - SEVEN_DAYS_MS;

    // Keep articles from the last 7 days, with a maximum of 2000 to prevent file bloat
    mergedArray = uniqueArray.filter(a => {
        return new Date(a.publishedAt).getTime() >= cutoffTime;
    }).slice(0, 2000);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
        lastUpdated: new Date().toISOString(),
        count: mergedArray.length,
        articles: mergedArray
    }, null, 2));

    console.log(`[${new Date().toISOString()}] Successfully saved ${mergedArray.length} total articles.`);
    process.exit(0);
}

run();
