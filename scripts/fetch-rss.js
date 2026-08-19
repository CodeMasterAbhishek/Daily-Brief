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

const FEEDS_FILE = path.join(__dirname, '../data/rss-feeds.json');
const OUTPUT_FILE = path.join(__dirname, '../data/news.json');

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
        // Try finding img tag in content
        const content = item.content || item['content:encoded'] || '';
        const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch && imgMatch[1]) {
            img = imgMatch[1];
        }
    }

    if (!img) return null;

    // --- High-Resolution Image Upgrades ---
    
    // BBC News: Upgrade 240px thumbnails to 976px
    if (img.includes('ichef.bbci.co.uk') && img.includes('/240/')) {
        img = img.replace('/240/', '/976/');
    }
    // Phys.org: Upgrade '/tmb/' (thumbnail) to '/800w/'
    else if (img.includes('scx1.b-cdn.net') && img.includes('/tmb/')) {
        img = img.replace('/tmb/', '/800w/');
    }
    // IGN / TechCrunch / Polygon: Strip restrictive query parameters like ?w=150
    else if ((img.includes('ignimgs.com') || img.includes('techcrunch.com') || img.includes('polygon.com')) && img.includes('?')) {
        img = img.split('?')[0]; 
    }
    // New York Times: Replace small thumbnails with superJumbo
    else if (img.includes('nytimes.com')) {
        img = img.replace('-moth.', '-superJumbo.').replace('-thumbStandard.', '-superJumbo.');
    }
    
    return img;
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

    // Keep exactly a rolling 7-day window. Anything older than 7 days is automatically dropped.
    mergedArray = uniqueArray.filter(a => {
        return new Date(a.publishedAt).getTime() >= cutoffTime;
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
        lastUpdated: new Date().toISOString(),
        count: mergedArray.length,
        articles: mergedArray
    }, null, 2));

    // SEO Pre-rendering
    try {
        const INDEX_FILE = path.join(__dirname, '../index.html');
        let indexHtml = fs.readFileSync(INDEX_FILE, 'utf-8');
        
        let seoHtml = '<noscript><div class="seo-articles">';
        mergedArray.slice(0, 20).forEach(article => {
            seoHtml += `
                <article>
                    <h2><a href="${article.url}">${article.title}</a></h2>
                    <p>${article.description || ''}</p>
                    <span>${article.source} - ${article.category}</span>
                </article>
            `;
        });
        seoHtml += '</div></noscript>';

        // Inject before the end of the news container
        indexHtml = indexHtml.replace(/<section id="news-container"[^>]*>[\s\S]*?<\/section>/, (match) => {
            // If we previously injected, we can replace it, but it's simpler to just replace the whole section's inner HTML 
            // Actually, we just need it in the DOM. Let's put it right after the news-container
            return match;
        });

        // Better: Inject right before </main>
        indexHtml = indexHtml.replace(/<\/main>/, `${seoHtml}\n    </main>`);
        // Note: The replace above will accumulate <noscript> blocks if run multiple times locally.
        // Let's clean up old ones first:
        indexHtml = indexHtml.replace(/<noscript><div class="seo-articles">[\s\S]*?<\/div><\/noscript>\n\s*/g, '');
        indexHtml = indexHtml.replace(/<\/main>/, `${seoHtml}\n    </main>`);
        
        fs.writeFileSync(INDEX_FILE, indexHtml);
        console.log(`[${new Date().toISOString()}] Successfully pre-rendered SEO articles into index.html`);
    } catch(e) {
        console.error("Failed to pre-render SEO HTML:", e);
    }

    console.log(`[${new Date().toISOString()}] Successfully saved ${mergedArray.length} total articles.`);
    process.exit(0);
}

run();
