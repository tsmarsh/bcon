# BCon - P2P Audio Network

A purely client-side, serverless WebRTC application that establishes a full-mesh network with manual invite links and per-peer media gating. Works entirely in the browser with no backend services required.

## Features

### Core Functionality
- **Manual Invite-Link Handshake**: Share connections via URLs or QR codes
- **Full-Mesh Architecture**: Direct P2P connections between all peers
- **Per-Peer Media Control**: Granular control over audio sharing with each peer
- **Persistent State**: Remembers peers and preferences using IndexedDB
- **Mobile-Friendly**: Responsive design that works on all devices
- **No Server Required**: Completely serverless, runs entirely in the browser

### Technical Features
- Compressed signaling payloads using pako
- STUN server support for NAT traversal
- Automatic ICE candidate gathering with timeout
- Connection health monitoring
- Browser permission handling
- Network status detection

## Quick Start

1. **Host the files**: Simply serve the files using any static web server:
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx serve .

   # Using PHP
   php -S localhost:8000
   ```

2. **Open in browser**: Navigate to `http://localhost:8000`

3. **Create a connection**:
   - User A: Click "Create Invite" and share the generated URL/QR code
   - User B: Open the shared URL or click "Join via URL" and paste it
   - User B: Copy the answer blob and share it back with User A
   - User A: Paste the answer blob in the "Complete Connection" field
   - Connection established!

## Usage Guide

### Creating an Invite
1. Enter your nickname (optional)
2. Click "Create Invite"
3. Share the URL or QR code with your peer
4. Wait for them to respond with an answer blob
5. Paste the answer blob and click "Complete Connection"

### Joining via Invite
1. Open the invite URL directly, or
2. Click "Join via URL" and paste the invite URL
3. Copy the generated answer blob
4. Share it with the person who invited you
5. Connection will be established automatically

### Audio Controls
Each connected peer has individual controls:
- **Share Audio**: Start sharing your microphone audio with this peer
- **Stop Sharing**: Stop sharing audio with this peer
- **Mute/Unmute**: Control incoming audio from this peer

### Connection Status
- 🟡 Yellow dot: Connecting
- 🟢 Green dot: Connected
- 🔴 Red dot: Disconnected/Failed

## Browser Support

### Required Features
- WebRTC (RTCPeerConnection)
- MediaDevices API
- IndexedDB
- ES6 Modules

### Tested Browsers
- Chrome/Edge 80+
- Firefox 75+
- Safari 14.1+
- Mobile Chrome/Safari

## Architecture

### File Structure
```
├── index.html           # Main HTML structure
├── app.js              # Application entry point
├── webrtc-manager.js   # WebRTC connection handling
├── state-manager.js    # Application state management
├── ui-controller.js    # DOM manipulation and UI updates
├── compression-utils.js # Payload compression utilities
├── styles.css          # Styling and animations
└── README.md           # This file
```

### State Management
The application maintains several state maps:
- **connections**: Active RTCPeerConnections
- **pendingConnections**: Connections awaiting completion
- **localMediaState**: Audio sharing status per peer
- **remoteMediaState**: Incoming audio and mute status
- **peerMetadata**: Peer information (nickname, join time, etc.)

### Security Considerations
- All connections are peer-to-peer (no server sees your data)
- WebRTC connections are encrypted by default
- No data is sent to external servers
- Invite URLs contain connection information (keep them private)

## Troubleshooting

### Connection Issues
- **"Failed to create offer"**: Check browser WebRTC support
- **"Connection failed"**: May be firewall/NAT issues, try different network
- **No audio**: Check microphone permissions in browser settings

### URL Too Long
If invite URLs are too long for your use case:
- Use shorter nicknames
- Share answer blobs via other means (email, chat, etc.)

### Mobile Issues
- Ensure browser has microphone permissions
- Keep screen on during connection establishment
- Some mobile browsers may limit background connections

## Future Enhancements

The architecture is designed to easily add:
- **Spatial Audio**: 3D positioning with Web Audio API
- **Video Sharing**: Add video tracks to existing connections
- **Screen Sharing**: Share screen/window with peers
- **Data Channels**: Text chat and file transfer
- **E2E Encryption**: Additional encryption layer
- **Peer Presence**: See when peers are online/offline

## Development

### Local Development
1. Clone or download the files
2. No build process required!
3. Serve files with any static server
4. Make changes and refresh browser

### Testing
- Test with multiple browser tabs/windows
- Use browser DevTools for debugging
- Check Console for detailed logs
- Network tab shows STUN requests

### Contributing
Feel free to submit issues and enhancement requests!

## License

This project is released into the public domain. Use it however you like!

## Credits

Built with:
- [pako](https://github.com/nodeca/pako) - Compression library
- [qrcode.js](https://github.com/davidshimjs/qrcodejs) - QR code generation
- Public STUN servers from Google

---

Made with ❤️ for the decentralized web 