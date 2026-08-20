// Global state
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordedBlob = null;

let teleprompterPlaying = false;
let teleprompterRAF = null;
let teleprompterLastFrame = 0;
let teleprompterSpeed = 60;
let userIsInteractingWithTeleprompter = false;
let resumeTeleprompterAfterInteraction = false;

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
const teleprompterPlayBtn = document.getElementById('teleprompterPlayBtn');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

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
    updateCharCount();
    updateSpeedDisplay();
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
    teleprompterPlayBtn.addEventListener('click', toggleTeleprompterPlayback);
    speedSlider.addEventListener('input', handleSpeedChange);

    teleprompterText.addEventListener('pointerdown', handleTeleprompterInteractionStart);
    teleprompterText.addEventListener('pointerup', handleTeleprompterInteractionEnd);
    teleprompterText.addEventListener('pointercancel', handleTeleprompterInteractionEnd);
    teleprompterText.addEventListener('touchstart', handleTeleprompterInteractionStart, { passive: true });
    teleprompterText.addEventListener('touchend', handleTeleprompterInteractionEnd, { passive: true });
    teleprompterText.addEventListener('wheel', handleTeleprompterWheel, { passive: true });
    teleprompterText.addEventListener('scroll', handleTeleprompterScroll);

    // Stop camera/mic when tab is hidden or page is left
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', stopAllTracks);
    window.addEventListener('beforeunload', stopAllTracks);
}

function updateCharCount() {
    const count = teleprompterText.value.length;
    charCount.textContent = `${count.toLocaleString()} characters`;
}

function updateSpeedDisplay() {
    teleprompterSpeed = Number(speedSlider.value);
    speedValue.textContent = `${teleprompterSpeed} px/s`;
}

function handleSpeedChange() {
    updateSpeedDisplay();
}

function toggleTeleprompterPlayback() {
    if (teleprompterPlaying) {
        stopTeleprompterPlayback();
        return;
    }
    startTeleprompterPlayback();
}

function startTeleprompterPlayback() {
    teleprompterPlaying = true;
    teleprompterPlayBtn.textContent = 'Pause';
    teleprompterLastFrame = performance.now();
    showStatus('Teleprompter playing.', 'info');
    teleprompterRAF = requestAnimationFrame(stepTeleprompter);
}

function stopTeleprompterPlayback() {
    teleprompterPlaying = false;
    teleprompterPlayBtn.textContent = 'Play';
    if (teleprompterRAF) {
        cancelAnimationFrame(teleprompterRAF);
        teleprompterRAF = null;
    }
}

function stepTeleprompter(now) {
    if (!teleprompterPlaying) return;
    const elapsed = (now - teleprompterLastFrame) / 1000;
    teleprompterLastFrame = now;

    if (!userIsInteractingWithTeleprompter) {
        teleprompterText.scrollTop += teleprompterSpeed * elapsed;
        const maxScroll = teleprompterText.scrollHeight - teleprompterText.clientHeight;
        if (teleprompterText.scrollTop >= maxScroll) {
            teleprompterText.scrollTop = maxScroll;
            stopTeleprompterPlayback();
            showStatus('Teleprompter reached the end.', 'success');
            return;
        }
    }

    teleprompterRAF = requestAnimationFrame(stepTeleprompter);
}

function handleTeleprompterInteractionStart() {
    userIsInteractingWithTeleprompter = true;
    resumeTeleprompterAfterInteraction = teleprompterPlaying;
    if (teleprompterPlaying) {
        teleprompterPlayBtn.textContent = 'Resume';
    }
}

function handleTeleprompterInteractionEnd() {
    userIsInteractingWithTeleprompter = false;
    if (resumeTeleprompterAfterInteraction) {
        teleprompterPlayBtn.textContent = 'Pause';
    } else if (!teleprompterPlaying) {
        teleprompterPlayBtn.textContent = 'Play';
    }
}

function handleTeleprompterWheel() {
    if (teleprompterPlaying) {
        userIsInteractingWithTeleprompter = true;
        resumeTeleprompterAfterInteraction = true;
        teleprompterPlayBtn.textContent = 'Resume';
        clearTimeout(handleTeleprompterWheel._timer);
        handleTeleprompterWheel._timer = setTimeout(() => {
            userIsInteractingWithTeleprompter = false;
            if (teleprompterPlaying) {
                teleprompterPlayBtn.textContent = 'Pause';
            }
        }, 120);
    }
}

function handleTeleprompterScroll() {
    if (userIsInteractingWithTeleprompter && teleprompterPlaying) {
        clearTimeout(handleTeleprompterScroll._timer);
        handleTeleprompterScroll._timer = setTimeout(() => {
            userIsInteractingWithTeleprompter = false;
            teleprompterPlayBtn.textContent = 'Pause';
        }, 120);
    }
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
    stopTeleprompterPlayback();
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

function getSupportedMimeType() {
    const types = [
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
    ];
    for (const type of types) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

function getFileExtensionFromMimeType(mimeType) {
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('webm')) return 'webm';
    return 'webm';
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

            const finalMimeType = mediaRecorder.mimeType || getSupportedMimeType() || 'video/webm';
            recordedBlob = new Blob(recordedChunks, { type: finalMimeType });
            showStatus('Recording complete. Save to Photos or Files.', 'success');
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

    const mimeType = recordedBlob.type || 'video/webm';
    const extension = getFileExtensionFromMimeType(mimeType);
    const fileName = `Daily-${new Date().toISOString().slice(0, 10)}-${Date.now()}.${extension}`;
    const file = new File([recordedBlob], fileName, { type: mimeType });

    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Daily Recording',
                text: 'Your recorded video'
            });
            showStatus('Open the shared file and save it to Photos/Files.', 'success');
            resetRecording();
            return;
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.warn('Web Share failed, falling back to download:', error);
        }
    }

    try {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showStatus('Downloaded the video file.', 'success');
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
