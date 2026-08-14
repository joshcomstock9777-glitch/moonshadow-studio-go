# Studio Go — Maintenance Notes

## Daily / Weekly
- Run `./scripts/healthcheck.sh`
- Glance at error rates / latency on the bridge
- Make sure no secrets leaked into client code

## After Every Deploy
- Healthcheck must pass before telling the room the bridge is live
- Confirm seats can still reach the bridge

## Code Hygiene
- Never put API keys or bridge keys in the frontend
- Keep the editor adapter as the only path AIs use to touch the timeline
- Prefer small, reversible changes

## When Things Get Noisy
- Orchestrator is the source of truth for who speaks
- If agents start free-for-all, tighten the floor rules or temporarily set mode to `one_speaker`
