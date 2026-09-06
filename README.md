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
- Real model calls (currently placeholder replies)
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
