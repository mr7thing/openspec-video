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
                fetchAndSend(downloadLink, job);
            } else {
                // Heuristic: Upgrade Google Image URL to full size
                let finalUrl = img.src;
                if (finalUrl.includes('googleusercontent.com')) {
                    // Replace params (e.g. =w123-h456...) with =s0 for full size
                    // Regex looks for =w... or =h... at the end or mid-string
                    finalUrl = finalUrl.replace(/=(w|h|s|c)[0-9a-zA-Z\-_]+.*/, '=s0');
                    remoteLog('OpsV: Upgraded Google Image URL to High-Res (=s0):', finalUrl);
                } else {
                    remoteLog('OpsV: Falling back to img.src (not a Google URL):', finalUrl);
                }
                fetchAndSend(finalUrl, job);
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
                    fetchAndSend(currentImg.src, job);
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
    // Use execCommand for better compatibility with React/DraftJS editors
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    // Slight delay to let UI react
    await new Promise(r => setTimeout(r, 100));

    // 2a. Inject Assets (Images) if available
    if (job.assetsData && job.assetsData.length > 0) {
        console.log(`OpsV: Uploading ${job.assetsData.length} reference images...`);

        for (const dataUrl of job.assetsData) {
            try {
                // Convert DataURL to Blob/File
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                const file = new File([blob], "reference.png", { type: "image/png" });

                // Construct DataTransfer/ClipboardEvent
                const dt = new DataTransfer();
                dt.items.add(file);

                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dt
                });

                // Dispatch input
                inputBox.dispatchEvent(pasteEvent);

                console.log('OpsV: Dispatched paste event for image.');

                // Wait specifically for valid image preview to appear
                // Gemini typically adds a div with class 'image-preview' or similar inside the container
                // or somewhere in the DOM.

                // Wait a bit between uploads
                await new Promise(r => setTimeout(r, 1500));

            } catch (e) {
                console.error('OpsV Error: Failed to paste image', e);
            }
        }
    }

    document.execCommand('insertText', false, job.payload.prompt);

    // 3. Click Send
    setTimeout(() => {
        const sendSelectors = [
            '.send-button', // Primary class-based selector
            'button[aria-label="Send message"]', // English fallback
            'button[aria-label="Send"]',
            'button[aria-label="发送"]', // Chinese fallback
            'button > span.mat-button-wrapper > mat-icon' // Old angular style fallback
        ];

        let sendBtn = null;
        for (const sel of sendSelectors) {
            // Find button that isn't disabled
            const btn = document.querySelector(sel);
            if (btn && !btn.disabled) {
                sendBtn = btn;
                break;
            }
        }

        // If no specific send button, try finding the button next to input
        if (!sendBtn && inputBox) {
            // Traverse up and look for button
            const parent = inputBox.closest('.input-area') || inputBox.parentElement.parentElement;
            if (parent) sendBtn = parent.querySelector('button');
        }

        if (sendBtn) {
            console.log('OpsV: Clicking send button');
            sendBtn.click();
            monitorGeneration(job);
        } else {
            console.error('OpsV: Send button not found');
            alert('OpsV Error: Send button not found. Please click Send manually.');
            // Monitor anyway in case user clicks
            monitorGeneration(job);
        }
    }, 800);
}

function monitorGeneration(job) {
    console.log('Monitoring generation...');

    // Simple strategy: Observer for new images (img tag)
    // tailored for Gemini's current DOM structure.

    // We track "valid" images we've already seen to avoid duplicates?
    // Actually, just looking for "The New One".

    let initialImgCount = document.querySelectorAll('img').length;
    let found = false;

    const observer = new MutationObserver((mutations) => {
        if (found) return;

        // Check for new images or changes
        const imgs = Array.from(document.querySelectorAll('img'));

        // Filter for "Result" candidates: Large images
        // Note: naturalWidth might be 0 if not loaded yet.
        // We look for images that are likely the generation.
        const candidates = imgs.filter(img => {
            // Check if it's a large image (heuristic)
            // If checking immediately, width might be 0.
            // But usually Gemini generated images have specific classes or containers.
            // Let's rely on src present and size if metadata available, or just index position (newly at bottom).

            // Heuristic 1: It wasn't there before (index >= initialImgCount)
            // Heuristic 2: It is large (width > 200) - if loaded.

            return img.src && img.src.startsWith('http');
        });

        // We specifically look for the *last* candidate that meets criteria
        if (candidates.length > 0) {
            const lastImg = candidates[candidates.length - 1];

            // Check if it's "ready" (has dimensions)
            if (lastImg.complete && lastImg.naturalWidth > 200) {
                console.log('New valid image detected:', lastImg.src, lastImg.naturalWidth);
                found = true;
                fetchAndSend(lastImg.src, job);
                observer.disconnect();
            } else if (!lastImg.complete) {
                // If not complete, add a load listener to it
                if (!lastImg.hasAttribute('data-opsv-listening')) {
                    lastImg.setAttribute('data-opsv-listening', 'true');
                    lastImg.onload = () => {
                        if (lastImg.naturalWidth > 200 && !found) {
                            console.log('Image loaded and valid:', lastImg.src);
                            found = true;
                            fetchAndSend(lastImg.src, job);
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

async function fetchAndSend(url, job) {
    // Just send the URL to the sidepanel/background to handle fetching
    // This avoids CORS issues in content script and leverages extension permissions
    remoteLog('OpsV: Sending image URL to extension:', url.substring(0, 50) + '...');
    try {
        chrome.runtime.sendMessage({
            type: 'ASSET_FOUND',
            job: job,
            data: url // Send URL instead of base64
        });
    } catch (e) {
        remoteLog('OpsV Error: Failed to send message:', e.message);
    }
}
