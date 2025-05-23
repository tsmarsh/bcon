/**
 * Main application entry point
 * Initializes and coordinates all modules
 */

import { StateManager } from './state-manager.js';
import { WebRTCManager } from './webrtc-manager.js';
import { UIController } from './ui-controller.js';
import { CompressionUtils } from './compression-utils.js';

// Make CompressionUtils available globally for UI controller
window.CompressionUtils = CompressionUtils;

class BConApp {
    constructor() {
        // Initialize modules
        this.stateManager = null;
        this.webrtcManager = null;
        this.uiController = null;

        // Initialize the app when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('Initializing BCon App...');

            // Create state manager
            this.stateManager = new StateManager();

            // Wait for IndexedDB to initialize
            await this.stateManager.initializeDatabase();

            // Create WebRTC manager
            this.webrtcManager = new WebRTCManager(this.stateManager);

            // Create UI controller
            this.uiController = new UIController(this.stateManager, this.webrtcManager);

            // Set up global event handlers
            this.setupEventHandlers();

            // Check for media permissions
            await this.checkMediaPermissions();

            // Monitor connection status
            this.monitorConnections();

            console.log('App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to initialize application: ' + error.message);
        }
    }

    /**
     * Set up global event handlers
     */
    setupEventHandlers() {
        // Handle page unload
        window.addEventListener('beforeunload', (e) => {
            if (this.stateManager.getPeerCount() > 0) {
                e.preventDefault();
                e.returnValue = 'You have active connections. Are you sure you want to leave?';
            }
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('Page hidden - connections may be affected');
            } else {
                console.log('Page visible - checking connections');
                this.checkConnectionHealth();
            }
        });

        // Handle online/offline events
        window.addEventListener('online', () => {
            console.log('Network online');
            this.uiController.showStatus('Network connection restored', 'success');
            this.checkConnectionHealth();
        });

        window.addEventListener('offline', () => {
            console.log('Network offline');
            this.uiController.showStatus('Network connection lost', 'error');
        });

        // Handle errors
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
        });
    }

    /**
     * Check media permissions
     */
    async checkMediaPermissions() {
        try {
            // Check if we can access getUserMedia
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('WebRTC is not supported in this browser');
            }

            // Check microphone permission
            const result = await navigator.permissions.query({ name: 'microphone' });

            if (result.state === 'denied') {
                this.uiController.showStatus(
                    'Microphone access is denied. Please enable it in your browser settings.',
                    'error'
                );
            } else if (result.state === 'prompt') {
                this.uiController.showStatus(
                    'Microphone permission will be requested when you share audio.',
                    'info'
                );
            }

            // Listen for permission changes
            result.addEventListener('change', () => {
                if (result.state === 'denied') {
                    this.uiController.showStatus(
                        'Microphone access was denied. Audio sharing will not work.',
                        'error'
                    );
                    // Stop any active audio sharing
                    this.stateManager.stopLocalStream();
                }
            });
        } catch (error) {
            console.warn('Could not check media permissions:', error);
        }
    }

    /**
     * Monitor connection health
     */
    monitorConnections() {
        // Check connection health every 30 seconds
        setInterval(() => {
            this.checkConnectionHealth();
        }, 30000);

        // Update UI for connection state changes
        this.stateManager.connections.forEach((connection, peerId) => {
            // Add listener for future connections
            connection.addEventListener('connectionstatechange', () => {
                this.uiController.updatePeerMediaControls(peerId);
            });
        });
    }

    /**
     * Check health of all connections
     */
    checkConnectionHealth() {
        this.stateManager.connections.forEach((connection, peerId) => {
            const state = connection.connectionState;

            if (state === 'disconnected' || state === 'failed') {
                console.warn(`Connection to ${peerId} is ${state}`);

                // Could implement reconnection logic here
                // For now, just update UI
                this.uiController.updatePeerMediaControls(peerId);
            }
        });
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error(message);
        if (this.uiController) {
            this.uiController.showStatus(message, 'error');
        } else {
            // Fallback if UI controller isn't ready
            alert(message);
        }
    }

    /**
     * Clean up the application
     */
    cleanup() {
        console.log('Cleaning up application...');

        if (this.stateManager) {
            this.stateManager.cleanup();
        }

        if (this.uiController) {
            this.uiController.cleanup();
        }
    }
}

// Create and start the application
const app = new BConApp();

// Expose app instance for debugging
window.bConApp = app;

// Log version info
console.log('BCon v1.0.0');
console.log('Ready for P2P audio connections!'); 