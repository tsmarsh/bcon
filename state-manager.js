/**
 * State management for the WebRTC application
 * Handles all application state including connections, media, and peer data
 */

export class StateManager {
    constructor() {
        // Connection states
        this.connections = new Map(); // peerId -> RTCPeerConnection
        this.pendingConnections = new Map(); // connectionId -> {pc, timeoutId, type}

        // Media states
        this.localMediaState = new Map(); // peerId -> {isSharing: boolean, track: MediaStreamTrack}
        this.remoteMediaState = new Map(); // peerId -> {isMuted: boolean, track: MediaStreamTrack, audioElement: HTMLAudioElement}

        // Peer metadata
        this.peerMetadata = new Map(); // peerId -> {nickname, position, joinedAt, connectionId}

        // Local user state
        this.localPeerId = this.generatePeerId();
        this.localNickname = 'Anonymous';
        this.localStream = null;

        // Event listeners
        this.listeners = new Map();

        // Initialize IndexedDB
        this.initializeDatabase();
    }

    /**
     * Generate a unique peer ID
     * @returns {string} UUID for peer identification
     */
    generatePeerId() {
        // Use crypto.randomUUID if available (modern browsers)
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }

        // Fallback UUID v4 generator for older browsers
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Initialize IndexedDB for persistence
     */
    async initializeDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('BCon', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                this.loadPersistedData();
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store for peer metadata
                if (!db.objectStoreNames.contains('peers')) {
                    db.createObjectStore('peers', { keyPath: 'peerId' });
                }

                // Store for user preferences
                if (!db.objectStoreNames.contains('preferences')) {
                    db.createObjectStore('preferences', { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * Load persisted data from IndexedDB
     */
    async loadPersistedData() {
        try {
            // Load saved nickname
            const transaction = this.db.transaction(['preferences'], 'readonly');
            const store = transaction.objectStore('preferences');
            const nicknameRequest = store.get('nickname');

            nicknameRequest.onsuccess = () => {
                if (nicknameRequest.result) {
                    this.localNickname = nicknameRequest.result.value;
                    document.getElementById('nickname').value = this.localNickname;
                }
            };

            // Load known peers
            const peersTransaction = this.db.transaction(['peers'], 'readonly');
            const peersStore = peersTransaction.objectStore('peers');
            const peersRequest = peersStore.getAll();

            peersRequest.onsuccess = () => {
                peersRequest.result.forEach(peer => {
                    this.peerMetadata.set(peer.peerId, peer);
                });
            };
        } catch (error) {
            console.error('Failed to load persisted data:', error);
        }
    }

    /**
     * Save nickname to IndexedDB
     * @param {string} nickname - The nickname to save
     */
    async saveNickname(nickname) {
        this.localNickname = nickname;

        try {
            const transaction = this.db.transaction(['preferences'], 'readwrite');
            const store = transaction.objectStore('preferences');
            store.put({ key: 'nickname', value: nickname });
        } catch (error) {
            console.error('Failed to save nickname:', error);
        }
    }

    /**
     * Add a new peer connection
     * @param {string} peerId - The peer's ID
     * @param {RTCPeerConnection} connection - The WebRTC connection
     * @param {Object} metadata - Peer metadata
     */
    addConnection(peerId, connection, metadata) {
        this.connections.set(peerId, connection);
        this.peerMetadata.set(peerId, {
            ...metadata,
            joinedAt: Date.now()
        });

        // Initialize media states
        this.localMediaState.set(peerId, { isSharing: false, track: null });
        this.remoteMediaState.set(peerId, { isMuted: false, track: null, audioElement: null });

        // Persist peer metadata
        this.savePeerMetadata(peerId);

        // Emit event
        this.emit('peerAdded', { peerId, metadata });
    }

    /**
     * Remove a peer connection
     * @param {string} peerId - The peer's ID
     */
    removeConnection(peerId) {
        const connection = this.connections.get(peerId);
        if (connection) {
            connection.close();
            this.connections.delete(peerId);
        }

        // Clean up media
        const remoteMedia = this.remoteMediaState.get(peerId);
        if (remoteMedia && remoteMedia.audioElement) {
            remoteMedia.audioElement.srcObject = null;
            remoteMedia.audioElement.remove();
        }

        this.localMediaState.delete(peerId);
        this.remoteMediaState.delete(peerId);
        this.peerMetadata.delete(peerId);

        // Remove from persistence
        this.removePeerMetadata(peerId);

        // Emit event
        this.emit('peerRemoved', { peerId });
    }

    /**
     * Update peer position
     * @param {string} peerId - The peer ID
     * @param {Object} position - New position {x, y}
     */
    updatePeerPosition(peerId, position) {
        const metadata = this.peerMetadata.get(peerId);
        if (metadata) {
            metadata.position = position;
            this.peerMetadata.set(peerId, metadata);
            this.savePeerMetadata(peerId);
            this.emit('peerPositionChanged', { peerId, position });
        }
    }

    /**
     * Add a pending connection
     * @param {string} connectionId - The connection ID
     * @param {RTCPeerConnection} pc - The peer connection
     * @param {string} type - 'offer' or 'answer'
     * @param {number} timeout - Timeout in milliseconds
     */
    addPendingConnection(connectionId, pc, type, timeout = 60000) {
        const timeoutId = setTimeout(() => {
            this.removePendingConnection(connectionId);
        }, timeout);

        this.pendingConnections.set(connectionId, {
            pc,
            type,
            timeoutId,
            createdAt: Date.now()
        });
    }

    /**
     * Get and remove a pending connection
     * @param {string} connectionId - The connection ID
     * @returns {Object|null} The pending connection data
     */
    getPendingConnection(connectionId) {
        const pending = this.pendingConnections.get(connectionId);
        if (pending) {
            clearTimeout(pending.timeoutId);
            this.pendingConnections.delete(connectionId);
            return pending;
        }
        return null;
    }

    /**
     * Remove a pending connection
     * @param {string} connectionId - The connection ID
     */
    removePendingConnection(connectionId) {
        const pending = this.pendingConnections.get(connectionId);
        if (pending) {
            clearTimeout(pending.timeoutId);
            pending.pc.close();
            this.pendingConnections.delete(connectionId);
        }
    }

    /**
     * Update local media sharing state
     * @param {string} peerId - The peer ID
     * @param {boolean} isSharing - Whether media is being shared
     * @param {MediaStreamTrack} track - The media track (optional)
     */
    updateLocalMediaState(peerId, isSharing, track = null) {
        this.localMediaState.set(peerId, { isSharing, track });
        this.emit('localMediaStateChanged', { peerId, isSharing });
    }

    /**
     * Update remote media state
     * @param {string} peerId - The peer ID
     * @param {Object} state - The new state
     */
    updateRemoteMediaState(peerId, state) {
        const currentState = this.remoteMediaState.get(peerId) || {};
        this.remoteMediaState.set(peerId, { ...currentState, ...state });
        this.emit('remoteMediaStateChanged', { peerId, state });
    }

    /**
     * Get or create local audio stream
     * @returns {Promise<MediaStream>} The local audio stream
     */
    async getLocalStream() {
        if (!this.localStream || !this.localStream.active) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
            } catch (error) {
                console.error('Failed to get local audio stream:', error);
                throw error;
            }
        }
        return this.localStream;
    }

    /**
     * Stop local stream
     */
    stopLocalStream() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }

    /**
     * Save peer metadata to IndexedDB
     * @param {string} peerId - The peer ID
     */
    async savePeerMetadata(peerId) {
        try {
            const metadata = this.peerMetadata.get(peerId);
            if (metadata) {
                const transaction = this.db.transaction(['peers'], 'readwrite');
                const store = transaction.objectStore('peers');
                store.put({ peerId, ...metadata });
            }
        } catch (error) {
            console.error('Failed to save peer metadata:', error);
        }
    }

    /**
     * Remove peer metadata from IndexedDB
     * @param {string} peerId - The peer ID
     */
    async removePeerMetadata(peerId) {
        try {
            const transaction = this.db.transaction(['peers'], 'readwrite');
            const store = transaction.objectStore('peers');
            store.delete(peerId);
        } catch (error) {
            console.error('Failed to remove peer metadata:', error);
        }
    }

    /**
     * Get all connected peer IDs
     * @returns {Array<string>} Array of peer IDs
     */
    getConnectedPeerIds() {
        return Array.from(this.connections.keys());
    }

    /**
     * Get peer count
     * @returns {number} Number of connected peers
     */
    getPeerCount() {
        return this.connections.size;
    }

    /**
     * Subscribe to state events
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    /**
     * Unsubscribe from state events
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     */
    off(event, callback) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.delete(callback);
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    /**
     * Clean up all connections and state
     */
    cleanup() {
        // Close all connections
        this.connections.forEach((connection, peerId) => {
            this.removeConnection(peerId);
        });

        // Clear pending connections
        this.pendingConnections.forEach((pending, connectionId) => {
            this.removePendingConnection(connectionId);
        });

        // Stop local stream
        this.stopLocalStream();

        // Clear all state
        this.connections.clear();
        this.pendingConnections.clear();
        this.localMediaState.clear();
        this.remoteMediaState.clear();
        this.peerMetadata.clear();
        this.listeners.clear();
    }
} 