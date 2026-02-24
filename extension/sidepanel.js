// Sidepanel Logic

let socket = null;
let jobs = [];
const SERVER_URL = 'ws://127.0.0.1:3061';

const statusEl = document.getElementById('status-indicator');
const jobListEl = document.getElementById('job-list');
const refreshBtn = document.getElementById('refresh-btn');

let messageQueue = [];

function connect() {
    socket = new WebSocket(SERVER_URL);

    socket.onopen = () => {
        console.log('Connected to OpsV Server');
        updateStatus(true);
        // Request jobs immediately
        socket.send(JSON.stringify({ type: 'GET_JOBS' }));

        // Flush queue
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            socket.send(JSON.stringify(msg));
            console.log('Flushed queued message:', msg.type);
        }

        // Trigger recovery check if needed (double check)
        if (isRunningAll) {
            checkRecovery();
        }
    };

    socket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleMessage(msg);
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    };

    socket.onclose = () => {
        console.log('Disconnected');
        updateStatus(false);
        // Auto-reconnect after 3s
        setTimeout(connect, 3000);
    };

    socket.onerror = (err) => {
        console.error('Socket error:', err);
    };
}

function updateStatus(isConnected) {
    if (isConnected) {
        statusEl.className = 'status connected';
        statusEl.title = 'Connected';
        refreshBtn.disabled = false;
        // Update badge if available
        if (chrome.action) {
            chrome.action.setBadgeText({ text: 'ON' });
            chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });
        }
    } else {
        statusEl.className = 'status disconnected';
        statusEl.title = 'Disconnected (Is `opsv start` running?)';
        refreshBtn.disabled = true;
        if (chrome.action) {
            chrome.action.setBadgeText({ text: 'OFF' });
            chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
        }
    }
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'JOBS_LIST':
            jobs = msg.payload;
            const currentQueueSignature = jobs.length > 0 && jobs[0]._meta ? jobs[0]._meta.timestamp : null;

            // If the queue has changed (different timestamp/generation), reset progress
            chrome.storage.local.get(['queueState'], (result) => {
                if (result.queueState && result.queueState.queueSignature !== currentQueueSignature) {
                    currentJobIndex = 0;
                    isRunningAll = false;
                    saveState(currentQueueSignature);
                } else if (currentJobIndex >= jobs.length) {
                    currentJobIndex = 0;
                    isRunningAll = false;
                    saveState(currentQueueSignature);
                }
                updateControls();
                renderJobs();
            });
            break;
        case 'ASSET_SAVED':
            console.log('Asset saved:', msg.payload.path);

            // Mark current job as done visually (optional, for now just simple feedback)
            // If running sequence, trigger next
            if (isRunningAll) {
                currentJobIndex++;
                saveState();
                if (currentJobIndex < jobs.length) {
                    // Small delay to be safe
                    setTimeout(() => {
                        if (isRunningAll) window.runJob(currentJobIndex);
                    }, 1500);
                } else {
                    stopRunAll();
                    // Optional: Notification
                    if (chrome.action) {
                        chrome.action.setBadgeText({ text: 'DONE' });
                    }
                }
            }
            break;
        case 'ERROR':
            console.error('Server Error:', msg.payload);
            // Optionally alert user
            // alert('Server Error: ' + msg.payload);
            break;
    }
}

function renderJobs() {
    jobListEl.innerHTML = '';
    if (jobs.length === 0) {
        jobListEl.innerHTML = '<div style="padding:10px; text-align:center; color:#999;">No jobs in queue.</div>';
        return;
    }

    jobs.forEach((job, index) => {
        const item = document.createElement('div');
        item.className = 'job-item';

        // Use full prompt for display, but collapsible
        const fullPrompt = job.payload && job.payload.prompt ? job.payload.prompt : 'Job #' + index;
        const shortDesc = fullPrompt.substring(0, 60) + (fullPrompt.length > 60 ? '...' : '');

        item.innerHTML = `
            <div class="job-info">
                <strong>${job.type}</strong>
                <div class="job-desc-short" title="${fullPrompt}">${shortDesc}</div>
                <details class="job-details">
                    <summary>Show Full Prompt</summary>
                    <pre style="white-space: pre-wrap; font-size: 0.8em; color: #555;">${fullPrompt}</pre>
                </details>
            </div>
            <button class="btn btn-action" onclick="runJob(${index})">Run</button>
        `;
        jobListEl.appendChild(item);
    });
}

window.runJob = async (index) => {
    const job = jobs[index];
    if (!job) return;

    // Asset Loading Logic
    let jobWithAssets = { ...job };

    if (job.assets && job.assets.length > 0) {
        console.log('OpsV Job has assets. Fetching from Daemon...', job.assets);

        // Create a promise to wait for all assets
        const assetsData = [];

        // We need a one-off listener or a way to correlate responses.
        // Simple way: Send GET_ASSET and wait for ASSET_DATA.
        // We can wrap this in a promise map.

        // NOTE: WebSocket is async event based. We need a request/response correlation.
        // Adding a temporary listener.

        try {
            const fetchAsset = (path) => {
                return new Promise((resolve, reject) => {
                    const assetId = Math.random().toString(36).substring(7);

                    const handler = (event) => {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'ASSET_DATA' && msg.payload.assetId === assetId) {
                            socket.removeEventListener('message', handler);
                            resolve(msg.payload.data); // data:image/png;base64,...
                        } else if (msg.type === 'ERROR' && msg.payload.includes(path)) {
                            socket.removeEventListener('message', handler);
                            reject(new Error(msg.payload));
                        }
                    };

                    socket.addEventListener('message', handler);
                    socket.send(JSON.stringify({
                        type: 'GET_ASSET',
                        payload: { path: path, assetId: assetId }
                    }));

                    // Timeout
                    setTimeout(() => {
                        socket.removeEventListener('message', handler);
                        reject(new Error('Timeout fetching asset: ' + path));
                    }, 5000);
                });
            };

            // Fetch all sequentially or parallel
            for (const assetPath of job.assets) {
                const dataUrl = await fetchAsset(assetPath);
                assetsData.push(dataUrl);
            }

            // Attach to job payload for content script
            jobWithAssets.assetsData = assetsData;
            console.log('OpsV: Assets fetched successfully.', assetsData.length);

        } catch (err) {
            console.error('OpsV Error: Failed to fetch assets for job.', err);
            alert('Failed to load reference images: ' + err.message);
            return; // Stop if assets crucial? Or continue? Let's stop.
        }
    }

    // Helper: Send Message with Retry
    const sendToTab = (tabId, retry = true) => {
        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_JOB', job: jobWithAssets }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('OpsV: Send failed:', chrome.runtime.lastError.message);
                if (retry) {
                    console.log('OpsV: Attempting to inject script...');
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js']
                    }, () => {
                        if (chrome.runtime.lastError) {
                            alert('Fatal: Could not inject script.\n' + chrome.runtime.lastError.message);
                            stopRunAll();
                        } else {
                            // Retry once after injection
                            setTimeout(() => sendToTab(tabId, false), 500);
                        }
                    });
                } else {
                    alert('Error: Connection failed.\nPlease refresh the Gemini page.');
                    stopRunAll();
                }
            } else {
                console.log('OpsV: Job started successfully', response);
            }
        });
    };

    // Find Gemini Tab specifically
    chrome.tabs.query({ url: "https://gemini.google.com/*", currentWindow: true }, (tabs) => {
        // If not found in current window, try all windows
        if (tabs.length === 0) {
            chrome.tabs.query({ url: "https://gemini.google.com/*" }, (allTabs) => {
                processTabs(allTabs);
            });
        } else {
            processTabs(tabs);
        }
    });

    function processTabs(tabs) {
        if (tabs.length === 0) {
            alert('Gemini tab not found. Please open https://gemini.google.com');
            return;
        }

        // Prefer active tab if multiple
        let targetTab = tabs.find(t => t.active) || tabs[0];
        console.log('OpsV: Targeting Tab', targetTab.id, targetTab.title);
        sendToTab(targetTab.id);
    }
};

/* Listen for Asset Data from Content Script to forward to Server */
/* Listen for Asset Data from Content Script to forward to Server */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ASSET_FOUND') {
        const processAndSend = async () => {
            try {
                let finalData = request.data;
                // If it's a URL (http...), fetch it here to avoid CORS in content script
                if (typeof request.data === 'string' && request.data.startsWith('http')) {
                    console.log('Fetching image from URL in sidepanel...', request.data.substring(0, 30));
                    const response = await fetch(request.data);
                    const blob = await response.blob();
                    finalData = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                    console.log('Image fetched and converted to Base64');
                }

                const payload = {
                    type: 'SAVE_ASSET',
                    payload: {
                        path: request.job.output_path,
                        data: finalData
                    }
                };

                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify(payload));
                    console.log('Asset forwarded to server');
                } else {
                    console.log('Socket not ready, queuing asset...');
                    messageQueue.push(payload);
                }
            } catch (e) {
                console.error('Sidepanel: Failed to process asset', e);
            }
        };

        processAndSend();
        sendResponse({ success: true });
    } else if (request.type === 'REMOTE_LOG') {
        console.log('[Page]', request.message);
    }
});

const runAllBtn = document.getElementById('run-all-btn');
const stopBtn = document.getElementById('stop-btn');

let isRunningAll = false;
let currentJobIndex = 0;

refreshBtn.addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'GET_JOBS' }));
    }
});

runAllBtn.addEventListener('click', () => {
    if (jobs.length === 0) return;
    isRunningAll = true;
    currentJobIndex = 0;
    saveState();
    updateControls();
    window.runJob(0);
});

stopBtn.addEventListener('click', stopRunAll);

// Update controls based on state
function updateControls() {
    if (isRunningAll) {
        runAllBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        refreshBtn.disabled = true;
    } else {
        runAllBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        refreshBtn.disabled = statusEl.classList.contains('disconnected');
    }
}

// Persistence Logic
function saveState(signature = null) {
    const state = {
        isRunningAll,
        currentJobIndex,
        queueSignature: signature || (jobs.length > 0 && jobs[0]._meta ? jobs[0]._meta.timestamp : null),
        timestamp: Date.now()
    };
    chrome.storage.local.set({ queueState: state });
    console.log('OpsV state saved:', state);
}

function restoreState() {
    chrome.storage.local.get(['queueState'], (result) => {
        if (result.queueState) {
            const state = result.queueState;
            // Only restore if less than 24h old
            if (Date.now() - state.timestamp < 24 * 60 * 60 * 1000) {
                console.log('Restoring queue state:', state);
                isRunningAll = state.isRunningAll;
                currentJobIndex = state.currentJobIndex;
                updateControls();

                if (isRunningAll) {
                    console.log('Resuming queue at index:', currentJobIndex);
                    // Connection checking is handled in onopen
                }
            }
        }
    });
}

function checkRecovery() {
    chrome.tabs.query({ url: "https://gemini.google.com/*", currentWindow: true }, (tabs) => {
        const targetTab = tabs.find(t => t.active) || tabs[0];
        if (targetTab) {
            const job = jobs[currentJobIndex];
            if (job) {
                console.log('Asking content script to check for result of job:', job.id);
                chrome.tabs.sendMessage(targetTab.id, { type: 'CHECK_LAST_IMAGE', job: job }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Could not contact content script. Attempting re-injection...');
                        chrome.scripting.executeScript({
                            target: { tabId: targetTab.id },
                            files: ['content.js']
                        }, () => {
                            // Retry check after injection
                            setTimeout(() => {
                                chrome.tabs.sendMessage(targetTab.id, { type: 'CHECK_LAST_IMAGE', job: job });
                            }, 2000);
                        });
                    }
                });
            }
        }
    });
}

// Duplicate state definitions removed

// Hook into state changes
const originalRunAll = runAllBtn.onclick; // Note: we used addEventListener, so this is just for logic flow comment
// We need to call saveState() whenever isRunningAll or currentJobIndex changes.

// Update runAllBtn listener
runAllBtn.addEventListener('click', () => {
    // ... existing logic ...
    saveState();
});

// Update stopBtn listener
function stopRunAll() {
    isRunningAll = false;
    saveState(); // Save stopped state
    updateControls();
}

// Update handleMessage for ASSET_SAVED
// Inside handleMessage -> ASSET_SAVED:
//   currentJobIndex++;
//   saveState(); 

// Call restore on load
restoreState();

// Start connection
connect();
