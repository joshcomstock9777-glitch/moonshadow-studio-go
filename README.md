# Studio Go

Mobile creative room — collaborative AI editing shell.

## Current Status (Foundation + Core)

### Built
- **Three-zone shell**: collapsible AI Room strip • dominant Editor surface • dockable Tool Shelf
- **Four seats**: Grok, Amber, Ellie, Gemini (structure + status only)
- **Orchestrator**: floor control, direct address, silence allowed, modes (natural / round-robin / etc.)
- **Transcript**: live entries appear in expanded room
- **Expert profiles module**: data-driven, uploadable later
- **Editor adapter**: clean command interface (load_media, split, trim, undo, etc.) — real editor plugs in here
- **Tool shelf**: Markup / Media / Browser / Notes / Audio / Text tabs (plugin slots)
- **Honest load_media**: no fake 5-second duration; unprobed clips stay UNKNOWN and cannot export

### Not yet (by design)
- Real editor core mounted (decoder / playback of actual bytes)
- Real media duration probe on load
- Live renderer URL (`EXPO_PUBLIC_RENDERER_API_URL`)
- Deployed Studio Go model-call proof (source already connects to Path)
- Speech-to-text / TTS pipeline
- User-uploaded profiles storage
- Full media bin / markup canvas / notebook

## Architecture
```
src/
  components/layout/   → AIRoomStrip, EditorSurface, ToolShelf
  modules/
    orchestrator/      → floor control
    profiles/          → expert prompts
    editor/            → adapter (only way AIs touch the editor)
    room/              → future room services
  types/               → shared contracts
```

Everything is modular and packable. No hard-coded API keys or personalities.

## Next
Duration probe on load_media, then wire the production renderer. Do not treat this shell as a finished NLE.

## Script sprint — October 12, 2026

The Script surface reuses the existing Path / Allie → Amber → Allie route. It writes a complete draft, requests a replacement for one exact passage, shows that replacement for review, and applies it as a new saved version without changing the rest. Original drafts remain selectable and exportable. Script timing is estimated and publication approval is separate.

Storage is **on this device/browser**, not cloud sync: app documents on Android/iOS and localStorage on web. Saves have readback checks. Native export uses the OS file-sharing sheet; web export downloads a UTF-8 text file. Download backups before clearing app/browser data. Corrupt saved records are not overwritten. Pending session IDs can be reopened and checked without dispatching a second paid request; an ambiguous interrupted submit is not automatically retried.

The client no longer truncates requests at 700 characters. It rejects requests exceeding Path's 16,000-byte JSON-body limit before sending.

For a native build, configure `EXPO_PUBLIC_PATH_API_URL` and verify its native access/CORS boundary on the actual device. Native model access has not been proved by bundling. For a web build co-hosted by Path, leave that variable unset so the app uses the same origin. Standalone web hosting needs an explicitly configured compatible Path URL/origin.

Validation: `npm run check` includes script preservation, selected-only revision, stale-reply rejection, save/readback, export contents and pending-job recovery. Web and Android exports have been built. Direct production Path API testing generated and revised **The Other Tiger**; that backend test is not a Studio Go browser test or Josh's final creative approval.
