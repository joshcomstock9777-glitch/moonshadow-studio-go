# Studio Go — Runbook

## Live Services
- **Bridge URL**: `https://bridge-service-xxxxxxxxxx-uc.a.run.app`
- **Auth header**: `x-bridge-key: $BRIDGE_KEY`

## Quick Health Check
```bash
export BRIDGE_URL="https://bridge-service-xxxxxxxxxx-uc.a.run.app"
export BRIDGE_KEY="your-key-here"
./scripts/healthcheck.sh
```

Expected:
- `root` → 200
- `bridge_no_key` → 403
- `bridge_with_key` → 200 or 202

## Common Tasks

### Restart / Redeploy Bridge
1. Make code changes
2. Run `./scripts/deploy.sh` (or your actual Cloud Run / host command)
3. Re-run healthcheck

### Rotate Bridge Key
1. Generate new key
2. Update the service environment variable
3. Update local `BRIDGE_KEY`
4. Healthcheck again

### Add a New Seat / Provider
1. Update seat list in the client
2. Add provider config (never hard-code keys in frontend)
3. Restart the room

## Emergency
If the bridge is down:
1. Check Cloud Run / host logs
2. Confirm the service is not scaled to zero unexpectedly
3. Verify the key is still valid
4. Fall back to direct provider calls if needed while bridge is restored
