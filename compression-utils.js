/**
 * Compression utilities for WebRTC signaling payloads
 * Uses pako for deflate compression to reduce URL length
 */

export class CompressionUtils {
    /**
     * Compress a JavaScript object to a base64 string
     * @param {Object} payload - The payload object to compress
     * @returns {string} Base64 encoded compressed string
     */
    static compressPayload(payload) {
        try {
            const json = JSON.stringify(payload);
            const compressed = pako.deflate(json);
            return btoa(String.fromCharCode.apply(null, compressed));
        } catch (error) {
            console.error('Compression failed:', error);
            throw new Error('Failed to compress payload');
        }
    }

    /**
     * Decompress a base64 string back to JavaScript object
     * @param {string} blob - Base64 encoded compressed string
     * @returns {Object} The decompressed payload object
     */
    static decompressPayload(blob) {
        try {
            const compressed = new Uint8Array(
                atob(blob).split('').map(c => c.charCodeAt(0))
            );
            const json = pako.inflate(compressed, { to: 'string' });
            return JSON.parse(json);
        } catch (error) {
            console.error('Decompression failed:', error);
            throw new Error('Failed to decompress payload');
        }
    }

    /**
     * Check if a URL would be too long for most browsers
     * @param {string} url - The URL to check
     * @returns {boolean} True if URL is within safe limits
     */
    static isUrlSafe(url) {
        // Most browsers support URLs up to 2048 characters
        // We'll use 2000 as a safe limit
        const MAX_URL_LENGTH = 2000;
        return url.length <= MAX_URL_LENGTH;
    }

    /**
     * Create a connection ID
     * @returns {string} A short unique identifier
     */
    static createConnectionId() {
        // Create a shorter ID than UUID for URL efficiency
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    /**
     * Encode a full invite URL
     * @param {string} connectionId - The connection identifier
     * @param {Object} payload - The offer payload
     * @returns {string} The complete invite URL
     */
    static encodeInviteUrl(connectionId, payload) {
        const compressed = this.compressPayload(payload);
        const url = `${window.location.origin}${window.location.pathname}#offer=${connectionId}:${compressed}`;

        if (!this.isUrlSafe(url)) {
            throw new Error('Invite URL is too long. Consider using a shorter nickname or reducing metadata.');
        }

        return url;
    }

    /**
     * Parse an invite URL
     * @param {string} hash - The URL hash (without #)
     * @returns {Object|null} Parsed invite data or null if invalid
     */
    static parseInviteUrl(hash) {
        if (!hash || !hash.startsWith('offer=')) {
            return null;
        }

        try {
            const offerData = hash.substring(6); // Remove 'offer='
            const [connectionId, compressedBlob] = offerData.split(':');

            if (!connectionId || !compressedBlob) {
                return null;
            }

            const payload = this.decompressPayload(compressedBlob);

            return {
                connectionId,
                payload
            };
        } catch (error) {
            console.error('Failed to parse invite URL:', error);
            return null;
        }
    }

    /**
     * Create a compact answer blob
     * @param {Object} answerPayload - The answer payload
     * @returns {string} Compressed answer blob
     */
    static createAnswerBlob(answerPayload) {
        return this.compressPayload(answerPayload);
    }

    /**
     * Parse an answer blob
     * @param {string} blob - The compressed answer blob
     * @returns {Object} The answer payload
     */
    static parseAnswerBlob(blob) {
        return this.decompressPayload(blob);
    }
} 