/**
 * usePathMessage Hook
 * 
 * React hook that wires Studio Go message input to the Path adapter
 * Handles:
 * - Initialization of PathMessageHandler
 * - Sending messages to target workers (Allie, Amber, Josh)
 * - Polling session state updates
 * - Blocking duplicate sends
 * - Cleanup on unmount
 * - Error handling
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getPathMessageHandler, initPathMessageHandler, PathMessageSession } from '../services/pathMessageHandler';

export interface UsePathMessageResult {
  session: PathMessageSession | null;
  isLoading: boolean;
  error: string | null;
  sendToAllie: (message: string) => Promise<void>;
  sendToAmber: (message: string) => Promise<void>;
  sendMessage: (target: string, message: string) => Promise<void>;
  clearError: () => void;
  stop: () => void;
}

/**
 * Initialize the Path handler once per app lifetime
 */
let handlerInitialized = false;

export function usePathMessage(): UsePathMessageResult {
  const [session, setSession] = useState<PathMessageSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlerRef = useRef<ReturnType<typeof getPathMessageHandler> | null>(null);

  // Initialize handler on first mount
  useEffect(() => {
    if (!handlerInitialized) {
      try {
        const handler = initPathMessageHandler();
        handlerRef.current = handler;
        handlerInitialized = true;

        // Subscribe to session updates
        handler.setOnSessionUpdate((updatedSession: PathMessageSession) => {
          setSession({ ...updatedSession });
          setIsLoading(updatedSession.isActive);
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to initialize Path handler';
        setError(errorMsg);
        console.error('Path handler initialization error:', err);
      }
    } else {
      // Already initialized, just get the handler
      try {
        handlerRef.current = getPathMessageHandler();
        // Restore any existing session
        const currentSession = handlerRef.current.getCurrentSession();
        if (currentSession) {
          setSession(currentSession);
          setIsLoading(currentSession.isActive);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to get Path handler';
        setError(errorMsg);
      }
    }

    // Cleanup on unmount
    return () => {
      if (handlerRef.current) {
        handlerRef.current.cleanup();
      }
    };
  }, []);

  const handleSendMessage = useCallback(
    async (target: string, message: string): Promise<void> => {
      if (!handlerRef.current) {
        setError('Path handler not initialized');
        return;
      }

      if (!message.trim()) {
        setError('Message cannot be empty');
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        const result = await handlerRef.current.sendMessage(target, message);

        if ('error' in result) {
          setError(result.error);
          setIsLoading(false);
          return;
        }

        setSession(result);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error sending message';
        setError(errorMsg);
        setIsLoading(false);
        console.error('Error sending message:', err);
      }
    },
    []
  );

  const sendToAllie = useCallback(
    (message: string) => handleSendMessage('Allie', message),
    [handleSendMessage]
  );

  const sendToAmber = useCallback(
    (message: string) => handleSendMessage('Amber', message),
    [handleSendMessage]
  );

  const sendMessage = useCallback(
    (target: string, message: string) => handleSendMessage(target, message),
    [handleSendMessage]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const stop = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.stop();
    }
  }, []);

  return {
    session,
    isLoading,
    error,
    sendToAllie,
    sendToAmber,
    sendMessage,
    clearError,
    stop,
  };
}
