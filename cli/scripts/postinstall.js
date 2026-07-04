// ============================================================================
// OpsV postinstall — copy default configs to ~/.opsv/
// Only copies files that don't already exist (never overwrites user config).
// ============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILES = ['api_config.yaml', 'category_validate.yaml', 'input_types.yaml'];

function postinstall() {
  const sourceDir = path.join(__dirname, '..', '.opsv');
  const targetDir = path.join(os.homedir(), '.opsv');

  if (!fs.existsSync(sourceDir)) {
    console.warn('[videospec] Built-in .opsv directory not found, skipping.');
    return;
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const file of CONFIG_FILES) {
    const src = path.join(sourceDir, file);
    const dest = path.join(targetDir, file);

    if (!fs.existsSync(src)) continue;

    if (fs.existsSync(dest)) {
      // Preserve user customizations — skip silently
      continue;
    }

    try {
      fs.copyFileSync(src, dest);
      console.log(`[videospec] Created ~/.opsv/${file} (default config)`);
    } catch (err) {
      console.warn(`[videospec] Failed to copy ${file}: ${err.message}`);
    }
  }
}

postinstall();
