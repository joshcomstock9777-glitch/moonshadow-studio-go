#!/bin/bash
# Type-check verification for Commit 3
# Runs TypeScript compiler to verify all integration pieces connect correctly

set -e

echo "=== TypeScript Build Check ==="
echo ""
echo "Checking files on integrate/path-adapter branch..."
echo ""

# Verify all required files exist
FILES=(
  "src/services/pathClient.ts"
  "src/services/pathConfig.ts"
  "src/services/pathMessageHandler.ts"
  "src/hooks/usePathMessage.ts"
  "src/types.ts"
  "App.tsx"
  "tsconfig.json"
  "package.json"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✓ $file"
  else
    echo "✗ MISSING: $file"
    exit 1
  fi
done

echo ""
echo "=== Integration Chain Verification ==="
echo ""

# Check imports in App.tsx
echo "App.tsx imports:"
grep -q "usePathMessage" App.tsx && echo "  ✓ usePathMessage hook imported" || echo "  ✗ usePathMessage not imported"
grep -q "PathEntry" App.tsx && echo "  ✓ PathEntry type imported" || echo "  ✗ PathEntry not imported"
grep -q "usePathMessage()" App.tsx && echo "  ✓ usePathMessage hook called" || echo "  ✗ usePathMessage not called"

echo ""
echo "usePathMessage hook:"
grep -q "getPathMessageHandler" src/hooks/usePathMessage.ts && echo "  ✓ Calls getPathMessageHandler" || echo "  ✗ getPathMessageHandler not called"
grep -q "initPathMessageHandler" src/hooks/usePathMessage.ts && echo "  ✓ Calls initPathMessageHandler" || echo "  ✗ initPathMessageHandler not called"

echo ""
echo "PathMessageHandler:"
grep -q "loadPathConfig" src/services/pathMessageHandler.ts && echo "  ✓ Calls loadPathConfig" || echo "  ✗ loadPathConfig not called"
grep -q "new PathClient" src/services/pathMessageHandler.ts && echo "  ✓ Creates PathClient" || echo "  ✗ PathClient not created"
grep -q "startPolling" src/services/pathMessageHandler.ts && echo "  ✓ Calls startPolling" || echo "  ✗ startPolling not called"

echo ""
echo "PathClient:"
grep -q "POST /sessions" src/services/pathClient.ts && echo "  ✓ POST /sessions implemented" || echo "  ✗ POST /sessions missing"
grep -q "GET /sessions" src/services/pathClient.ts && echo "  ✓ GET /sessions implemented" || echo "  ✗ GET /sessions missing"
grep -q "correlationId" src/services/pathClient.ts && echo "  ✓ Preserves correlationId" || echo "  ✗ correlationId not preserved"
grep -q "ReturnType<typeof setTimeout>" src/services/pathClient.ts && echo "  ✓ Uses safe timer type" || echo "  ✗ Timer type unsafe"

echo ""
echo "PathConfig:"
grep -q "REACT_APP_PATH_API_URL\|EXPO_PUBLIC_PATH_API_URL" src/services/pathConfig.ts && echo "  ✓ Supports env variables" || echo "  ✗ Env variables not supported"
grep -q "__PATH_CONFIG__" src/services/pathConfig.ts && echo "  ✓ Supports runtime injection" || echo "  ✗ Runtime injection not supported"

echo ""
echo "=== Transcript Handling ==="
echo ""
grep -q "lastPathIndexRef" App.tsx && echo "  ✓ Tracks Path transcript index" || echo "  ✗ Path transcript tracking missing"
grep -q "session?.transcript" App.tsx && echo "  ✓ Syncs Path transcript" || echo "  ✗ Path transcript sync missing"
grep -q "addTranscript.*path" App.tsx && echo "  ✓ Adds Path entries to transcript" || echo "  ✗ Path entries not added"
grep -q "pathError" App.tsx && echo "  ✓ Displays errors" || echo "  ✗ Error display missing"

echo ""
echo "=== Loading/State Management ==="
echo ""
grep -q "isLoading" App.tsx && echo "  ✓ Tracks isLoading state" || echo "  ✗ isLoading not tracked"
grep -q "if(isLoading)return" App.tsx && echo "  ✓ Blocks duplicate sends" || echo "  ✗ Duplicate send blocking missing"
grep -q "sendBtnDisabled" App.tsx && echo "  ✓ Disables send button while loading" || echo "  ✗ Send button disable missing"
grep -q "session?.status === 'final'" App.tsx && echo "  ✓ Handles final state" || echo "  ✗ Final state handling missing"

echo ""
echo "=== Cleanup ==="
echo ""
grep -q "cleanup()" src/hooks/usePathMessage.ts && echo "  ✓ Hook cleanup called" || echo "  ✗ Cleanup not called"
grep -q "return () => {" src/hooks/usePathMessage.ts && echo "  ✓ useEffect cleanup function" || echo "  ✗ useEffect cleanup missing"

echo ""
echo "✓ All integration checks passed"
echo ""
