// Global state
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

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
    // Check if permissions were previously granted
    const permissionsGranted = localStorage.getItem(PERMISSIONS_KEY);
    
    if (permissionsGranted === 'true') {
        // Permissions were granted before, try to access devices
        await requestPermissions();
    } else if (permissionsGranted === null) {
        // First time visiting, show custom prompt
        showPermissionPrompt();
    }
    // If explicitly denied, do nothing
    
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
        // Request both camera and microphone
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: true
        });
        
        // Display camera feed
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
}

function updateCharCount() {
    const count = teleprompterText.value.length;
    charCount.textContent = `${count.toLocaleString()} characters`;
}

async function startRecording() {
    if (!mediaStream) {
        showStatus('Camera not available. Please check permissions.', 'error');
        return;
    }
    
    recordedChunks = [];
    
    try {
        // Create MediaRecorder with audio and video
        const options = {
            audioBitsPerSecond: 128000,
            videoBitsPerSecond: 2500000,
            mimeType: 'video/webm;codecs=vp9,opus'
        };
        
        // Fallback for browsers that don't support vp9
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm;codecs=vp8,opus';
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm';
        }
        
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
            showStatus('Recording complete. Click Save to download.', 'success');
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

function saveRecording() {
    if (recordedChunks.length === 0) {
        showStatus('No recording to save.', 'error');
        return;
    }
    
    try {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Daily-${new Date().toISOString().slice(0, 10)}-${new Date().getTime()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatus('Video saved successfully!', 'success');
        resetRecording();
    } catch (error) {
        console.error('Error saving recording:', error);
        showStatus('Failed to save video: ' + error.message, 'error');
    }
}

function discardRecording() {
    recordedChunks = [];
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
    
    // Clear message after 5 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = 'status-message';
        }, 5000);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
});
