/**
 * WebRTC connection management
 * Handles peer connections, signaling, and media negotiation
 */

import { CompressionUtils } from './compression-utils.js';
import { SpatialAudioManager } from './spatial-audio-manager.js';

export class WebRTCManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.spatialAudioManager = new SpatialAudioManager();

        // STUN/TURN servers configuration
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ];

        // ICE gathering timeout
        this.ICE_GATHERING_TIMEOUT = 3000;
    }

    /**
     * Create a new RTCPeerConnection with event handlers
     * @param {string} peerId - The peer ID for this connection
     * @returns {RTCPeerConnection} The configured peer connection
     */
    createPeerConnection(peerId) {
        const pc = new RTCPeerConnection({
            iceServers: this.iceServers,
            iceCandidatePoolSize: 10
        });

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('New ICE candidate:', event.candidate.candidate);
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`Connection state for ${peerId}:`, pc.connectionState);

            switch (pc.connectionState) {
                case 'connected':
                    this.handlePeerConnected(peerId);
                    break;
                case 'disconnected':
                case 'failed':
                    this.handlePeerDisconnected(peerId);
                    break;
                case 'closed':
                    this.handlePeerClosed(peerId);
                    break;
            }
        };

        // Handle incoming tracks
        pc.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            this.handleRemoteTrack(peerId, event.track, event.streams[0]);
        };

        // Handle ICE connection state changes
        pc.oniceconnectionstatechange = () => {
            console.log(`ICE connection state for ${peerId}:`, pc.iceConnectionState);
        };

        // Handle negotiation needed
        pc.onnegotiationneeded = async () => {
            console.log(`Negotiation needed for ${peerId}`);
        };

        return pc;
    }

    /**
     * Create an offer and generate invite URL
     * @param {string} connectionId - The connection ID
     * @returns {Promise<string>} The invite URL
     */
    async createOffer(connectionId) {
        const pc = this.createPeerConnection(null); // peerId will be set when answer arrives

        try {
            // Create offer
            const offer = await pc.createOffer({
                offerToReceiveAudio: true
            });
            await pc.setLocalDescription(offer);

            // Gather ICE candidates
            const iceCandidates = await this.gatherIceCandidates(pc);

            // Create payload
            const payload = {
                version: 1,
                type: 'offer',
                peerId: this.stateManager.localPeerId,
                nickname: this.stateManager.localNickname,
                timestamp: Date.now(),
                sdp: pc.localDescription.toJSON(),
                ice: iceCandidates,
                metadata: {
                    position: { x: 0, y: 0 },
                    capabilities: ['audio', 'data']
                }
            };

            // Store pending connection
            this.stateManager.addPendingConnection(connectionId, pc, 'offer');

            // Generate invite URL
            const inviteUrl = CompressionUtils.encodeInviteUrl(connectionId, payload);

            return inviteUrl;
        } catch (error) {
            console.error('Failed to create offer:', error);
            pc.close();
            throw error;
        }
    }

    /**
     * Process an invite URL and create an answer
     * @param {string} inviteData - The parsed invite data
     * @returns {Promise<string>} The answer blob
     */
    async processInvite(inviteData) {
        const { connectionId, payload } = inviteData;

        if (payload.type !== 'offer') {
            throw new Error('Invalid invite type');
        }

        const pc = this.createPeerConnection(payload.peerId);

        try {
            // Set remote description
            await pc.setRemoteDescription(payload.sdp);

            // Add ICE candidates
            for (const candidate of payload.ice) {
                await pc.addIceCandidate(candidate);
            }

            // Create answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Gather ICE candidates
            const iceCandidates = await this.gatherIceCandidates(pc);

            // Create answer payload
            const answerPayload = {
                version: 1,
                type: 'answer',
                peerId: this.stateManager.localPeerId,
                nickname: this.stateManager.localNickname,
                timestamp: Date.now(),
                sdp: pc.localDescription.toJSON(),
                ice: iceCandidates,
                connectionId: connectionId,
                metadata: {
                    position: { x: 0, y: 0 },
                    capabilities: ['audio', 'data']
                }
            };

            // Add connection to state
            this.stateManager.addConnection(payload.peerId, pc, {
                nickname: payload.nickname,
                position: payload.metadata.position,
                connectionId: connectionId
            });

            // Return answer blob
            return CompressionUtils.createAnswerBlob(answerPayload);
        } catch (error) {
            console.error('Failed to process invite:', error);
            pc.close();
            throw error;
        }
    }

    /**
     * Complete a connection with an answer
     * @param {string} connectionId - The connection ID
     * @param {string} answerBlob - The answer blob
     */
    async completeConnection(connectionId, answerBlob) {
        const pending = this.stateManager.getPendingConnection(connectionId);

        if (!pending || pending.type !== 'offer') {
            throw new Error('No pending offer found for this connection ID');
        }

        try {
            const answerPayload = CompressionUtils.parseAnswerBlob(answerBlob);

            if (answerPayload.type !== 'answer' || answerPayload.connectionId !== connectionId) {
                throw new Error('Invalid answer payload');
            }

            // Set remote description
            await pending.pc.setRemoteDescription(answerPayload.sdp);

            // Add ICE candidates
            for (const candidate of answerPayload.ice) {
                await pending.pc.addIceCandidate(candidate);
            }

            // Add connection to state
            this.stateManager.addConnection(answerPayload.peerId, pending.pc, {
                nickname: answerPayload.nickname,
                position: answerPayload.metadata.position,
                connectionId: connectionId
            });

        } catch (error) {
            console.error('Failed to complete connection:', error);
            pending.pc.close();
            throw error;
        }
    }

    /**
     * Gather ICE candidates with timeout
     * @param {RTCPeerConnection} pc - The peer connection
     * @returns {Promise<Array>} Array of ICE candidates
     */
    async gatherIceCandidates(pc) {
        const candidates = [];

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                pc.onicecandidate = null;
                resolve(candidates);
            }, this.ICE_GATHERING_TIMEOUT);

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    candidates.push(event.candidate.toJSON());
                } else {
                    // ICE gathering complete
                    clearTimeout(timeout);
                    pc.onicecandidate = null;
                    resolve(candidates);
                }
            };
        });
    }

    /**
     * Start sharing audio with a peer
     * @param {string} peerId - The peer ID
     */
    async startSharingAudio(peerId) {
        const connection = this.stateManager.connections.get(peerId);
        if (!connection) {
            throw new Error('No connection found for peer');
        }

        try {
            // Get local stream
            const stream = await this.stateManager.getLocalStream();
            const audioTrack = stream.getAudioTracks()[0];

            if (!audioTrack) {
                throw new Error('No audio track available');
            }

            // Check if already sharing
            const localMediaState = this.stateManager.localMediaState.get(peerId);
            if (localMediaState && localMediaState.isSharing) {
                console.log('Already sharing audio with this peer');
                return;
            }

            // Add track to connection
            const sender = connection.addTrack(audioTrack, stream);

            // Update state
            this.stateManager.updateLocalMediaState(peerId, true, audioTrack);

            console.log(`Started sharing audio with ${peerId}`);
        } catch (error) {
            console.error('Failed to start sharing audio:', error);
            throw error;
        }
    }

    /**
     * Stop sharing audio with a peer
     * @param {string} peerId - The peer ID
     */
    async stopSharingAudio(peerId) {
        const connection = this.stateManager.connections.get(peerId);
        if (!connection) {
            return;
        }

        try {
            // Find and remove the audio sender
            const senders = connection.getSenders();
            const audioSender = senders.find(sender =>
                sender.track && sender.track.kind === 'audio'
            );

            if (audioSender) {
                connection.removeTrack(audioSender);
            }

            // Update state
            this.stateManager.updateLocalMediaState(peerId, false, null);

            console.log(`Stopped sharing audio with ${peerId}`);
        } catch (error) {
            console.error('Failed to stop sharing audio:', error);
        }
    }

    /**
     * Toggle mute for a remote peer
     * @param {string} peerId - The peer ID
     * @param {boolean} muted - Whether to mute
     */
    toggleRemoteMute(peerId, muted) {
        // Use spatial audio manager for muting
        this.spatialAudioManager.setPeerMuted(peerId, muted);
        this.stateManager.updateRemoteMediaState(peerId, { isMuted: muted });
    }

    /**
     * Update peer position in 2D space
     * @param {string} peerId - The peer ID
     * @param {Object} position - New position {x, y}
     */
    updatePeerPosition(peerId, position) {
        // Update spatial audio position
        this.spatialAudioManager.updatePeerPosition(peerId, position);

        // Update state
        this.stateManager.updatePeerPosition(peerId, position);
    }

    /**
     * Update listener (user) position
     * @param {Object} position - New position {x, y}
     */
    updateListenerPosition(position) {
        this.spatialAudioManager.updateListenerPosition(position);
    }

    /**
     * Handle remote track received
     * @param {string} peerId - The peer ID
     * @param {MediaStreamTrack} track - The received track
     * @param {MediaStream} stream - The media stream
     */
    handleRemoteTrack(peerId, track, stream) {
        if (track.kind !== 'audio') {
            return;
        }

        // Get peer position from metadata
        const peerMetadata = this.stateManager.peerMetadata.get(peerId);
        const position = peerMetadata?.position || { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2 };

        // Create spatial audio
        const audio = this.spatialAudioManager.createSpatialAudioForPeer(peerId, stream, position);

        if (!audio) {
            // Fallback to regular audio if spatial audio fails
            const fallbackAudio = new Audio();
            fallbackAudio.srcObject = stream;
            fallbackAudio.autoplay = true;

            this.stateManager.updateRemoteMediaState(peerId, {
                track: track,
                audioElement: fallbackAudio
            });
        } else {
            // Update state with spatial audio
            this.stateManager.updateRemoteMediaState(peerId, {
                track: track,
                audioElement: audio
            });

            // Save position in peer metadata
            this.stateManager.updatePeerPosition(peerId, position);
        }

        console.log(`Received audio track from ${peerId} with spatial positioning`);
    }

    /**
     * Handle peer connected
     * @param {string} peerId - The peer ID
     */
    handlePeerConnected(peerId) {
        console.log(`Peer ${peerId} connected`);
        // UI will be updated via state manager events
    }

    /**
     * Handle peer disconnected
     * @param {string} peerId - The peer ID
     */
    handlePeerDisconnected(peerId) {
        console.log(`Peer ${peerId} disconnected`);
        // Attempt to reconnect or notify user
    }

    /**
     * Handle peer connection closed
     * @param {string} peerId - The peer ID
     */
    handlePeerClosed(peerId) {
        console.log(`Connection to peer ${peerId} closed`);

        // Remove from spatial audio
        this.spatialAudioManager.removePeer(peerId);

        // Remove from state
        this.stateManager.removeConnection(peerId);
    }

    /**
     * Clean up all connections
     */
    cleanup() {
        // Clean up spatial audio
        this.spatialAudioManager.cleanup();

        // State manager will handle connection cleanup
        this.stateManager.cleanup();
    }
} 