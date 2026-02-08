// Content Script for Gemini

console.log('OpsV Automation Script Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_JOB') {
        runJob(request.job);
    }
});

async function runJob(job) {
    if (!job.payload || !job.payload.prompt) {
        alert('Invalid Job: No prompt');
        return;
    }

    // 1. Find Input Box
    const inputBox = document.querySelector('rich-textarea [contenteditable="true"]');
    if (!inputBox) {
        alert('Could not find input box. Are you on Gemini?');
        return;
    }

    // 2. Clear & Inject Prompt
    inputBox.innerHTML = '';
    // Simulate typing (sometimes needed for React handlers)
    inputBox.focus();
    document.execCommand('insertText', false, job.payload.prompt);

    // 3. Click Send
    setTimeout(() => {
        const sendBtn = document.querySelector('button[aria-label="Send message"]'); // Selector might need update
        if (sendBtn) {
            sendBtn.click();
            monitorGeneration(job);
        } else {
            console.error('Send button not found');
        }
    }, 500);
}

function monitorGeneration(job) {
    console.log('Monitoring generation...');

    // Simple strategy: Observer for new images (img tag)
    // A better way is to check the response container.
    // tailored for Gemini's current DOM structure.

    let initialImgCount = document.querySelectorAll('img').length;

    const observer = new MutationObserver((mutations) => {
        // Check for new images
        const imgs = document.querySelectorAll('img');
        if (imgs.length > initialImgCount) {
            // Potential new image. 
            // Filter for large images (likely the result)
            // This is heuristic and might need tuning.
            const newImg = imgs[imgs.length - 1]; // Assume last image

            if (newImg.src && newImg.src.startsWith('http')) {
                console.log('New image detected:', newImg.src);
                fetchAndSend(newImg.src, job);
                observer.disconnect();
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout 30s
    setTimeout(() => {
        observer.disconnect();
        console.log('Timeout waiting for generation');
    }, 30000);
}

async function fetchAndSend(url, job) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result;

            // Send back to sidepanel/background
            chrome.runtime.sendMessage({
                type: 'ASSET_FOUND',
                job: job,
                data: base64data
            });
            console.log('Asset sent to extension');
        };
        reader.readAsDataURL(blob);
    } catch (e) {
        console.error('Failed to process image:', e);
    }
}
