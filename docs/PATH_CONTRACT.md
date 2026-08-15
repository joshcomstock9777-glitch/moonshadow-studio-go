# Path Contract - Studio Go Integration

This document captures the exact contracts discovered in `studio-behind-the-cast/app.js` that Studio Go uses to communicate with Path.

## Configuration

Path API base URL is injected via runtime config:
```js
window.__PATH_CONFIG__ = { apiBaseUrl: "https://path.example.com" }
```

## Endpoints

### POST /sessions

**Purpose:** Create a new session and send an initial request.

**Request:**
```json
{
  "target": "Amber" | "Allie" | "Josh",
  "message": "string (max 700 chars for normal messages)"
}
```

**Response:**
```json
{
  "sessionId": "string",
  "correlationId": "string",
  "status": "open" | "final" | "error",
  "calls": 0,
  "stateVersion": 0,
  "transcript": []
}
```

**Behavior:**
- Creates a new session immediately
- Returns correlation ID for tracing the request end-to-end
- Status "open" = awaiting response; "final" = completed; "error" = failed
- Transcript is append-only; responses appear here

### GET /sessions/:sessionId

**Purpose:** Poll for updates to an existing session.

**Response:**
Same structure as POST /sessions response, with updated transcript and status.

**Behavior:**
- Returns 404 if session not found
- Returns complete session state on success
- Transcript may contain multiple entries as workers respond
- Status transitions: open → final | error

## Entry Schema (in transcript)

**Request entry** (schema: "moonshadow.path.v1"):
```json
{
  "schema": "moonshadow.path.v1",
  "from": "josh" | string,
  "to": "amber" | "allie" | string,
  "kind": "seed" | "handoff" | string,
  "correlationId": "string",
  "body": "string",
  "turn": 0 | number,
  "createdAt": "ISO 8601"
}
```

**Response entry** (identity field):
```json
{
  "identity": "amber" | "allie" | string,
  "kind": "handoff" | string,
  "correlationId": "string",
  "body": "string",
  "createdAt": "ISO 8601"
}
```

## Checkpoint Message

Checkpoint format (locked in Brain):
```
NAME | ROLE | TASK | STATUS | LAST ACTION | BLOCKER | NEXT ACTION | BRAIN UPDATED: YES/NO
```

Sent the same way as regular messages:
```
POST /sessions with target="Amber" and message=<checkpoint string>
```

## Polling Strategy (from Bridge V1)

- BASE_POLL_DELAY: 2000ms
- MAX_POLL_DELAY: 30000ms
- MAX_POLL_RETRIES: 5
- Exponential backoff: delay * 2^retryCount, capped at MAX_POLL_DELAY
- Stop polling when status === "final" or "error"

## Correlation/Request ID

- sessionId: unique per conversation thread
- correlationId: unique per individual request within the session
- Both are returned from POST /sessions
- Both must be preserved in UI/logs for tracing

## Worker Routing

Target field routes to specific workers:
- "Amber" = routing/operations
- "Allie" = architecture/verification
- "Josh" = human decision-maker
- Other roles exist (Artisa, Slick, etc.) but not routed via this interface initially

## Brain/Checkpoint Persistence

- Brain is not directly queried by this client
- Brain state is returned embedded in session.transcript
- Checkpoint verification happens server-side via Amber/Allie
- Studio Go reads state from transcript; does not write to Brain directly

## Current Limitations (from Bridge V1 README)

- Messages stored only in browser local storage during current session
- No cross-device persistence without a realtime backend
- Worker doorways for Allie and Amber not yet verified for full bidirectional coordination
- Bridge V1 is static/local prototype; production would require realtime backend + auth

## Known Constraints for Studio Go Integration

1. Path base URL must be set before any requests
2. No authentication layer implemented yet
3. Session created by first POST /sessions; subsequent requests poll same session
4. Message size limit: 700 chars for normal, 1600 for checkpoint
5. Polling is unidirectional (pull only); no push notifications
6. Cannot move sessions between tabs/devices in current V1 state
