# Editor Companion Contract

The Editor Companion is an operator for the mounted Studio Go editor runtime. It is not a chat-only helper and it must never report an edit as complete unless the editor adapter returns success.

## Modes

- `suggest`: proposes validated editor commands without changing the project. This is the default.
- `execute`: runs validated commands sequentially against the shared editor adapter and stops on the first failure.

## Current command surface

The companion can request the editor commands defined in `src/types.ts`, including media load, play/pause/seek, clip selection/movement/duplication/deletion, text insertion, volume/mute, save, preview export, and frame display.

Commands backed by the current Studio Go runtime change real editor state. Commands that still require the production renderer return `ok: false`; they are not simulated.

## Safety and creator control

Destructive commands are identified explicitly. In `suggest` mode they are never executed. Creator-facing UI should surface them distinctly before switching to execution.

## Intended AI workflow

1. AI receives creator instruction plus current editor/timeline state.
2. AI produces structured `EditorCommand[]` only from the allowed contract.
3. Companion validates availability through `EditorAdapter.canExecute`.
4. In suggest mode, the plan is shown without mutation.
5. In execute mode, commands are run sequentially.
6. The exact adapter result is returned to the AI/creator and stored as evidence.
7. Renderer-dependent failures remain visible until that renderer is genuinely connected.

## Next integration points

- expose current `EditorState` to the AI request context
- add creator approval UI for destructive batches
- connect the production media renderer for split/trim/fade/undo/redo/export
- persist project state and rendered outputs to the Asset Library
- return render/export asset IDs to Headquarters and Content Factory
