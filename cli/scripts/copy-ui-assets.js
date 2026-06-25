const fs = require('fs-extra');
const path = require('path');

async function copyUIAssets() {
    const root = path.join(__dirname, '..');

    // Source: cli/review-ui/index.html (the SPA)
    const src = path.join(root, 'review-ui');
    // Dest 1: cli/dist/review-ui/ (for running from dist)
    const destDist = path.join(root, 'dist', 'review-ui');
    // Dest 2: package root (already in place when developing from source)

    try {
        if (fs.existsSync(src)) {
            // Copy to dist/review-ui so it's co-located with compiled ReviewServer.js
            await fs.ensureDir(destDist);
            await fs.copy(src, destDist);
            console.log('✅ Review UI copied to dist/review-ui/');
        } else {
            console.error('❌ Source Review UI not found at:', src);
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Failed to copy Review UI:', err);
        process.exit(1);
    }
}

copyUIAssets();
