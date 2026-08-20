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
let ffmpegConverterPromise = null;

const PERMISSIONS_KEY = 'daily_permissions_granted';
const FFMPEG_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

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

function isMp4MimeType(mimeType) {
    return typeof mimeType === 'string' && mimeType.includes('mp4');
}

function isWebmMimeType(mimeType) {
    return typeof mimeType === 'string' && mimeType.includes('webm');
}

function buildRecordingFileName(mimeType) {
    const extension = getFileExtensionFromMimeType(mimeType || 'video/webm');
    return `Daily-${new Date().toISOString().slice(0, 10)}-${Date.now()}.${extension}`;
}

async function getFfmpegConverter() {
    if (ffmpegConverterPromise) {
        return ffmpegConverterPromise;
    }

    ffmpegConverterPromise = (async () => {
        const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
            import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js'),
            import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js')
        ]);

        const ffmpeg = new FFmpeg();
        const [coreURL, wasmURL, workerURL] = await Promise.all([
            toBlobURL(`${FFMPEG_CDN_BASE}/ffmpeg-core.js`, 'text/javascript'),
            toBlobURL(`${FFMPEG_CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
            toBlobURL(`${FFMPEG_CDN_BASE}/ffmpeg-core.worker.js`, 'text/javascript')
        ]);

        await ffmpeg.load({ coreURL, wasmURL, workerURL });
        return { ffmpeg, fetchFile };
    })();

    return ffmpegConverterPromise;
}

async function convertWebmBlobToMp4(webmBlob) {
    const { ffmpeg, fetchFile } = await getFfmpegConverter();
    const inputName = `input-${Date.now()}.webm`;
    const outputName = `output-${Date.now()}.mp4`;

    try {
        await ffmpeg.writeFile(inputName, await fetchFile(webmBlob));
        await ffmpeg.exec([
            '-i', inputName,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'veryfast',
            '-movflags', '+faststart',
            '-c:a', 'aac',
            '-b:a', '128k',
            outputName
        ]);

        const data = await ffmpeg.readFile(outputName);
        const outputBytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        return new Blob([outputBytes], { type: 'video/mp4' });
    } finally {
        try {
            await ffmpeg.deleteFile(inputName);
        } catch (_error) {
            // Ignore cleanup errors
        }
        try {
            await ffmpeg.deleteFile(outputName);
        } catch (_error) {
            // Ignore cleanup errors
        }
    }
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

    saveBtn.disabled = true;
    let saveCompleted = false;
    let exportBlob = recordedBlob;
    let exportMimeType = recordedBlob.type || 'video/webm';

    if (isWebmMimeType(exportMimeType) && !isMp4MimeType(exportMimeType)) {
        showStatus('Preparing MP4 export...', 'info');
        try {
            const convertedBlob = await convertWebmBlobToMp4(recordedBlob);
            if (convertedBlob && convertedBlob.size > 0) {
                exportBlob = convertedBlob;
                exportMimeType = 'video/mp4';
                showStatus('Converted to MP4. Ready to save.', 'success');
            } else {
                showStatus('MP4 conversion returned empty output. Saving original video file.', 'info');
            }
        } catch (error) {
            console.warn('MP4 conversion unavailable, using original recording:', error);
            showStatus('MP4 conversion unavailable. Saving original video file.', 'info');
        }
    }

    const fileName = buildRecordingFileName(exportMimeType);
    const file = new File([exportBlob], fileName, { type: exportMimeType });

    try {
        if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Daily Recording',
                    text: 'Your recorded video'
                });
                showStatus('Open the shared file and save it to Photos/Files.', 'success');
                saveCompleted = true;
                resetRecording();
                return;
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.warn('Web Share failed, falling back to download:', error);
            }
        }

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
        saveCompleted = true;
        resetRecording();
    } catch (error) {
        console.error('Error saving recording:', error);
        showStatus('Failed to save video: ' + error.message, 'error');
    } finally {
        if (!saveCompleted && recordedBlob) {
            saveBtn.disabled = false;
        }
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
