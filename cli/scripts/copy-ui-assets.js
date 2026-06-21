const fs = require('fs-extra');
const path = require('path');

async function copyUIAssets() {
    const src = path.join(__dirname, '../src/review-ui/public');
    const dest = path.join(__dirname, '../dist/review-ui/public');

    try {
        if (fs.existsSync(src)) {
            await fs.ensureDir(path.dirname(dest));
            await fs.copy(src, dest);
            console.log('✅ Review UI assets copied to dist successfully.');
        } else {
            console.error('❌ Source Review UI assets not found at:', src);
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Failed to copy Review UI assets:', err);
        process.exit(1);
    }
}

copyUIAssets();
