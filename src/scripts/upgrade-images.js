import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, '../../public/data/news.json');

function upgradeImageUrl(img) {
    if (!img) return img;
    
    let original = img;
    
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

    if (original !== img) {
        console.log(`Upgraded:\n  From: ${original}\n  To:   ${img}\n`);
    }
    
    return img;
}

function run() {
    console.log(`[${new Date().toISOString()}] Starting Manual Image Upgrade...`);
    
    if (!fs.existsSync(OUTPUT_FILE)) {
        console.error("No news.json database found. Exiting.");
        process.exit(1);
    }

    try {
        const rawData = fs.readFileSync(OUTPUT_FILE, 'utf-8');
        const db = JSON.parse(rawData);
        
        let upgradedCount = 0;

        if (db.articles && Array.isArray(db.articles)) {
            db.articles = db.articles.map(article => {
                const newImg = upgradeImageUrl(article.image);
                if (newImg !== article.image) {
                    article.image = newImg;
                    upgradedCount++;
                }
                return article;
            });
        }

        if (upgradedCount > 0) {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db, null, 2));
            console.log(`[Success] Upgraded ${upgradedCount} images to high-resolution.`);
        } else {
            console.log("No images needed upgrading. All good!");
        }

    } catch (error) {
        console.error("Error processing news.json:", error);
    }
}

run();
