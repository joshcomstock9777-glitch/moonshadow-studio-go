/**
 * Path message handler for Studio Go
 * Integrates with the existing orchestrator pattern but routes to real Path/Allie/Amber
 * 
 * Single source of truth for session state during a Path request
 */

import { PathClient, PathSessionResponse, PathEntry, PathTarget } from './pathClient';
import { loadPathConfig } from './pathConfig';

export interface PathMessageSession {
  sessionId: string;
  correlationId: string;
  isActive: boolean;
  transcript: PathEntry[];
  status: 'open' | 'final' | 'error';
  calls: number;
  stateVersion: number;
  error?: string;
  createdAt: number;
}

export class PathMessageHandler {
  private client: PathClient;
  private currentSession: PathMessageSession | null = null;
  private onSessionUpdate: ((session: PathMessageSession) => void) | null = null;
  private isSendingRef: boolean = false;

  constructor() {
    const config = loadPathConfig();
    if (!config.apiBaseUrl || !config.apiBaseUrl.trim()) {
      throw new Error(
        'Path API base URL not configured. Set EXPO_PUBLIC_PATH_API_URL.'
      );
    }
    this.client = new PathClient(config);
  }

  setOnSessionUpdate(callback: (session: PathMessageSession) => void): void {
    this.onSessionUpdate = callback;
  }

  clearOnSessionUpdate(callback: (session: PathMessageSession) => void): void {
    if (this.onSessionUpdate === callback) {
      this.onSessionUpdate = null;
    }
  }

  /**
   * Send a message to a target (Allie, Amber, Josh) and start tracking the session
   * Returns false if a send is already in progress
   */
  async sendMessage(target: PathTarget, message: string): Promise<PathMessageSession | { error: string }> {
    // Block duplicate sends while one is active
    if (this.isSendingRef || this.currentSession?.isActive) {
      return { error: 'A request is already in progress' };
    }

    this.isSendingRef = true;

    try {
      // Stop any existing polling
      this.client.stopPolling();

      // Send new request to Path
      const result = await this.client.sendRequest(target, message);

      if (!result.ok || !result.sessionId || !result.correlationId) {
        const errorMsg = result.error || 'Failed to send request';
        return { error: errorMsg };
      }

      // Create session state
      this.currentSession = {
        sessionId: result.sessionId,
        correlationId: result.correlationId,
        isActive: result.status === 'open',
        transcript: result.transcript || [],
        status: result.status || 'open',
        calls: result.calls || 0,
        stateVersion: result.stateVersion || 0,
        createdAt: Date.now(),
      };

      this.notifyUpdate();

      // Start polling if not in terminal state
      if (result.status !== 'final' && result.status !== 'error') {
        this.startPolling();
      }

      return this.currentSession;
    } finally {
      this.isSendingRef = false;
    }
  }

  /**
   * Send a message to Allie specifically
   */
  async sendToAllie(message: string): Promise<PathMessageSession | { error: string }> {
    return this.sendMessage('allie', message);
  }

  /**
   * Send a message to Amber specifically
   */
  async sendToAmber(message: string): Promise<PathMessageSession | { error: string }> {
    return this.sendMessage('amber', message);
  }

  private startPolling(): void {
    if (!this.currentSession) return;

    this.client.startPolling({
      sessionId: this.currentSession.sessionId,
      correlationId: this.currentSession.correlationId,
      onUpdate: (session: PathSessionResponse) => {
        if (!this.currentSession) return;

        // Update transcript with new entries
        this.currentSession.transcript = session.transcript || [];
        this.currentSession.status = session.status || 'open';
        this.currentSession.calls = session.calls || 0;
        this.currentSession.stateVersion = session.stateVersion || 0;
        this.currentSession.error = session.error;

        // Mark inactive when terminal state reached
        if (session.status === 'final' || session.status === 'error') {
          this.currentSession.isActive = false;
        }

        this.notifyUpdate();
      },
      onError: (error: Error) => {
        if (!this.currentSession) return;
        this.currentSession.error = error.message;
        this.currentSession.isActive = false;
        this.notifyUpdate();
      },
    });
  }

  private notifyUpdate(): void {
    if (this.currentSession && this.onSessionUpdate) {
      this.onSessionUpdate({ ...this.currentSession });
    }
  }

  getCurrentSession(): PathMessageSession | null {
    return this.currentSession;
  }

  isActive(): boolean {
    return this.currentSession?.isActive ?? false;
  }

  isSending(): boolean {
    return this.isSendingRef;
  }

  /**
   * Stop polling and mark session as inactive
   */
  stop(): void {
    this.client.stopPolling();
    if (this.currentSession) {
      this.currentSession.isActive = false;
      this.notifyUpdate();
    }
  }

  /**
   * Clean up resources (called on component unmount)
   */
  cleanup(): void {
    this.client.stopPolling();
    this.currentSession = null;
  }
}

let handlerInstance: PathMessageHandler | null = null;

export function initPathMessageHandler(): PathMessageHandler {
  if (!handlerInstance) {
    handlerInstance = new PathMessageHandler();
  }
  return handlerInstance;
}

export function getPathMessageHandler(): PathMessageHandler {
  if (!handlerInstance) {
    throw new Error('PathMessageHandler not initialized. Call initPathMessageHandler first.');
  }
  return handlerInstance;
}
