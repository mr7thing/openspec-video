// Content Script for Gemini
(function () {
    if (window.hasOpsVContentScript) {
        console.log('OpsV Automation Script already loaded. Skipping re-initialization.');
        return;
    }
    window.hasOpsVContentScript = true;

    // Remote Logger helper
    function remoteLog(...args) {
        console.log(...args);
        try {
            chrome.runtime.sendMessage({
                type: 'REMOTE_LOG',
                message: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
            }).catch(() => { }); // Ignore errors if sidepanel closed
        } catch (e) { }
    }

    // ... (rest of the functions: runJob, checkForResult, fetchAndSend, monitorGeneration) ...
    // Since I cannot match the huge block easily with replace_file_content in one go without errors if I miss a char,
    // I will use a different strategy: just add the guard at the top and close at bottom? 
    // Actually, simply checking `if (window.hasOpsVContentScript) return;` at the top is enough 
    // providing I can insert it before other const declarations. 
    // content.js has `const observer` inside functions, so scope is fine.
    // The top level listeners `chrome.runtime.onMessage` MIGHT accumulate if not careful, 
    // but `chrome.runtime.onMessage` listeners are not easily removed without a named function.
    // However, duplicate listeners are usually fine as long as they don't conflict. 
    // But `window.hasOpsVContentScript` is the best safety.

})();

// WAIT. replace_file_content replaces a block. 
// I should just insert the guard at the very top.

function remoteLog(...args) {
    console.log(...args);
    try {
        chrome.runtime.sendMessage({
            type: 'REMOTE_LOG',
            message: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
        }).catch(() => { }); // Ignore errors if sidepanel closed
    } catch (e) { }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_JOB') {
        remoteLog('OpsV Content: Received Job', request.job.id);
        runJob(request.job);
        sendResponse({ status: 'started' });
    } else if (request.type === 'CHECK_LAST_IMAGE') {
        remoteLog('OpsV Content: Checking for last generated image...');
        checkForResult(request.job);
        sendResponse({ status: 'checking' });
    }
});

function checkForResult(job) {
    remoteLog('OpsV: Running detailed result check...');
    const imgs = Array.from(document.querySelectorAll('img'));
    remoteLog(`OpsV: Found ${imgs.length} images on page.`);

    // Iterate backwards (latest images first)
    // Log the analysis of the last 3 images for debugging
    let checks = 0;
    for (let i = imgs.length - 1; i >= 0; i--) {
        const img = imgs[i];
        if (!img.src || !img.src.startsWith('http')) continue;

        checks++;
        const info = `[${i}] Src: ${img.src.substring(0, 30)}... Complete: ${img.complete} NatW: ${img.naturalWidth} RenderW: ${img.width}`;

        // Check if valid result
        if (img.complete && img.naturalWidth > 200) {
            remoteLog('OpsV: Found preview image:', info);

            // Search for high-res link nearby
            // Traverse up to find a container that might hold the download button
            let container = img.parentElement;
            let downloadLink = null;

            // Search up to 5 levels
            for (let k = 0; k < 5; k++) {
                if (!container) break;

                // Look for anchor with download attribute or convincing href
                const anchors = Array.from(container.querySelectorAll('a[href], button[aria-label*="Download"], button[aria-label*="下载"]'));

                if (anchors.length > 0) {
                    remoteLog(`OpsV debug: Found ${anchors.length} candidates in parent level ${k}`);
                    anchors.forEach(a => remoteLog('Candidate:', a.tagName, a.href, a.ariaLabel, a.innerHTML.substring(0, 20)));

                    // Prioritize standard download anchors
                    const realLink = anchors.find(a => a.tagName === 'A' && (a.hasAttribute('download') || a.href.includes('googleusercontent')));
                    if (realLink) {
                        downloadLink = realLink.href;
                        break;
                    }
                }
                container = container.parentElement;
            }

            if (downloadLink) {
                remoteLog('OpsV: Found High-Res Download Link:', downloadLink);
                fetchAndSend(downloadLink, img.src, job);
            } else {
                // Heuristic: Upgrade Google Image URL to full size and force JPG
                let finalUrl = img.src;
                if (finalUrl.includes('googleusercontent.com')) {
                    // Replace params (e.g. =w123-h456...) with =s4096-rj for full size JPG
                    finalUrl = finalUrl.replace(/=(w|h|s|c)[0-9a-zA-Z\-_]+.*/, '=s4096-rj');
                    remoteLog('OpsV: Upgraded Google Image URL to High-Res (=s4096-rj):', finalUrl);
                } else {
                    remoteLog('OpsV: Falling back to img.src (not a Google URL):', finalUrl);
                }
                fetchAndSend(finalUrl, img.src, job);
            }
            return;
        }

        // If loading, wait for it
        if (!img.complete) {
            remoteLog('OpsV: Found candidate loading:', info);
            // Attach listener
            const currentImg = img; // capture closure
            currentImg.onload = () => {
                remoteLog('OpsV: Candidate loaded:', currentImg.naturalWidth);
                if (currentImg.naturalWidth > 200) {
                    let finalUrl = currentImg.src;
                    if (finalUrl.includes('googleusercontent.com')) {
                        finalUrl = finalUrl.replace(/=(w|h|s|c)[0-9a-zA-Z\-_]+.*/, '=s4096-rj');
                    }
                    fetchAndSend(finalUrl, currentImg.src, job);
                }
            };
            // Depending on how many we want to "watch".
            // If this is the *very* last image, it's a strong candidate.
            if (checks <= 3) continue; // Keep checking a few more just in case
        }

        if (checks > 10) break; // Don't scan the whole page history
    }
    remoteLog('OpsV: No immediate completed result found in recent images.');

    // Retry logic: The page might be hydrating (loading).
    // If we found very few images, it's likely not ready.
    if (imgs.length < 5 && typeof job._retryCount === 'undefined') {
        job._retryCount = 0;
    }

    if (typeof job._retryCount !== 'undefined' && job._retryCount < 10) {
        job._retryCount++;
        remoteLog(`OpsV: Page might be loading (Img count: ${imgs.length}). Retrying check in 2s... (Attempt ${job._retryCount}/10)`);
        setTimeout(() => checkForResult(job), 2000);
    } else {
        remoteLog('OpsV: Giving up on recovery check. Manual intervention might be needed.');
    }
}

async function runJob(job) {
    console.log('OpsV: Received job', job);
    console.log('OpsV validation: payload=', job.payload);
    if (!job.payload || !job.payload.prompt) {
        console.error('OpsV Error: Invalid Job - Missing prompt', job);
        alert('Invalid Job: No prompt');
        return;
    }

    // 1. Find Input Box (Try multiple selectors)
    // Gemini 2.0 / Advanced often uses different containers
    const selectors = [
        'rich-textarea [contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        '#c-input',
        'textarea',
        'div[role="textbox"]' // Fallback
    ];

    console.log('OpsV: Starting selector search...');
    let inputBox = null;
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        console.log(`OpsV: Check selector "${sel}" ->`, el);
        if (el) {
            inputBox = el;
            console.log('OpsV: Found input box with selector:', sel);
            break;
        }
    }

    if (!inputBox) {
        console.error('OpsV Critical: Could not find input box. Dumping body:', document.body.innerHTML.substring(0, 500));
        alert('OpsV Error: Could not find input box on Gemini. Please check if the page looks correct.');
        return;
    }

    // 2. Clear & Inject Prompt
    inputBox.focus();
    // 3. To bypass Gemini's anti-automation: simulate typing character by character
    console.log('OpsV: Starting human-like typing simulation...');
    const text = job.payload.prompt;

    // Clear first
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    inputBox.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    // Type character by character
    for (const char of text) {
        // Focus multiple times just in case
        document.execCommand('insertText', false, char);
        inputBox.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        // Random short delay
        await new Promise(r => setTimeout(r, 10 + Math.random() * 20));
    }
    inputBox.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    // Simulate a human adding a space at the end
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    document.execCommand('insertText', false, ' ');
    inputBox.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    inputBox.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    inputBox.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));

    // 4. Wait for Send button to become enabled
    console.log('OpsV: Waiting for Send button to become ready...');
    let sendBtn = null;
    let t = 0;
    const sendSelectors = [
        '.send-button',
        'button[aria-label="Send message"]',
        'button[aria-label="发送消息"]',
        'button[aria-label="Send"]',
        'button[aria-label="发送"]',
        'button > span.mat-button-wrapper > mat-icon'
    ];

    while (!sendBtn && t < 20) {
        for (const sel of sendSelectors) {
            const btn = document.querySelector(sel);
            if (btn && !btn.disabled && btn.offsetParent !== null) {
                sendBtn = btn;
                break;
            }
        }
        if (!sendBtn && inputBox) {
            const parent = inputBox.closest('.input-area') || inputBox.parentElement?.parentElement;
            if (parent) {
                const btn = parent.querySelector('button');
                if (btn && !btn.disabled && btn.offsetParent !== null) sendBtn = btn;
            }
        }
        if (!sendBtn) {
            await new Promise(r => setTimeout(r, 200));
            t++;
        }
    }

    // If no specific send button, try finding the button next to input
    if (!sendBtn && inputBox) {
        // Traverse up and look for button
        const parent = inputBox.closest('.input-area') || inputBox.parentElement.parentElement;
        if (parent) sendBtn = parent.querySelector('button');
    }

    if (sendBtn) {
        console.log('OpsV: Dispatching human-like click to send button');
        // Small hesitation
        await new Promise(r => setTimeout(r, 600 + Math.random() * 800));

        const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
        const up = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
        const click = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });

        sendBtn.dispatchEvent(down);
        await new Promise(r => setTimeout(r, 50 + Math.random() * 50));
        sendBtn.dispatchEvent(up);
        sendBtn.dispatchEvent(click);

        // Wait for generation to start
        await new Promise(r => setTimeout(r, 1000));
        monitorGeneration(job);
    } else {
        console.error('OpsV: Send button not found or not enabled');
        alert('OpsV Error: Send button not found. Please click Send manually.');
        monitorGeneration(job);
    }
}

function monitorGeneration(job) {
    console.log('Monitoring generation...');

    // Snapshot existing images to avoid triggering on old results
    const initialImages = new Set(Array.from(document.querySelectorAll('img')).map(img => img.src));
    console.log(`OpsV: Checkpoint - ${initialImages.size} existing images.`);

    let found = false;

    const observer = new MutationObserver((mutations) => {
        if (found) return;

        // Check for new images or changes
        const imgs = Array.from(document.querySelectorAll('img'));

        // Filter for "Result" candidates: Large images that are NEW
        const candidates = imgs.filter(img => {
            return img.src && img.src.startsWith('http') && !initialImages.has(img.src);
        });

        // We specifically look for the *last* candidate that meets criteria
        if (candidates.length > 0) {
            const lastImg = candidates[candidates.length - 1];

            // Helper to upgrade resolution and force JPG
            const getHighResUrl = (url) => {
                if (url.includes('googleusercontent.com')) {
                    return url.replace(/=(w|h|s|c)[0-9a-zA-Z\-_]+.*/, '=s4096-rj');
                }
                return url;
            };

            // Check if it's "ready" (has dimensions)
            if (lastImg.complete && lastImg.naturalWidth > 200) {
                console.log('New valid image detected:', lastImg.src, lastImg.naturalWidth);
                found = true;
                fetchAndSend(getHighResUrl(lastImg.src), lastImg.src, job);
                observer.disconnect();
            } else if (!lastImg.complete) {
                // If not complete, add a load listener to it
                if (!lastImg.hasAttribute('data-opsv-listening')) {
                    lastImg.setAttribute('data-opsv-listening', 'true');
                    lastImg.onload = () => {
                        if (lastImg.naturalWidth > 200 && !found) {
                            console.log('Image loaded and valid:', lastImg.src);
                            found = true;
                            fetchAndSend(getHighResUrl(lastImg.src), lastImg.src, job);
                            observer.disconnect();
                        }
                    };
                }
            }
        }
    });

    // Observe childList AND attributes (src) to catch lazy loading or placeholder swaps
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
    });

    // Timeout 60s (Generations can be slow)
    setTimeout(() => {
        if (!found) {
            observer.disconnect();
            console.log('Timeout waiting for generation');
            // Fallback: Try one last check using checkRecovery logic
            checkForResult(job);
        }
    }, 60000);
}

async function fetchAndSend(url, fallbackUrl, job) {
    // Just send the URL to the sidepanel/background to handle fetching
    // This avoids CORS issues in content script and leverages extension permissions
    remoteLog('OpsV: Sending image URL to extension:', url.substring(0, 50) + '...');
    try {
        chrome.runtime.sendMessage({
            type: 'ASSET_FOUND',
            job: job,
            data: url,
            fallbackData: fallbackUrl // Include fallback data safely via parameter
        });
    } catch (e) {
        remoteLog('OpsV Error: Failed to send message:', e.message);
    }
}
