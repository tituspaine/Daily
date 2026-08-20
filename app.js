// Global state
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordedBlob = null;
let recordingMimeType = '';
let saveInProgress = false;
let ffmpegInstance = null;
let ffmpegLoadPromise = null;

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
const exportHint = document.getElementById('exportHint');

const LOCAL_FFMPEG_ASSET_PATH = 'vendor/ffmpeg';

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
    updateExportHint();
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

function updateExportHint() {
    if (saveInProgress) {
        exportHint.textContent = 'Preparing your video export. Keep this tab open until Save finishes.';
        return;
    }

    if (recordedBlob) {
        if (isMp4MimeType(recordedBlob.type)) {
            exportHint.textContent = 'Ready to save as MP4. Share to Photos or download the MP4 file directly.';
            return;
        }

        if (isWebMType(recordedBlob.type)) {
            exportHint.textContent = 'Ready to save. This recording is WebM, so Save will try to convert it to MP4 first and will fall back to the original WebM if conversion is unavailable.';
            return;
        }
    }

    const preferredMimeType = getPreferredRecordingMimeType();
    if (isMp4MimeType(preferredMimeType)) {
        exportHint.textContent = 'This browser can record MP4 directly, so Save should export MP4 without converting.';
        return;
    }

    exportHint.textContent = 'This browser records WebM first. Save will try to convert it to MP4 on-device and will fall back to the original video if conversion is unavailable.';
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

function getPreferredRecordingMimeType() {
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

function isMp4MimeType(mimeType = '') {
    return mimeType.includes('mp4');
}

function isWebMType(mimeType = '') {
    return mimeType.includes('webm');
}

function getFileExtensionFromMimeType(mimeType) {
    if (isMp4MimeType(mimeType)) return 'mp4';
    if (isWebMType(mimeType)) return 'webm';
    return 'webm';
}

function getFormatLabel(mimeType = '') {
    if (isMp4MimeType(mimeType)) return 'MP4';
    if (isWebMType(mimeType)) return 'WebM';
    return 'video';
}

function setSaveState(inProgress, buttonLabel = 'Save') {
    saveInProgress = inProgress;
    saveBtn.disabled = inProgress || !recordedBlob;
    discardBtn.disabled = inProgress || (!recordedBlob && recordedChunks.length === 0);
    saveBtn.textContent = buttonLabel;
    updateExportHint();
}

function getExportFileName(mimeType) {
    const extension = getFileExtensionFromMimeType(mimeType);
    return `Daily-${new Date().toISOString().slice(0, 10)}-${Date.now()}.${extension}`;
}

async function ensureFFmpegLoaded() {
    if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg || !window.Worker || !window.WebAssembly) {
        throw new Error('Browser-side MP4 conversion is not supported in this browser.');
    }

    if (ffmpegInstance?.loaded) {
        return ffmpegInstance;
    }

    if (!ffmpegLoadPromise) {
        const { FFmpeg } = window.FFmpegWASM;
        const ffmpeg = new FFmpeg();
        const coreURL = new URL(`${LOCAL_FFMPEG_ASSET_PATH}/ffmpeg-core.js`, window.location.href).href;
        const wasmURL = new URL(`${LOCAL_FFMPEG_ASSET_PATH}/ffmpeg-core.wasm`, window.location.href).href;

        ffmpegLoadPromise = ffmpeg.load({ coreURL, wasmURL }).then(() => {
            ffmpegInstance = ffmpeg;
            return ffmpeg;
        }).catch((error) => {
            ffmpegLoadPromise = null;
            throw error;
        });
    }

    return ffmpegLoadPromise;
}

async function convertRecordingToMp4(blob) {
    const ffmpeg = await ensureFFmpegLoaded();
    const inputName = `input.${getFileExtensionFromMimeType(blob.type || 'video/webm')}`;
    const outputName = 'output.mp4';
    const inputData = new Uint8Array(await blob.arrayBuffer());
    const conversionCommands = [
        ['-i', inputName, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', outputName],
        ['-i', inputName, '-c:v', 'mpeg4', '-q:v', '5', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', outputName]
    ];

    await Promise.allSettled([
        ffmpeg.deleteFile(inputName),
        ffmpeg.deleteFile(outputName)
    ]);

    await ffmpeg.writeFile(inputName, inputData);

    let convertedData = null;
    let lastError = null;

    for (const args of conversionCommands) {
        try {
            const exitCode = await ffmpeg.exec(args, 120000);
            if (exitCode !== 0) {
                throw new Error(`FFmpeg exited with code ${exitCode}.`);
            }
            convertedData = await ffmpeg.readFile(outputName);
            break;
        } catch (error) {
            lastError = error;
            await Promise.allSettled([ffmpeg.deleteFile(outputName)]);
        }
    }

    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);

    if (!(convertedData instanceof Uint8Array)) {
        throw lastError || new Error('MP4 conversion did not produce an output file.');
    }

    return new Blob([convertedData], { type: 'video/mp4' });
}

function canShareFile(file) {
    if (!navigator.share || !navigator.canShare) {
        return false;
    }

    try {
        return navigator.canShare({ files: [file] });
    } catch (error) {
        console.warn('Unable to check native file sharing support:', error);
        return false;
    }
}

async function saveWithFilePicker(file, fileName) {
    if (!window.showSaveFilePicker) {
        return false;
    }

    const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
            description: `${getFormatLabel(file.type)} Video`,
            accept: { [file.type || 'application/octet-stream']: [`.${getFileExtensionFromMimeType(file.type)}`] }
        }]
    });

    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    return true;
}

async function downloadFile(file, fileName) {
    const url = URL.createObjectURL(file);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        const mimeType = getPreferredRecordingMimeType();
        recordingMimeType = mimeType || 'video/webm';
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
            updateExportHint();
            showStatus(`Recording started in ${getFormatLabel(recordingMimeType)} format.`, 'info');
        };

        mediaRecorder.onstop = () => {
            isRecording = false;
            recordBtn.disabled = false;
            stopBtn.disabled = true;
            saveBtn.disabled = false;
            discardBtn.disabled = false;
            recordingIndicator.classList.remove('active');

            const finalMimeType = mediaRecorder.mimeType || recordingMimeType || getPreferredRecordingMimeType() || 'video/webm';
            recordingMimeType = finalMimeType;
            recordedBlob = new Blob(recordedChunks, { type: finalMimeType });
            updateExportHint();
            if (isMp4MimeType(finalMimeType)) {
                showStatus('Recording complete. Save will export the MP4 file directly.', 'success');
            } else {
                showStatus('Recording complete. Save will try MP4 conversion first, then fall back to the original WebM if needed.', 'success');
            }
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
    if (saveInProgress) {
        showStatus('Save is already in progress.', 'info');
        return;
    }

    if (!recordedBlob) {
        showStatus('No recording to save.', 'error');
        return;
    }

    try {
        setSaveState(true, isWebMType(recordedBlob.type) ? 'Converting…' : 'Saving…');

        let exportBlob = recordedBlob;
        let exportMimeType = recordedBlob.type || recordingMimeType || 'video/webm';
        let convertedToMp4 = false;
        let usedFallbackFile = false;

        if (isWebMType(exportMimeType)) {
            showStatus('Preparing MP4 export from your WebM recording…', 'info');
            try {
                exportBlob = await convertRecordingToMp4(recordedBlob);
                exportMimeType = exportBlob.type || 'video/mp4';
                convertedToMp4 = true;
            } catch (error) {
                usedFallbackFile = true;
                console.warn('MP4 conversion failed, falling back to original recording:', error);
                showStatus('MP4 conversion was unavailable, so Save will use the original WebM recording instead.', 'info');
            }
        }

        const fileName = getExportFileName(exportMimeType);
        const file = new File([exportBlob], fileName, { type: exportMimeType });

        if (canShareFile(file)) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Daily Recording',
                    text: 'Your recorded video file'
                });
                showStatus(`Shared ${getFormatLabel(exportMimeType)} file. Use the share sheet to save it to Photos or Files.`, 'success');
                resetRecording();
                return;
            } catch (error) {
                if (error.name === 'AbortError') {
                    setSaveState(false);
                    showStatus('Save cancelled. Your recording is still ready to export.', 'info');
                    return;
                }
                console.warn('Web Share failed, falling back to direct save:', error);
            }
        }

        try {
            const savedWithPicker = await saveWithFilePicker(file, fileName);
            if (!savedWithPicker) {
                await downloadFile(file, fileName);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn('File picker save failed, falling back to browser download:', error);
            } else {
                setSaveState(false);
                showStatus('Save cancelled. Your recording is still ready to export.', 'info');
                return;
            }
            await downloadFile(file, fileName);
        }

        if (convertedToMp4) {
            showStatus('Saved an MP4 video file.', 'success');
        } else if (usedFallbackFile) {
            showStatus('Saved the original WebM video file because MP4 conversion was unavailable.', 'success');
        } else {
            showStatus(`Saved the ${getFormatLabel(exportMimeType)} video file.`, 'success');
        }
        resetRecording();
    } catch (error) {
        console.error('Error saving recording:', error);
        showStatus('Failed to save video: ' + error.message, 'error');
        setSaveState(false);
    }
}

function discardRecording() {
    recordedChunks = [];
    recordedBlob = null;
    recordingMimeType = '';
    resetRecording();
    showStatus('Recording discarded.', 'info');
}

function resetRecording() {
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    saveBtn.disabled = true;
    discardBtn.disabled = true;
    saveBtn.textContent = 'Save';
    saveInProgress = false;
    recordingIndicator.classList.remove('active');
    updateExportHint();
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
