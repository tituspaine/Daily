# Daily - Teleprompter Recording App

A simple, mobile-friendly web app for recording videos while reading from a teleprompter. Perfect for creating content, recording messages, or practicing speeches.

## Features

- 📱 **Mobile-Friendly**: Works perfectly on smartphones and tablets
- 🎥 **Front-Facing Camera**: Auto-opens your device's front camera for self-recording
- 📝 **Teleprompter**: Paste any amount of text to read from while recording
- ▶️ **Teleprompter Playback**: Play/pause auto-scroll with a speed slider and manual scroll pause/resume
- 🎙️ **Audio & Video Recording**: Records both your face and audio
- 💾 **Hybrid Save**: Prefer native MP4 recording, convert WebM to MP4 on Save when needed, and fall back to the original recording if conversion is unavailable
- 🔒 **Privacy-First**: All recordings stay on your device (no cloud upload)
- ✅ **Permission Memory**: Remembers your camera/microphone approval for next time

## How to Use

1. **Open the App**: Visit the app URL (hosted on GitHub Pages)
2. **Grant Permissions**: Allow camera and microphone access when prompted
3. **Add Script**: Paste your script/text into the text box in the middle
4. **Record**: Click the "Record" button to start recording
5. **Play the Teleprompter**: Use Play/Pause and adjust the scroll speed as needed
6. **Scroll & Read**: You can still drag/scroll the script manually and auto-scroll resumes when you release it
7. **Stop**: Click "Done" when finished
8. **Save**: Click "Save" to share/download the exported video file

## Technical Details

- **Built With**: Vanilla HTML, CSS, and JavaScript with vendored ffmpeg.wasm assets for browser-side MP4 conversion
- **Browser Support**: Chrome, Firefox, Safari, Edge (with camera/microphone support)
- **Video Format**: Native MP4 when available, otherwise WebM with on-device MP4 conversion on Save when supported
- **Storage**: Uses browser localStorage for permission memory
- **Deployment**: GitHub Pages (static site)

## File Structure

```
.
├── index.html       # Main HTML structure
├── styles.css       # Styling and responsive design
├── app.js          # JavaScript logic
├── vendor/ffmpeg/  # Local ffmpeg.wasm assets for MP4 conversion
└── README.md       # This file
```

## Browser Compatibility

- ✅ Chrome/Edge 60+
- ✅ Firefox 55+
- ✅ Safari 14.1+
- ✅ Most modern mobile browsers

## Notes

- Recordings are NOT stored in the cloud - they're saved locally to your device
- Camera/microphone permissions are remembered in your browser's local storage
- MP4 export is preferred whenever the browser supports it natively
- WebM recordings are converted to MP4 on Save when the browser can run ffmpeg.wasm locally
- If MP4 conversion fails, the original recording is still saved so export never hard-fails
- Works best on devices with modern browsers supporting MediaRecorder API

## License

MIT License - Feel free to use and modify as needed
