/**
 * Spatial Audio Manager for BCon
 * Handles 2D spatial audio positioning using Web Audio API
 */

export class SpatialAudioManager {
    constructor() {
        // Web Audio API context
        this.audioContext = null;

        // Listener (user) position
        this.listenerPosition = { x: 0, y: 0, z: 0 };

        // Map of peer audio nodes
        this.peerAudioNodes = new Map(); // peerId -> {source, panner, gain}

        // Spatial parameters
        this.roomSize = 10; // Virtual room size in meters
        this.rolloffFactor = 1;
        this.refDistance = 1;
        this.maxDistance = 10;

        // Initialize audio context
        this.initializeAudioContext();
    }

    /**
     * Initialize Web Audio API context
     */
    async initializeAudioContext() {
        try {
            // Create audio context on user interaction to comply with browser policies
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Set up listener (user) position
            if (this.audioContext.listener.positionX) {
                // Modern API
                this.audioContext.listener.positionX.value = this.listenerPosition.x;
                this.audioContext.listener.positionY.value = this.listenerPosition.y;
                this.audioContext.listener.positionZ.value = this.listenerPosition.z;

                // Set listener orientation (looking "into" the screen)
                this.audioContext.listener.forwardX.value = 0;
                this.audioContext.listener.forwardY.value = 0;
                this.audioContext.listener.forwardZ.value = -1;
                this.audioContext.listener.upX.value = 0;
                this.audioContext.listener.upY.value = 1;
                this.audioContext.listener.upZ.value = 0;
            } else {
                // Legacy API
                this.audioContext.listener.setPosition(
                    this.listenerPosition.x,
                    this.listenerPosition.y,
                    this.listenerPosition.z
                );
                this.audioContext.listener.setOrientation(0, 0, -1, 0, 1, 0);
            }

            console.log('Spatial audio context initialized');
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
        }
    }

    /**
     * Create spatial audio nodes for a peer
     * @param {string} peerId - The peer ID
     * @param {MediaStream} stream - The audio stream
     * @param {Object} position - Initial position {x, y}
     * @returns {HTMLAudioElement} The audio element for playback
     */
    createSpatialAudioForPeer(peerId, stream, position = { x: 0, y: 0 }) {
        if (!this.audioContext) {
            console.error('Audio context not initialized');
            return null;
        }

        try {
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            // Create audio element
            const audio = new Audio();
            audio.srcObject = stream;
            audio.autoplay = true;

            // Create audio nodes
            const source = this.audioContext.createMediaStreamSource(stream);
            const panner = this.audioContext.createPanner();
            const gain = this.audioContext.createGain();

            // Configure panner for 2D positioning
            panner.panningModel = 'HRTF'; // Head-related transfer function for better spatial effect
            panner.distanceModel = 'inverse';
            panner.refDistance = this.refDistance;
            panner.maxDistance = this.maxDistance;
            panner.rolloffFactor = this.rolloffFactor;
            panner.coneInnerAngle = 360;
            panner.coneOuterAngle = 0;
            panner.coneOuterGain = 0;

            // Set initial position
            this.updatePeerPosition(panner, position);

            // Connect nodes: source -> panner -> gain -> destination
            source.connect(panner);
            panner.connect(gain);
            gain.connect(this.audioContext.destination);

            // Store nodes
            this.peerAudioNodes.set(peerId, {
                audio,
                source,
                panner,
                gain,
                position
            });

            console.log(`Created spatial audio for peer ${peerId} at position`, position);

            return audio;
        } catch (error) {
            console.error('Failed to create spatial audio:', error);
            return null;
        }
    }

    /**
     * Update peer position in 2D space
     * @param {string} peerId - The peer ID
     * @param {Object} position - New position {x, y}
     */
    updatePeerPosition(peerId, position) {
        const nodes = this.peerAudioNodes.get(peerId);
        if (!nodes) return;

        // Update stored position
        nodes.position = position;

        // Update panner position (convert 2D to 3D by setting z=0)
        const panner = nodes.panner;
        if (panner.positionX) {
            // Modern API
            panner.positionX.value = position.x;
            panner.positionY.value = position.y;
            panner.positionZ.value = 0;
        } else {
            // Legacy API
            panner.setPosition(position.x, position.y, 0);
        }

        console.log(`Updated position for peer ${peerId}:`, position);
    }

    /**
     * Update listener (user) position
     * @param {Object} position - New position {x, y}
     */
    updateListenerPosition(position) {
        this.listenerPosition = { ...position, z: 0 };

        if (!this.audioContext) return;

        const listener = this.audioContext.listener;
        if (listener.positionX) {
            // Modern API
            listener.positionX.value = position.x;
            listener.positionY.value = position.y;
            listener.positionZ.value = 0;
        } else {
            // Legacy API
            listener.setPosition(position.x, position.y, 0);
        }
    }

    /**
     * Set volume for a peer
     * @param {string} peerId - The peer ID
     * @param {number} volume - Volume level (0-1)
     */
    setPeerVolume(peerId, volume) {
        const nodes = this.peerAudioNodes.get(peerId);
        if (nodes && nodes.gain) {
            nodes.gain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Mute/unmute a peer
     * @param {string} peerId - The peer ID
     * @param {boolean} muted - Whether to mute
     */
    setPeerMuted(peerId, muted) {
        const nodes = this.peerAudioNodes.get(peerId);
        if (nodes && nodes.audio) {
            nodes.audio.muted = muted;
        }
    }

    /**
     * Remove spatial audio for a peer
     * @param {string} peerId - The peer ID
     */
    removePeer(peerId) {
        const nodes = this.peerAudioNodes.get(peerId);
        if (nodes) {
            // Disconnect and clean up nodes
            if (nodes.source) nodes.source.disconnect();
            if (nodes.panner) nodes.panner.disconnect();
            if (nodes.gain) nodes.gain.disconnect();
            if (nodes.audio) {
                nodes.audio.srcObject = null;
                nodes.audio.remove();
            }

            this.peerAudioNodes.delete(peerId);
            console.log(`Removed spatial audio for peer ${peerId}`);
        }
    }

    /**
     * Convert 2D position to screen coordinates
     * @param {Object} position - Position in spatial coordinates {x, y}
     * @param {number} containerWidth - Container width in pixels
     * @param {number} containerHeight - Container height in pixels
     * @returns {Object} Screen coordinates {x, y}
     */
    spatialToScreen(position, containerWidth, containerHeight) {
        const scale = Math.min(containerWidth, containerHeight) / (this.roomSize * 2);
        return {
            x: (position.x + this.roomSize) * scale,
            y: (this.roomSize - position.y) * scale // Flip Y axis for screen coordinates
        };
    }

    /**
     * Convert screen coordinates to 2D position
     * @param {Object} screenPos - Screen coordinates {x, y}
     * @param {number} containerWidth - Container width in pixels
     * @param {number} containerHeight - Container height in pixels
     * @returns {Object} Spatial coordinates {x, y}
     */
    screenToSpatial(screenPos, containerWidth, containerHeight) {
        const scale = Math.min(containerWidth, containerHeight) / (this.roomSize * 2);
        return {
            x: (screenPos.x / scale) - this.roomSize,
            y: this.roomSize - (screenPos.y / scale) // Flip Y axis
        };
    }

    /**
     * Get all peer positions
     * @returns {Map} Map of peerId -> position
     */
    getAllPeerPositions() {
        const positions = new Map();
        this.peerAudioNodes.forEach((nodes, peerId) => {
            positions.set(peerId, nodes.position);
        });
        return positions;
    }

    /**
     * Clean up all audio nodes
     */
    cleanup() {
        // Remove all peers
        this.peerAudioNodes.forEach((nodes, peerId) => {
            this.removePeer(peerId);
        });

        // Close audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
    }
} 