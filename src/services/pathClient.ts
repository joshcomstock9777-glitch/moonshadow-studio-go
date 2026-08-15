/**
 * Path Client
 * 
 * Implements the Path contract from studio-behind-the-cast.
 * Studio Go communicates with Path/Allie/Amber through this client.
 * 
 * This is a client-side adapter that:
 * - Creates sessions (POST /api/sessions)
 * - Polls for updates (GET /api/sessions/:sessionId)
 * - Manages correlation IDs and session state
 * - Implements polling backoff strategy
 * - Does NOT write to Brain directly
 * - Does NOT duplicate Bridge UI logic
 */

export interface PathConfig {
  apiBaseUrl: string;
}

export interface PathRequestPayload {
  target: PathTarget;
  message: string;
}

export type PathTarget = "allie" | "amber";

export interface PathSessionResponse {
  sessionId: string;
  correlationId: string;
  status: "open" | "final" | "error";
  calls: number;
  stateVersion: number;
  transcript: PathEntry[];
  error?: string;
}

export interface PathEntry {
  schema?: string;
  identity?: string;
  from?: string;
  to?: string;
  kind?: string;
  correlationId?: string;
  body?: string;
  turn?: number;
  createdAt?: string;
}

export interface PathResult {
  ok: boolean;
  sessionId?: string;
  correlationId?: string;
  status?: "open" | "final" | "error";
  transcript?: PathEntry[];
  calls?: number;
  stateVersion?: number;
  error?: string;
}

export interface PollOptions {
  sessionId: string;
  correlationId: string; // Preserve from initial request
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  timeoutMs?: number;
  onUpdate?: (session: PathSessionResponse) => void;
  onError?: (error: Error) => void;
}

const DEFAULT_BASE_DELAY = 2000;
const DEFAULT_MAX_DELAY = 30000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_TIMEOUT_MS = 120000;

export function buildPathUrl(apiBaseUrl: string, pathname: string): string {
  const base = apiBaseUrl.replace(/\/+$/, "");
  const apiBase = base.endsWith("/api") ? base : `${base}/api`;
  const path = pathname.replace(/^\/+/, "");
  return `${apiBase}/${path}`;
}

export function mapPathSessionResponse(
  data: Partial<PathSessionResponse>,
  preserved?: { sessionId?: string; correlationId?: string }
): PathResult {
  return {
    ok: true,
    sessionId: data.sessionId || preserved?.sessionId,
    correlationId: data.correlationId || preserved?.correlationId,
    status: data.status,
    transcript: data.transcript,
    calls: data.calls,
    stateVersion: data.stateVersion,
    error: data.error,
  };
}

export class PathClient {
  private config: PathConfig;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollRetryCount: number = 0;

  constructor(config: PathConfig) {
    this.config = config;
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.apiBaseUrl || !this.config.apiBaseUrl.trim()) {
      throw new Error("Path API base URL is not configured");
    }
    try {
      const url = new URL(this.config.apiBaseUrl);
      if (url.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
    } catch {
      throw new Error("Path API base URL is invalid or is not HTTPS");
    }
  }

  private pathUrl(pathname: string): string {
    return buildPathUrl(this.config.apiBaseUrl, pathname);
  }

  /**
   * Create a new session and send initial request to Path
   */
  async sendRequest(target: PathTarget, message: string): Promise<PathResult> {
    try {
      const payload: PathRequestPayload = {
        target,
        message: message.trim().slice(0, 700),
      };

      const response = await fetch(this.pathUrl("/sessions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: Partial<PathSessionResponse> = {};
      try {
        data = await response.json();
      } catch {
        // Not JSON; will be handled below
      }

      if (!response.ok) {
        return {
          ok: false,
          error: data.error
            ? `Path request failed: ${data.error}`
            : `Path request failed (${response.status})`,
        };
      }

      if (!data.sessionId || !data.correlationId) {
        return {
          ok: false,
          error: "Path returned invalid session response",
        };
      }

      return mapPathSessionResponse(data);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Fetch current session state from Path
   */
  async readSession(sessionId: string): Promise<PathResult> {
    try {
      const response = await fetch(
        this.pathUrl(`/sessions/${encodeURIComponent(sessionId)}`),
        {
          headers: { accept: "application/json" },
        }
      );

      if (response.status === 404) {
        return {
          ok: false,
          error: "Session not found",
        };
      }

      let data: Partial<PathSessionResponse> = {};
      try {
        data = await response.json();
      } catch {
        // Not JSON
      }

      if (!response.ok) {
        return {
          ok: false,
          error: data.error
            ? `Path session fetch failed: ${data.error}`
            : `Path session fetch failed (${response.status})`,
        };
      }

      if (!data || typeof data !== "object") {
        return {
          ok: false,
          error: "Path session response was not valid JSON",
        };
      }

      return mapPathSessionResponse(data);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Poll for session updates with exponential backoff
   * Stops when status is "final" or "error"
   */
  startPolling(options: PollOptions): void {
    const {
      sessionId,
      correlationId,
      maxRetries = DEFAULT_MAX_RETRIES,
      baseDelay = DEFAULT_BASE_DELAY,
      maxDelay = DEFAULT_MAX_DELAY,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      onUpdate,
      onError,
    } = options;

    this.stopPolling();
    this.pollRetryCount = 0;
    const startedAt = Date.now();

    const queueNextPoll = (delay: number = baseDelay): void => {
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null;
        if (Date.now() - startedAt >= timeoutMs) {
          onError?.(new Error("Path polling timed out"));
          return;
        }
        this.pollOnce(sessionId, correlationId)
          .then((result) => {
            if (!result.ok) {
              this.pollRetryCount += 1;
              if (this.pollRetryCount >= maxRetries) {
                onError?.(new Error("Max polling retries exceeded"));
                return;
              }
              const nextDelay = Math.min(
                baseDelay * Math.pow(2, this.pollRetryCount),
                maxDelay
              );
              queueNextPoll(nextDelay);
              return;
            }

            // Reset retry count on successful poll
            this.pollRetryCount = 0;
            const session: PathSessionResponse = {
              sessionId,
              correlationId,
              status: result.status || "open",
              transcript: result.transcript || [],
              calls: result.calls || 0,
              stateVersion: result.stateVersion || 0,
              error: result.error,
            };
            onUpdate?.(session);

            // Stop if terminal state
            if (result.status === "final" || result.status === "error") {
              return;
            }

            // Continue polling
            queueNextPoll(baseDelay);
          })
          .catch((error) => {
            this.pollRetryCount += 1;
            if (this.pollRetryCount >= maxRetries) {
              onError?.(error);
              return;
            }
            const nextDelay = Math.min(
              baseDelay * Math.pow(2, this.pollRetryCount),
              maxDelay
            );
            queueNextPoll(nextDelay);
          });
      }, delay);
    };

    queueNextPoll();
  }

  /**
   * Single poll operation
   * Preserves the original correlationId from the initial request
   */
  private async pollOnce(
    sessionId: string,
    correlationId: string
  ): Promise<PathResult> {
    const result = await this.readSession(sessionId);
    if (!result.ok) {
      return result;
    }
    if (result.correlationId && result.correlationId !== correlationId) {
      return {
        ok: false,
        error: "Path returned a mismatched correlation ID",
      };
    }
    return {
      ok: true,
      sessionId,
      correlationId, // Preserve the original correlation ID
      status: result.status,
      transcript: result.transcript || [],
      calls: result.calls,
      stateVersion: result.stateVersion,
      error: result.error,
    };
  }

  /**
   * Stop active polling
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Send a checkpoint message (special message format)
   */
  async sendCheckpoint(
    workerName: string,
    role: string,
    task: string,
    status: string,
    lastAction: string,
    blocker: string,
    nextAction: string,
    brainUpdated: boolean
  ): Promise<PathResult> {
    const checkpointMessage = `${workerName.toUpperCase()} | ${role} | ${task} | ${status} | ${lastAction} | ${blocker} | ${nextAction} | BRAIN UPDATED: ${
      brainUpdated ? "YES" : "NO"
    }`;

    return this.sendRequest("amber", checkpointMessage.slice(0, 1600));
  }
}

/**
 * Singleton instance
 */
let pathClientInstance: PathClient | null = null;

export function initPathClient(config: PathConfig): PathClient {
  pathClientInstance = new PathClient(config);
  return pathClientInstance;
}

export function getPathClient(): PathClient {
  if (!pathClientInstance) {
    throw new Error("PathClient not initialized. Call initPathClient first.");
  }
  return pathClientInstance;
}
