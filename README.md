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

### Not yet (by design)
- Real model calls (currently placeholder replies)
- Real editor core mounted
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
Plug the real editor into EditorSurface + wire real model providers into the orchestrator.
