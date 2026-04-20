// Sidepanel Logic

let socket = null;
let jobs = [];
const SERVER_URL = 'ws://127.0.0.1:3061';

const statusEl = document.getElementById('status-indicator');
const jobListEl = document.getElementById('job-list');
const refreshBtn = document.getElementById('refresh-btn');

let messageQueue = [];
let watermarkEngine = null;

const removeWatermarkCb = document.getElementById('remove-watermark-cb');
if (removeWatermarkCb) {
    chrome.storage.local.get(['removeWatermark'], (res) => {
        if (res.removeWatermark !== undefined) {
            removeWatermarkCb.checked = res.removeWatermark;
        }
    });
    removeWatermarkCb.addEventListener('change', (e) => {
        chrome.storage.local.set({ removeWatermark: e.target.checked });
    });
}

async function processWatermarkIfEnabled(blob, statusEl) {
    if (!removeWatermarkCb || !removeWatermarkCb.checked) return blob;

    // Save original HTML in case we overwrite links, but actually we'll just append status visually 
    // or rely on caller to restore links if needed.
    let originalHtml = "";
    if (statusEl) {
        originalHtml = statusEl.innerHTML;
        statusEl.innerHTML += `<span style="color:#9c27b0; font-weight:bold; margin-left:8px;">✨ 去水印...</span>`;
    }

    try {
        if (!watermarkEngine) {
            watermarkEngine = await window.WatermarkEngine.create();
        }

        const img = new Image();
        const imgUrl = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imgUrl;
        });

        const canvas = await watermarkEngine.removeWatermarkFromImage(img, { adaptiveMode: "always" });
        URL.revokeObjectURL(imgUrl);

        const processedBlob = await window.canvasToBlob(canvas, blob.type || 'image/png');
        if (statusEl) {
            statusEl.innerHTML = originalHtml; // restore links
            statusEl.innerHTML += `<span style="color:#4caf50; font-weight:bold; margin-left:8px;">✔ 已去印</span>`;
        }
        return processedBlob;
    } catch (e) {
        console.error('OpsV: Failed to remove watermark', e);
        if (statusEl) statusEl.innerHTML = originalHtml;
        return blob;
    }
}

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

            // Update UI status to 'Saved'
            const savedJob = jobs.find(j => j.output_path === msg.payload.path);
            if (savedJob) {
                const statusEl = document.getElementById(`status-${savedJob.id}`);
                if (statusEl) {
                    statusEl.innerHTML = `<span style="color:#4caf50; font-weight:bold;">✔ Saved (${new Date().toLocaleTimeString()})</span>`;
                }
            }

            // If running sequence, trigger next
            if (isRunningAll) {
                currentJobIndex++;
                saveState();
                // Skip disabled jobs
                while (currentJobIndex < jobs.length && jobs[currentJobIndex]._skip) {
                    currentJobIndex++;
                }

                if (currentJobIndex < jobs.length) {
                    // Add recommended 2.5s - 5s random delay to bypass Gemini frequency detection
                    const delay = 2500 + Math.random() * 2500;
                    console.log(`OpsV: Delaying next job for ${Math.round(delay)}ms...`);
                    setTimeout(() => {
                        if (isRunningAll) window.runJob(currentJobIndex);
                    }, delay);
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
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; width: 100%;">
                <div class="job-info" style="flex: 1; margin-right: 15px; overflow: hidden;">
                    <strong style="display:block; margin-bottom:4px;">${job.type}</strong>
                    <div class="job-desc-short" title="${fullPrompt}" style="font-size: 12px; color: #333; line-height: 1.4;">${shortDesc}</div>
                    <details class="job-details" style="margin-top: 6px;">
                        <summary style="font-size: 11px; cursor: pointer; color: #0066cc;">Show Full Prompt</summary>
                        <pre style="white-space: pre-wrap; font-size: 11px; color: #555; background: #fdfdfd; padding: 4px; border-radius: 4px; margin-top:4px;">${fullPrompt}</pre>
                    </details>
                </div>
                <div class="job-actions" id="actions-${job.id}" style="display: flex; flex-direction: column; gap: 6px; min-width: 60px; flex-shrink: 0;">
                </div>
            </div>
            <div id="status-${job.id}" style="font-size: 11px; padding: 0 6px; border-radius: 4px; color: #666; width: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; min-height: 18px;">
            </div>
            <div id="previews-${job.id}" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
            </div>
        `;

        const actionsDiv = item.querySelector(`#actions-${job.id}`);

        const runBtn = document.createElement('button');
        runBtn.className = 'btn btn-action';
        runBtn.textContent = 'Run';
        runBtn.addEventListener('click', () => {
            currentJobIndex = index;
            window.runJob(index);
        });

        const skipBtn = document.createElement('button');
        skipBtn.className = 'btn';
        skipBtn.textContent = job._skip ? 'Enable' : 'Skip';
        skipBtn.style.flex = '1';
        skipBtn.style.padding = '8px';
        skipBtn.style.backgroundColor = job._skip ? '#4caf50' : '#ff9800';
        skipBtn.style.color = 'white';
        skipBtn.style.border = 'none';
        skipBtn.style.borderRadius = '4px';
        skipBtn.style.cursor = 'pointer';
        skipBtn.addEventListener('click', () => {
            job._skip = !job._skip;
            renderJobs(); // Re-render to update UI
        });

        actionsDiv.appendChild(runBtn);
        actionsDiv.appendChild(skipBtn);

        // --- DRAG AND DROP BINDING ---
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
            item.style.border = '1px dashed #4caf50';
        });

        item.addEventListener('dragleave', (e) => {
            e.preventDefault();
            item.style.backgroundColor = '';
            item.style.border = '';
        });

        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            item.style.backgroundColor = '';
            item.style.border = '';

            console.log('OpsV Drop Event Detected');
            const dataTransfer = e.dataTransfer;

            let imageUrl = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain');

            if (imageUrl && imageUrl.startsWith('http')) {
                console.log('OpsV dropped image URL:', imageUrl);

                let highResUrl = imageUrl;
                if (imageUrl.includes('googleusercontent.com')) {
                    highResUrl = imageUrl.replace(/=(w|h|s|c)[0-9a-zA-Z\-_]+.*/, '=s4096-rj');
                }

                // Visual feedback immediate
                const origBg = item.style.backgroundColor;
                item.style.backgroundColor = '#d4edda';
                setTimeout(() => item.style.backgroundColor = origBg, 1000);

                // Inline processing to fix context messaging bug
                const statusEl = document.getElementById(`status-${job.id}`);
                if (statusEl) {
                    statusEl.innerHTML = `<span style="color:#ff9800; font-weight:bold;">⬇ Dragged: Fetching...</span>
                                          <a href="${highResUrl}" target="_blank" title="Copy Link" style="font-size:10px; color:#2196f3; text-decoration:none;">🔗 Link</a>`;
                }

                try {
                    let finalData = highResUrl;

                    const response = await fetch(highResUrl);
                    if (!response.ok) throw new Error('HTTP status ' + response.status);
                    let blob = await response.blob();

                    blob = await processWatermarkIfEnabled(blob, statusEl);

                    finalData = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });

                    // Construct payload
                    const payload = {
                        type: 'SAVE_ASSET',
                        payload: {
                            path: job.output_path,
                            data: finalData
                        }
                    };

                    // Dispatch to daemon
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify(payload));
                        console.log('Dropped Asset forwarded to server');
                    } else {
                        console.log('Socket not ready, queuing dropped asset...');
                        messageQueue.push(payload);
                    }

                    // Add to previews UI
                    const previewsContainer = document.getElementById(`previews-${job.id}`);
                    if (previewsContainer) {
                        const previewWrapper = document.createElement('div');
                        previewWrapper.style.position = 'relative';
                        previewWrapper.style.width = '80px';
                        previewWrapper.style.height = '45px';
                        previewWrapper.style.borderRadius = '4px';
                        previewWrapper.style.overflow = 'hidden';
                        previewWrapper.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';

                        const img = document.createElement('img');
                        img.src = finalData;
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';

                        const link = document.createElement('a');
                        link.href = highResUrl;
                        link.target = "_blank";
                        link.style.position = 'absolute';
                        link.style.top = '0';
                        link.style.left = '0';
                        link.style.right = '0';
                        link.style.bottom = '0';
                        link.title = 'Open Original Image URL';

                        previewWrapper.appendChild(img);
                        previewWrapper.appendChild(link);
                        previewsContainer.appendChild(previewWrapper);
                    }

                } catch (e) {
                    console.error('OpsV Dropped Fetch Failed:', e);
                    if (statusEl) {
                        statusEl.innerHTML = `<span style="color:#f44336; font-weight:bold;">✖ Fetch Failed</span>`;
                    }
                }
            } else {
                console.warn('OpsV: Dropped item is not a valid URL URL.', dataTransfer.types);
            }
        });

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
            const statusEl = document.getElementById(`status-${request.job.id}`);
            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#ff9800; font-weight:bold;">⬇ Downloading High-Res Image...</span>
                                      <a href="${request.data}" target="_blank" title="Copy Link" style="font-size:10px; color:#2196f3; text-decoration:none;">🔗 Link</a>`;
            }

            try {
                let finalData = request.data;
                // If it's a URL (http...), fetch it here to avoid CORS in content script
                if (typeof request.data === 'string' && request.data.startsWith('http')) {
                    console.log('Fetching image from URL in sidepanel...', request.data.substring(0, 30));
                    try {
                        const response = await fetch(request.data);
                        if (!response.ok) throw new Error('HTTP status ' + response.status);
                        let blob = await response.blob();
                        if (blob.size < 5000) throw new Error('Image blob too small or empty'); // Force fallback if empty

                        blob = await processWatermarkIfEnabled(blob, statusEl);

                        finalData = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                        console.log('High-res image fetched and converted to Base64');
                    } catch (fetchErr) {
                        console.warn('OpsV: High-res fetch failed, trying fallback url...', fetchErr);
                        if (request.fallbackData) {
                            if (statusEl) statusEl.innerHTML = `<span style="color:#f44336;">⚠ High-Res failed, fetching Preview...</span>`;
                            const fbRes = await fetch(request.fallbackData);
                            let fbBlob = await fbRes.blob();
                            if (fbBlob.size < 1000) throw new Error('Fallback blob too small');

                            fbBlob = await processWatermarkIfEnabled(fbBlob, statusEl);

                            finalData = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.readAsDataURL(fbBlob);
                            });
                        } else {
                            throw fetchErr; // Re-throw if no fallback
                        }
                    }
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

                // Add to previews UI
                const previewsContainer = document.getElementById(`previews-${request.job.id}`);
                if (previewsContainer) {
                    const previewWrapper = document.createElement('div');
                    previewWrapper.style.position = 'relative';
                    previewWrapper.style.width = '80px';
                    previewWrapper.style.height = '45px';
                    previewWrapper.style.borderRadius = '4px';
                    previewWrapper.style.overflow = 'hidden';
                    previewWrapper.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';

                    const img = document.createElement('img');
                    img.src = finalData;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';

                    const link = document.createElement('a');
                    link.href = request.data;
                    link.target = "_blank";
                    link.style.position = 'absolute';
                    link.style.top = '0';
                    link.style.left = '0';
                    link.style.right = '0';
                    link.style.bottom = '0';
                    link.title = 'Open Original Image URL';

                    previewWrapper.appendChild(img);
                    previewWrapper.appendChild(link);
                    previewsContainer.appendChild(previewWrapper);
                }

            } catch (e) {
                console.error('Sidepanel: Failed to process asset', e);
                const statusEl = document.getElementById(`status-${request.job.id}`);
                if (statusEl) {
                    statusEl.innerHTML = `<span style="color:#f44336; font-weight:bold;">✖ Fetch Failed</span>`;
                }
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

    // Find first non-skipped job if current is skipped
    if (jobs[currentJobIndex] && jobs[currentJobIndex]._skip) {
        while (currentJobIndex < jobs.length && jobs[currentJobIndex]._skip) {
            currentJobIndex++;
        }
    }

    if (currentJobIndex >= jobs.length) {
        currentJobIndex = 0;
        // Make one more pass to find an unskipped job
        while (currentJobIndex < jobs.length && jobs[currentJobIndex]._skip) {
            currentJobIndex++;
        }
        if (currentJobIndex >= jobs.length) {
            alert("No runnable jobs found in the queue.");
            isRunningAll = false;
            return;
        }
    }

    saveState();
    updateControls();
    window.runJob(currentJobIndex);
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
