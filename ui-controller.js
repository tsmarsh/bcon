/**
 * UI Controller for the WebRTC application
 * Handles all DOM manipulation and user interface updates
 */

export class UIController {
    constructor(stateManager, webrtcManager) {
        this.stateManager = stateManager;
        this.webrtcManager = webrtcManager;

        // Cache DOM elements
        this.elements = {
            // Connection controls
            createInviteBtn: document.getElementById('create-invite'),
            joinRoomBtn: document.getElementById('join-room'),
            joinInput: document.getElementById('join-input'),
            inviteUrlInput: document.getElementById('invite-url'),
            processInviteBtn: document.getElementById('process-invite'),
            answerInput: document.getElementById('answer-input'),
            answerBlob: document.getElementById('answer-blob'),
            completeConnectionBtn: document.getElementById('complete-connection'),

            // User info
            nicknameInput: document.getElementById('nickname'),
            connectionCount: document.getElementById('connection-count'),

            // Peer container
            peersContainer: document.getElementById('peers-container'),

            // Status messages
            statusMessages: document.getElementById('status-messages'),

            // Modals
            inviteModal: document.getElementById('invite-modal'),
            inviteUrlDisplay: document.getElementById('invite-url-display'),
            copyUrlBtn: document.getElementById('copy-url'),
            qrcodeDiv: document.getElementById('qrcode'),

            answerModal: document.getElementById('answer-modal'),
            answerDisplay: document.getElementById('answer-display'),
            copyAnswerBtn: document.getElementById('copy-answer'),

            // Spatial view
            spatialCanvas: document.getElementById('spatial-canvas'),
            spatialContainer: document.getElementById('spatial-container'),
            toggleSpatialBtn: document.getElementById('toggle-spatial-view'),
            spatialView: document.querySelector('.spatial-view'),
            peerGrid: document.querySelector('.peer-grid')
        };

        // QR code instance
        this.qrcode = null;

        // Spatial view state
        this.isSpatialView = true;
        this.draggedPeer = null;
        this.dragOffset = { x: 0, y: 0 };

        // Bind event listeners
        this.bindEventListeners();

        // Subscribe to state changes
        this.subscribeToStateChanges();
    }

    /**
     * Bind all event listeners
     */
    bindEventListeners() {
        // Connection controls
        this.elements.createInviteBtn.addEventListener('click', () => this.handleCreateInvite());
        this.elements.joinRoomBtn.addEventListener('click', () => this.handleJoinRoom());
        this.elements.processInviteBtn.addEventListener('click', () => this.handleProcessInvite());
        this.elements.completeConnectionBtn.addEventListener('click', () => this.handleCompleteConnection());

        // Copy buttons
        this.elements.copyUrlBtn.addEventListener('click', () => this.copyToClipboard(this.elements.inviteUrlDisplay.value));
        this.elements.copyAnswerBtn.addEventListener('click', () => this.copyToClipboard(this.elements.answerDisplay.value));

        // Nickname input
        this.elements.nicknameInput.addEventListener('change', (e) => {
            this.stateManager.saveNickname(e.target.value);
        });

        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.add('hidden');
            });
        });

        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });

        // Check for invite in URL on load
        this.checkForInviteInUrl();

        // Spatial view toggle
        this.elements.toggleSpatialBtn.addEventListener('click', () => this.toggleView());

        // Spatial drag and drop
        this.elements.spatialCanvas.addEventListener('mousedown', (e) => this.handleSpatialMouseDown(e));
        this.elements.spatialCanvas.addEventListener('mousemove', (e) => this.handleSpatialMouseMove(e));
        this.elements.spatialCanvas.addEventListener('mouseup', (e) => this.handleSpatialMouseUp(e));
        this.elements.spatialCanvas.addEventListener('mouseleave', (e) => this.handleSpatialMouseUp(e));

        // Touch support for mobile
        this.elements.spatialCanvas.addEventListener('touchstart', (e) => this.handleSpatialTouchStart(e));
        this.elements.spatialCanvas.addEventListener('touchmove', (e) => this.handleSpatialTouchMove(e));
        this.elements.spatialCanvas.addEventListener('touchend', (e) => this.handleSpatialTouchEnd(e));
    }

    /**
     * Subscribe to state manager events
     */
    subscribeToStateChanges() {
        this.stateManager.on('peerAdded', (data) => this.handlePeerAdded(data));
        this.stateManager.on('peerRemoved', (data) => this.handlePeerRemoved(data));
        this.stateManager.on('localMediaStateChanged', (data) => this.updatePeerMediaControls(data.peerId));
        this.stateManager.on('remoteMediaStateChanged', (data) => this.updatePeerMediaControls(data.peerId));
        this.stateManager.on('peerPositionChanged', (data) => this.updatePeerSpatialPosition(data.peerId, data.position));
    }

    /**
     * Check for invite in URL on page load
     */
    checkForInviteInUrl() {
        const hash = window.location.hash.substring(1); // Remove #
        if (hash) {
            const inviteData = CompressionUtils.parseInviteUrl(hash);
            if (inviteData) {
                // Auto-process the invite
                this.processInviteFromUrl(inviteData);
            }
        }
    }

    /**
     * Handle create invite button click
     */
    async handleCreateInvite() {
        try {
            const connectionId = CompressionUtils.createConnectionId();
            const inviteUrl = await this.webrtcManager.createOffer(connectionId);

            // Show invite modal
            this.showInviteModal(inviteUrl, connectionId);

            this.showStatus('Invite link created. Waiting for peer...', 'info');
        } catch (error) {
            this.showStatus('Failed to create invite: ' + error.message, 'error');
        }
    }

    /**
     * Handle join room button click
     */
    handleJoinRoom() {
        this.elements.joinInput.classList.toggle('hidden');
        this.elements.inviteUrlInput.focus();
    }

    /**
     * Handle process invite button click
     */
    async handleProcessInvite() {
        const url = this.elements.inviteUrlInput.value.trim();
        if (!url) {
            this.showStatus('Please enter an invite URL', 'error');
            return;
        }

        try {
            // Extract hash from URL
            const urlObj = new URL(url);
            const hash = urlObj.hash.substring(1);
            const inviteData = CompressionUtils.parseInviteUrl(hash);

            if (!inviteData) {
                throw new Error('Invalid invite URL');
            }

            await this.processInviteFromUrl(inviteData);
        } catch (error) {
            this.showStatus('Failed to process invite: ' + error.message, 'error');
        }
    }

    /**
     * Process invite from URL
     */
    async processInviteFromUrl(inviteData) {
        try {
            const answerBlob = await this.webrtcManager.processInvite(inviteData);

            // Show answer modal
            this.showAnswerModal(answerBlob);

            // Clear URL hash
            window.location.hash = '';

            // Hide join input
            this.elements.joinInput.classList.add('hidden');
            this.elements.inviteUrlInput.value = '';

            this.showStatus('Connection established! Share the answer with the inviter.', 'success');
        } catch (error) {
            this.showStatus('Failed to process invite: ' + error.message, 'error');
        }
    }

    /**
     * Handle complete connection button click
     */
    async handleCompleteConnection() {
        const answerBlob = this.elements.answerBlob.value.trim();
        if (!answerBlob) {
            this.showStatus('Please enter the answer blob', 'error');
            return;
        }

        const connectionId = this.elements.answerInput.dataset.connectionId;
        if (!connectionId) {
            this.showStatus('No pending connection found', 'error');
            return;
        }

        try {
            await this.webrtcManager.completeConnection(connectionId, answerBlob);

            // Hide answer input and invite modal
            this.elements.answerInput.classList.add('hidden');
            this.elements.inviteModal.classList.add('hidden');
            this.elements.answerBlob.value = '';

            this.showStatus('Connection completed successfully!', 'success');
        } catch (error) {
            this.showStatus('Failed to complete connection: ' + error.message, 'error');
        }
    }

    /**
     * Show invite modal with URL and QR code
     */
    showInviteModal(inviteUrl, connectionId) {
        this.elements.inviteUrlDisplay.value = inviteUrl;

        // Generate QR code
        if (this.qrcode) {
            this.qrcode.clear();
            this.qrcode.makeCode(inviteUrl);
        } else {
            this.qrcode = new QRCode(this.elements.qrcodeDiv, {
                text: inviteUrl,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
        }

        // Store connection ID for answer processing
        this.elements.answerInput.dataset.connectionId = connectionId;

        // Show modal
        this.elements.inviteModal.classList.remove('hidden');

        // Show answer input section
        this.elements.answerInput.classList.remove('hidden');
    }

    /**
     * Show answer modal
     */
    showAnswerModal(answerBlob) {
        this.elements.answerDisplay.value = answerBlob;
        this.elements.answerModal.classList.remove('hidden');
    }

    /**
     * Handle peer added event
     */
    handlePeerAdded(data) {
        const { peerId, metadata } = data;

        // Create peer card for grid view
        const peerCard = this.createPeerCard(peerId, metadata);
        this.elements.peersContainer.appendChild(peerCard);

        // Create spatial avatar
        const spatialAvatar = this.createSpatialAvatar(peerId, metadata);
        this.elements.spatialCanvas.appendChild(spatialAvatar);

        // Update connection count
        this.updateConnectionCount();
    }

    /**
     * Handle peer removed event
     */
    handlePeerRemoved(data) {
        const { peerId } = data;

        // Remove peer card
        const peerCard = document.getElementById(`peer-${peerId}`);
        if (peerCard) {
            peerCard.remove();
        }

        // Remove spatial avatar
        const spatialAvatar = document.getElementById(`spatial-${peerId}`);
        if (spatialAvatar) {
            spatialAvatar.remove();
        }

        // Update connection count
        this.updateConnectionCount();
    }

    /**
     * Create a peer card element
     */
    createPeerCard(peerId, metadata) {
        const card = document.createElement('div');
        card.className = 'peer-card';
        card.id = `peer-${peerId}`;

        card.innerHTML = `
            <div class="peer-header">
                <span class="peer-nickname">${metadata.nickname || 'Anonymous'}</span>
                <div class="peer-status">
                    <span class="status-indicator connecting"></span>
                    <span class="status-text">Connecting...</span>
                </div>
            </div>
            <div class="peer-controls">
                <button class="share-btn" data-peer-id="${peerId}">
                    Share Audio
                </button>
                <button class="mute-btn" data-peer-id="${peerId}">
                    Mute
                </button>
            </div>
            <div class="audio-visualizer hidden">
                <!-- Future audio visualization -->
            </div>
        `;

        // Bind control buttons
        const shareBtn = card.querySelector('.share-btn');
        const muteBtn = card.querySelector('.mute-btn');

        shareBtn.addEventListener('click', () => this.toggleAudioSharing(peerId));
        muteBtn.addEventListener('click', () => this.toggleMute(peerId));

        return card;
    }

    /**
     * Update peer media controls
     */
    updatePeerMediaControls(peerId) {
        const card = document.getElementById(`peer-${peerId}`);
        if (!card) return;

        const connection = this.stateManager.connections.get(peerId);
        const localMedia = this.stateManager.localMediaState.get(peerId);
        const remoteMedia = this.stateManager.remoteMediaState.get(peerId);

        // Update connection status
        if (connection) {
            const statusIndicator = card.querySelector('.status-indicator');
            const statusText = card.querySelector('.status-text');

            if (connection.connectionState === 'connected') {
                statusIndicator.className = 'status-indicator connected';
                statusText.textContent = 'Connected';
            } else if (connection.connectionState === 'failed') {
                statusIndicator.className = 'status-indicator';
                statusText.textContent = 'Failed';
            }
        }

        // Update share button
        const shareBtn = card.querySelector('.share-btn');
        if (localMedia && localMedia.isSharing) {
            shareBtn.textContent = 'Stop Sharing';
            shareBtn.classList.add('stop-btn');
            shareBtn.classList.remove('share-btn');
        } else {
            shareBtn.textContent = 'Share Audio';
            shareBtn.classList.add('share-btn');
            shareBtn.classList.remove('stop-btn');
        }

        // Update mute button
        const muteBtn = card.querySelector('.mute-btn');
        if (remoteMedia && remoteMedia.isMuted) {
            muteBtn.textContent = 'Unmute';
            muteBtn.classList.add('muted');
        } else {
            muteBtn.textContent = 'Mute';
            muteBtn.classList.remove('muted');
        }
    }

    /**
     * Toggle audio sharing with a peer
     */
    async toggleAudioSharing(peerId) {
        try {
            const localMedia = this.stateManager.localMediaState.get(peerId);

            if (localMedia && localMedia.isSharing) {
                await this.webrtcManager.stopSharingAudio(peerId);
                this.showStatus('Stopped sharing audio', 'info');
            } else {
                await this.webrtcManager.startSharingAudio(peerId);
                this.showStatus('Started sharing audio', 'success');
            }

            this.updatePeerMediaControls(peerId);
        } catch (error) {
            this.showStatus('Failed to toggle audio: ' + error.message, 'error');
        }
    }

    /**
     * Toggle mute for a peer
     */
    toggleMute(peerId) {
        const remoteMedia = this.stateManager.remoteMediaState.get(peerId);
        const isMuted = remoteMedia ? remoteMedia.isMuted : false;

        this.webrtcManager.toggleRemoteMute(peerId, !isMuted);
        this.updatePeerMediaControls(peerId);
    }

    /**
     * Update connection count display
     */
    updateConnectionCount() {
        const count = this.stateManager.getPeerCount();
        this.elements.connectionCount.textContent = `Peers: ${count}`;
    }

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showStatus('Copied to clipboard!', 'success');
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showStatus('Copied to clipboard!', 'success');
        }
    }

    /**
     * Show status message
     */
    showStatus(message, type = 'info') {
        const statusEl = document.createElement('div');
        statusEl.className = `status-message ${type}`;
        statusEl.textContent = message;

        this.elements.statusMessages.appendChild(statusEl);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            statusEl.remove();
        }, 5000);
    }

    /**
     * Clean up UI
     */
    cleanup() {
        // Remove all peer cards
        this.elements.peersContainer.innerHTML = '';

        // Reset connection count
        this.updateConnectionCount();

        // Hide modals
        this.elements.inviteModal.classList.add('hidden');
        this.elements.answerModal.classList.add('hidden');

        // Clear inputs
        this.elements.inviteUrlInput.value = '';
        this.elements.answerBlob.value = '';
    }

    /**
     * Create spatial avatar for a peer
     */
    createSpatialAvatar(peerId, metadata) {
        const avatar = document.createElement('div');
        avatar.className = 'spatial-avatar peer-avatar';
        avatar.id = `spatial-${peerId}`;
        avatar.innerHTML = `
            <span>${metadata.nickname || 'Peer'}</span>
            <div class="distance-indicator"></div>
        `;

        // Set initial position
        const position = metadata.position || { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2 };
        this.updatePeerSpatialPosition(peerId, position);

        return avatar;
    }

    /**
     * Update peer spatial position
     */
    updatePeerSpatialPosition(peerId, position) {
        const avatar = document.getElementById(`spatial-${peerId}`);
        if (!avatar) return;

        const canvas = this.elements.spatialCanvas;
        const canvasRect = canvas.getBoundingClientRect();

        // Convert spatial coordinates to screen coordinates
        const screenPos = this.webrtcManager.spatialAudioManager.spatialToScreen(
            position,
            canvasRect.width,
            canvasRect.height
        );

        avatar.style.left = `${screenPos.x - 30}px`; // Center the avatar
        avatar.style.top = `${screenPos.y - 30}px`;

        // Update distance indicator
        const distance = Math.sqrt(position.x * position.x + position.y * position.y);
        const distanceEl = avatar.querySelector('.distance-indicator');
        if (distanceEl) {
            distanceEl.textContent = `${distance.toFixed(1)}m`;
        }
    }

    /**
     * Toggle between spatial and grid view
     */
    toggleView() {
        this.isSpatialView = !this.isSpatialView;

        if (this.isSpatialView) {
            this.elements.spatialView.classList.remove('hidden');
            this.elements.peerGrid.classList.add('hidden');
        } else {
            this.elements.spatialView.classList.add('hidden');
            this.elements.peerGrid.classList.remove('hidden');
        }
    }

    /**
     * Handle mouse down on spatial canvas
     */
    handleSpatialMouseDown(e) {
        const avatar = e.target.closest('.peer-avatar');
        if (!avatar) return;

        this.draggedPeer = avatar;
        const rect = avatar.getBoundingClientRect();
        const canvasRect = this.elements.spatialCanvas.getBoundingClientRect();

        this.dragOffset = {
            x: e.clientX - rect.left - 30,
            y: e.clientY - rect.top - 30
        };

        avatar.style.zIndex = '30';
    }

    /**
     * Handle mouse move on spatial canvas
     */
    handleSpatialMouseMove(e) {
        if (!this.draggedPeer) return;

        e.preventDefault();
        const canvasRect = this.elements.spatialCanvas.getBoundingClientRect();

        const x = e.clientX - canvasRect.left - this.dragOffset.x;
        const y = e.clientY - canvasRect.top - this.dragOffset.y;

        // Keep avatar within bounds
        const boundedX = Math.max(0, Math.min(canvasRect.width - 60, x));
        const boundedY = Math.max(0, Math.min(canvasRect.height - 60, y));

        this.draggedPeer.style.left = `${boundedX}px`;
        this.draggedPeer.style.top = `${boundedY}px`;
    }

    /**
     * Handle mouse up on spatial canvas
     */
    handleSpatialMouseUp(e) {
        if (!this.draggedPeer) return;

        const peerId = this.draggedPeer.id.replace('spatial-', '');
        const canvasRect = this.elements.spatialCanvas.getBoundingClientRect();

        // Convert screen position to spatial coordinates
        const screenPos = {
            x: parseFloat(this.draggedPeer.style.left) + 30,
            y: parseFloat(this.draggedPeer.style.top) + 30
        };

        const spatialPos = this.webrtcManager.spatialAudioManager.screenToSpatial(
            screenPos,
            canvasRect.width,
            canvasRect.height
        );

        // Update position in WebRTC manager
        this.webrtcManager.updatePeerPosition(peerId, spatialPos);

        this.draggedPeer.style.zIndex = '10';
        this.draggedPeer = null;
    }

    /**
     * Handle touch start on spatial canvas
     */
    handleSpatialTouchStart(e) {
        const touch = e.touches[0];
        const avatar = touch.target.closest('.peer-avatar');
        if (!avatar) return;

        e.preventDefault();
        this.draggedPeer = avatar;
        const rect = avatar.getBoundingClientRect();

        this.dragOffset = {
            x: touch.clientX - rect.left - 30,
            y: touch.clientY - rect.top - 30
        };

        avatar.style.zIndex = '30';
    }

    /**
     * Handle touch move on spatial canvas
     */
    handleSpatialTouchMove(e) {
        if (!this.draggedPeer) return;

        e.preventDefault();
        const touch = e.touches[0];
        const canvasRect = this.elements.spatialCanvas.getBoundingClientRect();

        const x = touch.clientX - canvasRect.left - this.dragOffset.x;
        const y = touch.clientY - canvasRect.top - this.dragOffset.y;

        const boundedX = Math.max(0, Math.min(canvasRect.width - 60, x));
        const boundedY = Math.max(0, Math.min(canvasRect.height - 60, y));

        this.draggedPeer.style.left = `${boundedX}px`;
        this.draggedPeer.style.top = `${boundedY}px`;
    }

    /**
     * Handle touch end on spatial canvas
     */
    handleSpatialTouchEnd(e) {
        if (!this.draggedPeer) return;

        e.preventDefault();
        this.handleSpatialMouseUp(e);
    }
} 