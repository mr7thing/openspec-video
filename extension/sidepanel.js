// Sidepanel Logic

let socket = null;
let jobs = [];
const SERVER_URL = 'ws://localhost:3000';

const statusEl = document.getElementById('status-indicator');
const jobListEl = document.getElementById('job-list');
const refreshBtn = document.getElementById('refresh-btn');

function connect() {
    socket = new WebSocket(SERVER_URL);

    socket.onopen = () => {
        console.log('Connected to OpsV Server');
        updateStatus(true);
        // Request jobs immediately
        socket.send(JSON.stringify({ type: 'GET_JOBS' }));
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
        // Update badge
        chrome.action.setBadgeText({ text: 'ON' });
        chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });
    } else {
        statusEl.className = 'status disconnected';
        statusEl.title = 'Disconnected (Is `opsv start` running?)';
        refreshBtn.disabled = true;
        chrome.action.setBadgeText({ text: 'OFF' });
        chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
    }
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'JOBS_LIST':
            jobs = msg.payload;
            renderJobs();
            break;
        case 'ASSET_SAVED':
            console.log('Asset saved:', msg.payload.path);
            // Ideally mark job as done locally or refresh list
            // For now, simple alert or toast
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

        // Truncate prompt or use ID
        const desc = job.payload && job.payload.prompt ? job.payload.prompt.substring(0, 40) + '...' : 'Job #' + index;

        item.innerHTML = `
            <div class="job-desc" title="${job.payload?.prompt}">
                <strong>${job.type}</strong><br>
                ${desc}
            </div>
            <button class="btn btn-action" onclick="runJob(${index})">Run</button>
        `;
        jobListEl.appendChild(item);
    });
}

window.runJob = (index) => {
    const job = jobs[index];
    if (!job) return;

    // Send to Active Tab (Gemini)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'EXECUTE_JOB',
                job: job
            });
        } else {
            alert('Please open Gemini in the active tab.');
        }
    });
};

/* Listen for Asset Data from Content Script to forward to Server */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ASSET_FOUND') {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'SAVE_ASSET',
                payload: {
                    path: request.job.outputPath, // Make sure job has this
                    data: request.data
                }
            }));

            // Notify content script
            sendResponse({ success: true });
        }
    }
});

refreshBtn.addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'GET_JOBS' }));
    }
});

// Start connection
connect();
