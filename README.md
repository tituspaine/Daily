# Daily - Teleprompter Recording App

A simple, mobile-friendly web app for recording videos while reading from a teleprompter. Perfect for creating content, recording messages, or practicing speeches.

## Features

- 📱 **Mobile-Friendly**: Works perfectly on smartphones and tablets
- 🎥 **Front-Facing Camera**: Auto-opens your device's front camera for self-recording
- 📝 **Teleprompter**: Paste any amount of text to read from while recording
- 🎙️ **Audio & Video Recording**: Records both your face and audio
- 💾 **Hybrid Save**: Save/share the real recorded file and prefer MP4 export when possible
- 🔒 **Privacy-First**: All recordings stay on your device (no cloud upload)
- ✅ **Permission Memory**: Remembers your camera/microphone approval for next time

## How to Use

1. **Open the App**: Visit the app URL (hosted on GitHub Pages)
2. **Grant Permissions**: Allow camera and microphone access when prompted
3. **Add Script**: Paste your script/text into the text box in the middle
4. **Record**: Click the "Record" button to start recording
5. **Scroll & Read**: Scroll through your text with your thumb while reading
6. **Stop**: Click "Done" when finished
7. **Save**: Click "Save" to download the video to your device

## Technical Details

- **Built With**: Vanilla HTML, CSS, and JavaScript (no dependencies)
- **Browser Support**: Chrome, Firefox, Safari, Edge (with camera/microphone support)
- **Video Format**: MP4 when browser-supported, otherwise WebM with on-save MP4 conversion attempt and fallback
- **Storage**: Uses browser localStorage for permission memory
- **Deployment**: GitHub Pages (static site)

## File Structure

```
.
├── index.html       # Main HTML structure
├── styles.css       # Styling and responsive design
├── app.js          # JavaScript logic
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
- Videos are saved as real downloadable/shareable files (MP4 preferred; WebM fallback when conversion is unavailable)
- Works best on devices with modern browsers supporting MediaRecorder API

## License

MIT License - Feel free to use and modify as needed
