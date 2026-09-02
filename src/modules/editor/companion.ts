import { EditorCommand, EditorAdapter } from '../../types.ts';

export type CompanionMode = 'suggest' | 'execute';

export interface DestructiveApproval {
  approved: true;
  approvedAt: number;
  approvedBy: 'creator';
}

export interface CompanionRequest {
  instruction: string;
  commands: EditorCommand[];
  rationale?: string;
  destructiveApproval?: DestructiveApproval;
}

export interface CompanionStepResult {
  command: EditorCommand;
  ok: boolean;
  message?: string;
}

export interface CompanionRunResult {
  mode: CompanionMode;
  instruction: string;
  executed: boolean;
  steps: CompanionStepResult[];
  summary: string;
}

const destructive = new Set<EditorCommand['type']>(['delete_clip']);

export class EditorCompanion {
  private readonly adapter: EditorAdapter;
  private mode: CompanionMode;

  constructor(adapter: EditorAdapter, mode: CompanionMode = 'suggest') {
    this.adapter = adapter;
    this.mode = mode;
  }

  setMode(mode: CompanionMode) {
    this.mode = mode;
  }

  getMode() {
    return this.mode;
  }

  async run(request: CompanionRequest): Promise<CompanionRunResult> {
    if (!request.instruction.trim()) {
      return {
        mode: this.mode,
        instruction: request.instruction,
        executed: false,
        steps: [],
        summary: 'No editor instruction was provided.',
      };
    }

    const unavailable = request.commands.filter((command) => !this.adapter.canExecute(command));
    if (unavailable.length) {
      return {
        mode: this.mode,
        instruction: request.instruction,
        executed: false,
        steps: unavailable.map((command) => ({
          command,
          ok: false,
          message: `${command.type} is unavailable in the current editor state.`,
        })),
        summary: 'The proposed edit cannot run in the current editor state.',
      };
    }

    if (this.mode === 'suggest') {
      return {
        mode: this.mode,
        instruction: request.instruction,
        executed: false,
        steps: request.commands.map((command) => ({
          command,
          ok: true,
          message: destructive.has(command.type)
            ? 'Suggested destructive edit; creator approval required before execution.'
            : 'Suggested edit; not executed in suggest mode.',
        })),
        summary: `Prepared ${request.commands.length} editor action${request.commands.length === 1 ? '' : 's'} without changing the project.`,
      };
    }

    const destructiveCommands = request.commands.filter((command) => destructive.has(command.type));
    if (destructiveCommands.length && !hasValidDestructiveApproval(request.destructiveApproval)) {
      return {
        mode: this.mode,
        instruction: request.instruction,
        executed: false,
        steps: destructiveCommands.map((command) => ({
          command,
          ok: false,
          message: 'Destructive editor action blocked until the creator explicitly approves execution.',
        })),
        summary: 'No destructive editor action was executed because creator approval evidence was not supplied.',
      };
    }

    const results: CompanionStepResult[] = [];
    for (const command of request.commands) {
      const result = await this.adapter.execute(command);
      results.push({ command, ...result });
      if (!result.ok) break;
    }

    const succeeded = results.filter((step) => step.ok).length;
    const failed = results.find((step) => !step.ok);
    return {
      mode: this.mode,
      instruction: request.instruction,
      executed: succeeded > 0,
      steps: results,
      summary: failed
        ? `Executed ${succeeded} action${succeeded === 1 ? '' : 's'} before stopping: ${failed.message || 'editor command failed'}`
        : `Executed ${succeeded} editor action${succeeded === 1 ? '' : 's'} successfully.`,
    };
  }
}

function hasValidDestructiveApproval(approval?: DestructiveApproval): boolean {
  return Boolean(
    approval?.approved === true &&
    approval.approvedBy === 'creator' &&
    Number.isFinite(approval.approvedAt) &&
    approval.approvedAt > 0,
  );
}

export function createEditorCompanion(adapter: EditorAdapter, mode: CompanionMode = 'suggest') {
  return new EditorCompanion(adapter, mode);
}
