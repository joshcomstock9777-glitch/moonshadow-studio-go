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
import { initPathMessageHandler, PathMessageHandler, PathMessageSession } from '../services/pathMessageHandler';
import { PathTarget } from '../services/pathClient';

export interface UsePathMessageResult {
  session: PathMessageSession | null;
  isLoading: boolean;
  error: string | null;
  sendToAllie: (message: string) => Promise<void>;
  sendToAmber: (message: string) => Promise<void>;
  sendMessage: (target: PathTarget, message: string) => Promise<void>;
  clearError: () => void;
  stop: () => void;
}

export function usePathMessage(): UsePathMessageResult {
  const [session, setSession] = useState<PathMessageSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlerRef = useRef<PathMessageHandler | null>(null);

  // Initialize handler on first mount
  useEffect(() => {
    const onUpdate = (updatedSession: PathMessageSession) => {
      setSession({ ...updatedSession });
      setIsLoading(updatedSession.isActive);
    };

    try {
      const handler = initPathMessageHandler();
      handlerRef.current = handler;
      handler.setOnSessionUpdate(onUpdate);

      const currentSession = handler.getCurrentSession();
      if (currentSession) {
        setSession({ ...currentSession });
        setIsLoading(currentSession.isActive);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to initialize Path handler';
      setError(errorMsg);
      console.error('Path handler initialization error:', err);
    }

    // Cleanup on unmount
    return () => {
      if (handlerRef.current) {
        handlerRef.current.clearOnSessionUpdate(onUpdate);
      }
    };
  }, []);

  const handleSendMessage = useCallback(
    async (target: PathTarget, message: string): Promise<void> => {
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
          setError(result.error || 'Path request failed');
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
    (message: string) => handleSendMessage('allie', message),
    [handleSendMessage]
  );

  const sendToAmber = useCallback(
    (message: string) => handleSendMessage('amber', message),
    [handleSendMessage]
  );

  const sendMessage = useCallback(
    (target: PathTarget, message: string) => handleSendMessage(target, message),
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
