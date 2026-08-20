// Global state
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordedBlob = null;

const PERMISSIONS_KEY = 'daily_permissions_granted';

// DOM Elements
const cameraPreview = document.getElementById('cameraPreview');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const discardBtn = document.getElementById('discardBtn');
const teleprompterText = document.getElementById('teleprompterText');
const charCount = document.getElementById('charCount');
const statusMessage = document.getElementById('statusMessage');
const recordingIndicator = document.getElementById('recordingIndicator');
const permissionPrompt = document.getElementById('permissionPrompt');
const allowBtn = document.getElementById('allowBtn');
const denyBtn = document.getElementById('denyBtn');

// Initialize app on load
window.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    const permissionsGranted = localStorage.getItem(PERMISSIONS_KEY);

    if (permissionsGranted === 'true') {
        await requestPermissions();
    } else if (permissionsGranted === null) {
        showPermissionPrompt();
    }

    setupEventListeners();
}

function showPermissionPrompt() {
    permissionPrompt.style.display = 'flex';
}

allowBtn.addEventListener('click', async () => {
    permissionPrompt.style.display = 'none';
    localStorage.setItem(PERMISSIONS_KEY, 'true');
    await requestPermissions();
});

denyBtn.addEventListener('click', () => {
    permissionPrompt.style.display = 'none';
    localStorage.setItem(PERMISSIONS_KEY, 'false');
    showStatus('Camera and microphone access denied. You can enable it in settings.', 'error');
});

async function requestPermissions() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: true
        });
        cameraPreview.srcObject = mediaStream;
        showStatus('Camera and microphone ready!', 'success');
    } catch (error) {
        console.error('Permission denied:', error);
        localStorage.setItem(PERMISSIONS_KEY, 'false');
        showStatus('Unable to access camera/microphone. Please check permissions.', 'error');
    }
}

function setupEventListeners() {
    recordBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    saveBtn.addEventListener('click', saveRecording);
    discardBtn.addEventListener('click', discardRecording);
    teleprompterText.addEventListener('input', updateCharCount);

    // Stop camera/mic when tab is hidden or page is left
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', stopAllTracks);
    window.addEventListener('beforeunload', stopAllTracks);
}

function updateCharCount() {
    const count = teleprompterText.value.length;
    charCount.textContent = `${count.toLocaleString()} characters`;
}

function handleVisibilityChange() {
    if (document.hidden) {
        stopAllTracks();
    } else {
        if (localStorage.getItem(PERMISSIONS_KEY) === 'true' && !mediaStream) {
            requestPermissions();
        }
    }
}

function stopAllTracks() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
        cameraPreview.srcObject = null;
    }
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
    }
}

// Pick the best supported MIME type for this device
function getSupportedMimeType() {
    const types = [
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

async function startRecording() {
    if (!mediaStream) {
        showStatus('Camera not available. Please check permissions.', 'error');
        return;
    }

    recordedChunks = [];
    recordedBlob = null;

    try {
        const mimeType = getSupportedMimeType();
        const options = {
            audioBitsPerSecond: 128000,
            videoBitsPerSecond: 2500000,
        };
        if (mimeType) options.mimeType = mimeType;

        mediaRecorder = new MediaRecorder(mediaStream, options);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstart = () => {
            isRecording = true;
            recordBtn.disabled = true;
            stopBtn.disabled = false;
            recordingIndicator.classList.add('active');
            showStatus('Recording started...', 'info');
        };

        mediaRecorder.onstop = () => {
            isRecording = false;
            recordBtn.disabled = false;
            stopBtn.disabled = true;
            saveBtn.disabled = false;
            discardBtn.disabled = false;
            recordingIndicator.classList.remove('active');

            // Build the blob now so it's ready to save
            const mimeType = mediaRecorder.mimeType || 'video/mp4';
            recordedBlob = new Blob(recordedChunks, { type: mimeType });
            showStatus('Recording complete. Tap Save to save to your device.', 'success');
        };

        mediaRecorder.start();
    } catch (error) {
        console.error('Error starting recording:', error);
        showStatus('Failed to start recording: ' + error.message, 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
    }
}

async function saveRecording() {
    if (!recordedBlob) {
        showStatus('No recording to save.', 'error');
        return;
    }

    const mimeType = recordedBlob.type || 'video/mp4';
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const fileName = `Daily-${new Date().toISOString().slice(0, 10)}-${Date.now()}.${extension}`;

    // Try Web Share API first (shows native iOS share sheet with Save to Photos/Files)
    if (navigator.canShare && navigator.share) {
        try {
            const file = new File([recordedBlob], fileName, { type: mimeType });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Daily Recording',
                });
                showStatus('Video shared successfully!', 'success');
                resetRecording();
                return;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn('Web Share failed, falling back to download:', error);
            } else {
                // User cancelled the share sheet
                return;
            }
        }
    }

    // Fallback: trigger a download (works on desktop/Android)
    try {
        const url = URL.createObjectURL(recordedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showStatus('Video saved!', 'success');
        resetRecording();
    } catch (error) {
        console.error('Error saving recording:', error);
        showStatus('Failed to save video: ' + error.message, 'error');
    }
}

function discardRecording() {
    recordedChunks = [];
    recordedBlob = null;
    resetRecording();
    showStatus('Recording discarded.', 'info');
}

function resetRecording() {
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    saveBtn.disabled = true;
    discardBtn.disabled = true;
    recordingIndicator.classList.remove('active');
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;

    if (type !== 'error') {
        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = 'status-message';
        }, 5000);
    }
}
