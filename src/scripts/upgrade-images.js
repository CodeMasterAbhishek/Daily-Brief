import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../public/data');

function upgradeImageUrl(img) {
    if (!img) return img;

    let original = img;

    if (img.includes('ichef.bbci.co.uk') && img.includes('/240/')) {
        img = img.replace('/240/', '/976/');
    } else if (img.includes('scx1.b-cdn.net') && img.includes('/tmb/')) {
        img = img.replace('/tmb/', '/800w/');
    } else if ((img.includes('ignimgs.com') || img.includes('techcrunch.com') || img.includes('polygon.com')) && img.includes('?')) {
        img = img.split('?')[0];
    } else if (img.includes('nytimes.com')) {
        img = img.replace('-moth.', '-superJumbo.').replace('-thumbStandard.', '-superJumbo.');
    }

    if (original !== img) {
        console.log(`Upgraded:\n  From: ${original}\n  To:   ${img}\n`);
    }

    return img;
}

function upgradeChunkFile(filePath) {
    const db = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
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
        fs.writeFileSync(filePath, JSON.stringify(db, null, 2));
    }

    return upgradedCount;
}

function run() {
    console.log(`[${new Date().toISOString()}] Starting Manual Image Upgrade...`);

    const chunkFiles = fs.readdirSync(DATA_DIR)
        .filter(name => name.startsWith('news-') && name.endsWith('.json'))
        .map(name => path.join(DATA_DIR, name));

    if (chunkFiles.length === 0) {
        console.error('No monthly news-YYYY-MM.json chunks found. Exiting.');
        process.exit(1);
    }

    let totalUpgraded = 0;
    for (const filePath of chunkFiles) {
        try {
            const upgraded = upgradeChunkFile(filePath);
            if (upgraded > 0) {
                console.log(`[${path.basename(filePath)}] Upgraded ${upgraded} images.`);
            }
            totalUpgraded += upgraded;
        } catch (error) {
            console.error(`Error processing ${path.basename(filePath)}:`, error.message);
        }
    }

    if (totalUpgraded > 0) {
        console.log(`[Success] Upgraded ${totalUpgraded} images across ${chunkFiles.length} monthly chunks.`);
    } else {
        console.log('No images needed upgrading. All good!');
    }
}

run();
