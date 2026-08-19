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
            ['media:thumbnail', 'mediaThumbnail'],
            ['enclosure', 'enclosure'],
            ['image', 'image']
        ]
    }
});

const FEEDS_FILE = path.join(__dirname, '../../public/data/rss-feeds.json');
const DATA_DIR = path.join(__dirname, '../../public/data');
const METADATA_FILE = path.join(DATA_DIR, 'metadata.json');
const OLD_NEWS_FILE = path.join(DATA_DIR, 'news.json');
const LIVE_BASE_URL = 'https://codemasterabhishek.github.io/Daily-Brief/data';

async function extractImage(item) {
    let img = null;
    if (item.mediaContent && item.mediaContent['$'] && item.mediaContent['$'].url) {
        img = item.mediaContent['$'].url;
    } else if (item.mediaThumbnail && item.mediaThumbnail['$'] && item.mediaThumbnail['$'].url) {
        img = item.mediaThumbnail['$'].url;
    } else if (item.enclosure && item.enclosure.url) {
        img = item.enclosure.url;
    } else if (item.image && item.image.url) {
        img = item.image.url;
    } else {
        const content = item.content || item['content:encoded'] || '';
        const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch && imgMatch[1]) {
            img = imgMatch[1];
        }
    }

    if (!img) return null;

    if (img.includes('ichef.bbci.co.uk') && img.includes('/240/')) img = img.replace('/240/', '/976/');
    else if (img.includes('scx1.b-cdn.net') && img.includes('/tmb/')) img = img.replace('/tmb/', '/800w/');
    else if ((img.includes('ignimgs.com') || img.includes('techcrunch.com') || img.includes('polygon.com')) && img.includes('?')) img = img.split('?')[0]; 
    else if (img.includes('nytimes.com')) img = img.replace('-moth.', '-superJumbo.').replace('-thumbStandard.', '-superJumbo.');
    
    return img;
}

async function run() {
    console.log(`[${new Date().toISOString()}] Starting RSS fetch and chunking process...`);
    const feeds = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf-8'));
    
    let allArticlesMap = new Map(); // Store by ID to handle duplicates

    // 1. Fetch live metadata to know what chunks exist
    let metadata = { latest: null, chunks: [] };
    try {
        console.log(`Fetching metadata from live site...`);
        const res = await fetch(`${LIVE_BASE_URL}/metadata.json?t=${Date.now()}`);
        if (res.ok) metadata = await res.json();
    } catch(e) {
        console.log("Could not load live metadata (first run or offline).");
    }

    // 2. Download all historical chunks from live site into memory
    if (metadata.chunks) {
        for (const chunk of metadata.chunks) {
            try {
                console.log(`Downloading historical chunk: ${chunk}.json`);
                const res = await fetch(`${LIVE_BASE_URL}/${chunk}.json?t=${Date.now()}`);
                if (res.ok) {
                    const chunkData = await res.json();
                    if (chunkData.articles) {
                        chunkData.articles.forEach(a => allArticlesMap.set(a.id, a));
                    }
                }
            } catch(e) {
                console.error(`Failed to load live chunk ${chunk}`);
            }
        }
    }

    // 3. Load from local chunks (in case this is run locally after an old fetch)
    const files = fs.readdirSync(DATA_DIR);
    files.filter(f => f.startsWith('news-2') && f.endsWith('.json')).forEach(f => {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
            if (data.articles) data.articles.forEach(a => allArticlesMap.set(a.id, a));
        } catch(e) {}
    });

    // 4. Migration: Load legacy news.json if it exists
    if (fs.existsSync(OLD_NEWS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(OLD_NEWS_FILE, 'utf-8'));
            if (data.articles) data.articles.forEach(a => allArticlesMap.set(a.id, a));
        } catch(e) {}
    }

    // 5. Fetch new RSS articles
    console.log("Fetching latest RSS feeds...");
    const fetchPromises = feeds.map(async feed => {
        try {
            const parsed = await parser.parseURL(feed.url);
            const articles = await Promise.all(parsed.items.slice(0, 15).map(async item => {
                const img = await extractImage(item);
                let title = item.title ? item.title.trim() : '';
                const link = item.link || '';
                if (!title || !link || !img) return null;
                
                title = title.replace(/\[(?:Image|Photo) \d+ of \d+\]/gi, '').trim();
                const dedupeKey = title + feed.source;
                const id = `rss-${crypto.createHash('md5').update(dedupeKey).digest('hex').substring(0, 12)}`;
                
                return {
                    id, title,
                    description: item.contentSnippet ? item.contentSnippet.substring(0, 200) : '',
                    url: link, image: img, source: feed.source, category: feed.category,
                    publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
                };
            }));
            return articles.filter(a => a !== null);
        } catch (e) {
            console.error(`Error fetching ${feed.source}: ${e.message}`);
            return [];
        }
    });

    const newArticlesGroups = await Promise.all(fetchPromises);
    newArticlesGroups.flat().forEach(a => allArticlesMap.set(a.id, a));

    // 6. Global Deduplication
    let mergedArray = Array.from(allArticlesMap.values()).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
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

    // 7. Group into Monthly Chunks
    const chunks = {};
    uniqueArray.forEach(article => {
        // e.g., "2026-08"
        const monthKey = `news-${article.publishedAt.substring(0, 7)}`;
        if (!chunks[monthKey]) chunks[monthKey] = [];
        chunks[monthKey].push(article);
    });

    // 8. Save Chunks
    const chunkNames = Object.keys(chunks).sort().reverse();
    chunkNames.forEach(chunkName => {
        fs.writeFileSync(path.join(DATA_DIR, `${chunkName}.json`), JSON.stringify({
            lastUpdated: new Date().toISOString(),
            count: chunks[chunkName].length,
            articles: chunks[chunkName]
        }, null, 2));
    });

    // 9. Generate and Save Metadata
    const newMetadata = {
        latest: chunkNames.length > 0 ? chunkNames[0] : null,
        chunks: chunkNames,
        totalArticles: uniqueArray.length
    };
    fs.writeFileSync(METADATA_FILE, JSON.stringify(newMetadata, null, 2));

    // 10. Clean up legacy database if it exists
    if (fs.existsSync(OLD_NEWS_FILE)) {
        fs.unlinkSync(OLD_NEWS_FILE);
    }

    // 11. SEO Pre-rendering
    try {
        const INDEX_FILE = path.join(__dirname, '../../public/index.html');
        let indexHtml = fs.readFileSync(INDEX_FILE, 'utf-8');
        let seoHtml = '<noscript><div class="seo-articles">';
        uniqueArray.slice(0, 20).forEach(article => {
            seoHtml += `<article><h2><a href="${article.url}">${article.title}</a></h2><p>${article.description || ''}</p><span>${article.source} - ${article.category}</span></article>`;
        });
        seoHtml += '</div></noscript>';

        indexHtml = indexHtml.replace(/<noscript><div class="seo-articles">[\s\S]*?<\/div><\/noscript>\n\s*/g, '');
        indexHtml = indexHtml.replace(/<\/main>/, `${seoHtml}\n    </main>`);
        fs.writeFileSync(INDEX_FILE, indexHtml);
    } catch(e) { console.error("Failed to pre-render SEO HTML:", e); }

    console.log(`[${new Date().toISOString()}] Successfully saved ${uniqueArray.length} total articles across ${chunkNames.length} monthly chunks.`);
    process.exit(0);
}

run();
