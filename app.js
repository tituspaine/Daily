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
const PREFERRED_RECORDER_TYPES = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm'
];

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

window.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    setupEventListeners();
    updateCharCount();
    updateSpeedDisplay();

    // A previous denial or browser failure must never strand the app.
    // If access was previously granted, try to restore the camera. Otherwise
    // show an explicit user-action prompt so mobile Safari/Chrome can request it.
    if (localStorage.getItem(PERMISSIONS_KEY) === 'true') {
        const started = await requestPermissions(false);
        if (!started) showPermissionPrompt();
    } else {
        showPermissionPrompt();
    }
}

function showPermissionPrompt() {
    permissionPrompt.style.display = 'flex';
}

function hidePermissionPrompt() {
    permissionPrompt.style.display = 'none';
}

async function handleAllowAccess() {
    allowBtn.disabled = true;
    showStatus('Requesting camera and microphone access…', 'info');

    const started = await requestPermissions(true);
    if (started) {
        hidePermissionPrompt();
    } else {
        // Keep the prompt available so the user can retry after changing browser settings.
        showPermissionPrompt();
    }

    allowBtn.disabled = false;
}

function handleDenyAccess() {
    hidePermissionPrompt();
    localStorage.setItem(PERMISSIONS_KEY, 'false');
    showStatus('Camera and microphone are off. Tap Record or reload the page to request access again.', 'error');
}

async function requestPermissions(fromUserGesture = false) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        localStorage.setItem(PERMISSIONS_KEY, 'false');
        showStatus('This browser does not support camera and microphone access. Open Daily in Safari, Chrome, or another modern browser.', 'error');
        return false;
    }

    try {
        stopMediaTracksOnly();

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: true
        });

        mediaStream = stream;
        cameraPreview.srcObject = stream;
        cameraPreview.muted = true;
        cameraPreview.setAttribute('playsinline', '');

        try {
            await cameraPreview.play();
        } catch (playError) {
            console.warn('Camera preview play was deferred:', playError);
        }

        localStorage.setItem(PERMISSIONS_KEY, 'true');
        hidePermissionPrompt();
        showStatus('Camera and microphone ready!', 'success');
        return true;
    } catch (error) {
        console.error('Camera/microphone access failed:', error);
        localStorage.setItem(PERMISSIONS_KEY, 'false');

        const name = error && error.name ? error.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
            showStatus('Camera or microphone permission is blocked. Enable both for this site in your browser settings, then tap Allow Access again.', 'error');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            showStatus('No usable camera or microphone was found on this device.', 'error');
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
            showStatus('The camera or microphone is being used by another app. Close it and tap Allow Access again.', 'error');
        } else if (!fromUserGesture) {
            showStatus('Tap Allow Access to turn on the camera and microphone.', 'error');
        } else {
            showStatus('Unable to start the camera and microphone. Check browser permissions and try again.', 'error');
        }
        return false;
    }
}

function setupEventListeners() {
    allowBtn.addEventListener('click', handleAllowAccess);
    denyBtn.addEventListener('click', handleDenyAccess);
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
    if (teleprompterPlaying) teleprompterPlayBtn.textContent = 'Resume';
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
            if (teleprompterPlaying) teleprompterPlayBtn.textContent = 'Pause';
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
    } else if (!mediaStream) {
        // Do not silently call getUserMedia after returning from the background.
        // Mobile browsers are most reliable when permission/start happens from a tap.
        showPermissionPrompt();
        showStatus('Tap Allow Access to restart the camera and microphone.', 'info');
    }
}

function stopMediaTracksOnly() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    cameraPreview.srcObject = null;
}

function stopAllTracks() {
    stopTeleprompterPlayback();
    stopMediaTracksOnly();
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
    }
}

function getSupportedMimeType() {
    if (!window.MediaRecorder) return '';
    for (const type of PREFERRED_RECORDER_TYPES) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

function getFileExtensionFromMimeType(mimeType) {
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('mp4')) return 'mp4';
    return 'mp4';
}

async function startRecording() {
    if (!mediaStream || mediaStream.getTracks().every(track => track.readyState !== 'live')) {
        showPermissionPrompt();
        showStatus('Camera and microphone are not active. Tap Allow Access first.', 'error');
        return;
    }

    recordedChunks = [];
    recordedBlob = null;

    try {
        const mimeType = getSupportedMimeType();
        const options = {
            audioBitsPerSecond: 128000,
            videoBitsPerSecond: 2500000,
            bitsPerSecond: 3000000,
            videoKeyFrameIntervalDuration: 1000
        };
        if (mimeType) options.mimeType = mimeType;

        mediaRecorder = new MediaRecorder(mediaStream, options);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) recordedChunks.push(event.data);
        };

        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event.error || event);
            showStatus('Recording error occurred.', 'error');
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

            const finalMimeType = mediaRecorder.mimeType || getSupportedMimeType() || 'video/mp4';
            recordedBlob = new Blob(recordedChunks, { type: finalMimeType });
            showStatus(`Recording complete. Ready to save as ${getFileExtensionFromMimeType(finalMimeType).toUpperCase()}.`, 'success');
        };

        mediaRecorder.start(1000);
    } catch (error) {
        console.error('Error starting recording:', error);
        showStatus('Failed to start recording: ' + error.message, 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) mediaRecorder.stop();
}

async function saveRecording() {
    if (!recordedBlob) {
        showStatus('No recording to save.', 'error');
        return;
    }

    const mimeType = recordedBlob.type || 'video/mp4';
    const extension = getFileExtensionFromMimeType(mimeType);
    const fileName = `Daily-${new Date().toISOString().slice(0, 10)}-${Date.now()}.${extension}`;
    const file = new File([recordedBlob], fileName, { type: mimeType });

    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: 'Daily Recording', text: 'Your recorded video' });
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
