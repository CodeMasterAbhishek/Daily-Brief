import fs from 'fs';
import path from 'path';
import { countryDir, upgradeImageUrl, writeJsonAtomic } from './rss-core.js';

const SHARD_FILE_RE = /^news-\d{4}-\d{2}\.json$/;

function upgradeChunkFile(filePath) {
    const db = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let upgradedCount = 0;

    if (db.articles && Array.isArray(db.articles)) {
        db.articles = db.articles.map(article => {
            const newImg = upgradeImageUrl(article.image);
            if (newImg !== article.image) {
                console.log(`Upgraded:\n  From: ${article.image}\n  To:   ${newImg}\n`);
                upgradedCount += 1;
                return { ...article, image: newImg };
            }
            return article;
        });
    }

    if (upgradedCount > 0) {
        writeJsonAtomic(filePath, db);
    }

    return upgradedCount;
}

function run() {
    console.log(`[${new Date().toISOString()}] Starting Manual Image Upgrade...`);
    const codes = String(process.env.FETCH_COUNTRIES || 'US')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean);

    let totalFiles = 0;
    let totalUpgraded = 0;

    for (const code of codes) {
        const dir = countryDir(code);
        if (!fs.existsSync(dir)) continue;
        const chunkFiles = fs.readdirSync(dir)
            .filter(name => SHARD_FILE_RE.test(name))
            .map(name => path.join(dir, name));
        totalFiles += chunkFiles.length;

        for (const filePath of chunkFiles) {
            try {
                const upgraded = upgradeChunkFile(filePath);
                if (upgraded > 0) {
                    console.log(`[${code}/${path.basename(filePath)}] Upgraded ${upgraded} images.`);
                }
                totalUpgraded += upgraded;
            } catch (error) {
                console.error(`Error processing ${path.basename(filePath)}:`, error.message);
            }
        }
    }

    if (totalFiles === 0) {
        console.error('No monthly news-YYYY-MM.json chunks found. Exiting.');
        process.exit(1);
    }

    if (totalUpgraded > 0) {
        console.log(`[Success] Upgraded ${totalUpgraded} images across ${totalFiles} monthly chunks.`);
    } else {
        console.log('No images needed upgrading. All good!');
    }
}

run();
