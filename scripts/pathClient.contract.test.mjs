import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPathUrl,
  mapPathSessionResponse,
} from "../src/services/pathClient.ts";

test("builds the create and polling URLs under /api", () => {
  const base = "https://moonshadow-path-proof.vercel.app";
  assert.equal(
    buildPathUrl(base, "/sessions"),
    "https://moonshadow-path-proof.vercel.app/api/sessions"
  );
  assert.equal(
    buildPathUrl(`${base}/api/`, "/sessions/session-123"),
    "https://moonshadow-path-proof.vercel.app/api/sessions/session-123"
  );
});

test("maps the live terminal response without changing evidence", () => {
  const transcript = [
    { identity: "allie", kind: "handoff", body: "turn 1" },
    { identity: "amber", kind: "handoff", body: "turn 2" },
    { identity: "allie", kind: "final", body: "turn 3" },
  ];
  const mapped = mapPathSessionResponse({
    sessionId: "wrun_01M02D3J538CPP59F7EQYEF40P",
    correlationId: "b54e1e0b-7d1b-4256-bb0f-2626b37b7b1a",
    status: "final",
    calls: 3,
    stateVersion: 3,
    transcript,
  });

  assert.equal(mapped.ok, true);
  assert.equal(mapped.sessionId, "wrun_01M02D3J538CPP59F7EQYEF40P");
  assert.equal(mapped.correlationId, "b54e1e0b-7d1b-4256-bb0f-2626b37b7b1a");
  assert.equal(mapped.status, "final");
  assert.equal(mapped.calls, 3);
  assert.deepEqual(mapped.transcript, transcript);
});

test("preserves IDs while polling before the backend returns both fields", () => {
  const mapped = mapPathSessionResponse(
    { status: "open", calls: 0, stateVersion: 0, transcript: [] },
    { sessionId: "session-123", correlationId: "correlation-123" }
  );
  assert.equal(mapped.sessionId, "session-123");
  assert.equal(mapped.correlationId, "correlation-123");
});
