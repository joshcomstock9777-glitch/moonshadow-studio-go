import { EditorCommand, EditorAdapter } from '../../types';
import {
  CompanionMode,
  CompanionRunResult,
  DestructiveApproval,
  EditorCompanion,
} from './companion';

export const HEADQUARTERS_EDITOR_CONTRACT_VERSION = '1.0' as const;

export const HEADQUARTERS_EDITOR_CAPABILITIES = [
  'load_media',
  'play',
  'pause',
  'seek',
  'split',
  'trim_start',
  'trim_end',
  'move_clip',
  'duplicate_clip',
  'delete_clip',
  'add_text',
  'adjust_volume',
  'mute_track',
  'add_fade',
  'undo',
  'redo',
  'save_project',
  'export_preview',
  'show_frame',
  'select_clip',
] as const satisfies readonly EditorCommand['type'][];

export interface HeadquartersEditorManifest {
  contract: 'moonshadow.editor';
  version: typeof HEADQUARTERS_EDITOR_CONTRACT_VERSION;
  surface: 'studio-go';
  capabilities: readonly EditorCommand['type'][];
  destructiveCommands: readonly EditorCommand['type'][];
}

export interface HeadquartersEditorRequest {
  contract: 'moonshadow.editor';
  version: typeof HEADQUARTERS_EDITOR_CONTRACT_VERSION;
  requestId: string;
  instruction: string;
  mode: CompanionMode;
  commands: EditorCommand[];
  destructiveApproval?: DestructiveApproval;
}

export interface HeadquartersEditorResponse {
  contract: 'moonshadow.editor';
  version: typeof HEADQUARTERS_EDITOR_CONTRACT_VERSION;
  requestId: string;
  ok: boolean;
  result?: CompanionRunResult;
  error?: {
    code: 'INVALID_REQUEST' | 'UNSUPPORTED_VERSION' | 'EXECUTION_FAILED';
    message: string;
  };
}

const destructiveCommands = ['delete_clip'] as const satisfies readonly EditorCommand['type'][];
const capabilitySet = new Set<EditorCommand['type']>(HEADQUARTERS_EDITOR_CAPABILITIES);

export function getHeadquartersEditorManifest(): HeadquartersEditorManifest {
  return {
    contract: 'moonshadow.editor',
    version: HEADQUARTERS_EDITOR_CONTRACT_VERSION,
    surface: 'studio-go',
    capabilities: HEADQUARTERS_EDITOR_CAPABILITIES,
    destructiveCommands,
  };
}

export function validateHeadquartersEditorRequest(
  value: unknown,
): { ok: true; request: HeadquartersEditorRequest } | { ok: false; response: HeadquartersEditorResponse } {
  const candidate = value as Partial<HeadquartersEditorRequest> | null;
  const requestId = typeof candidate?.requestId === 'string' && candidate.requestId.trim()
    ? candidate.requestId.trim()
    : 'unknown';

  if (candidate?.contract !== 'moonshadow.editor') {
    return invalid(requestId, 'INVALID_REQUEST', 'Editor request contract must be moonshadow.editor.');
  }

  if (candidate.version !== HEADQUARTERS_EDITOR_CONTRACT_VERSION) {
    return invalid(requestId, 'UNSUPPORTED_VERSION', `Unsupported editor contract version: ${String(candidate.version)}.`);
  }

  if (!requestId || requestId === 'unknown') {
    return invalid('unknown', 'INVALID_REQUEST', 'Editor requestId is required.');
  }

  if (typeof candidate.instruction !== 'string' || !candidate.instruction.trim()) {
    return invalid(requestId, 'INVALID_REQUEST', 'Editor instruction is required.');
  }

  if (candidate.mode !== 'suggest' && candidate.mode !== 'execute') {
    return invalid(requestId, 'INVALID_REQUEST', 'Editor mode must be suggest or execute.');
  }

  if (!Array.isArray(candidate.commands) || candidate.commands.length === 0) {
    return invalid(requestId, 'INVALID_REQUEST', 'At least one editor command is required.');
  }

  const unsupported = candidate.commands.find(
    (command) => !command || typeof command !== 'object' || !capabilitySet.has((command as EditorCommand).type),
  );
  if (unsupported) {
    return invalid(requestId, 'INVALID_REQUEST', 'Editor request contains an unsupported command.');
  }

  return {
    ok: true,
    request: {
      contract: 'moonshadow.editor',
      version: HEADQUARTERS_EDITOR_CONTRACT_VERSION,
      requestId,
      instruction: candidate.instruction.trim(),
      mode: candidate.mode,
      commands: candidate.commands as EditorCommand[],
      destructiveApproval: candidate.destructiveApproval,
    },
  };
}

export async function executeHeadquartersEditorRequest(
  adapter: EditorAdapter,
  value: unknown,
): Promise<HeadquartersEditorResponse> {
  const validation = validateHeadquartersEditorRequest(value);
  if (!validation.ok) return validation.response;

  const { request } = validation;
  try {
    const companion = new EditorCompanion(adapter, request.mode);
    const result = await companion.run({
      instruction: request.instruction,
      commands: request.commands,
      destructiveApproval: request.destructiveApproval,
    });

    const failedStep = result.steps.some((step) => !step.ok);
    return {
      contract: 'moonshadow.editor',
      version: HEADQUARTERS_EDITOR_CONTRACT_VERSION,
      requestId: request.requestId,
      ok: !failedStep,
      result,
      ...(failedStep
        ? { error: { code: 'EXECUTION_FAILED' as const, message: result.summary } }
        : {}),
    };
  } catch (error) {
    return {
      contract: 'moonshadow.editor',
      version: HEADQUARTERS_EDITOR_CONTRACT_VERSION,
      requestId: request.requestId,
      ok: false,
      error: {
        code: 'EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Editor execution failed.',
      },
    };
  }
}

function invalid(
  requestId: string,
  code: HeadquartersEditorResponse['error']['code'],
  message: string,
): { ok: false; response: HeadquartersEditorResponse } {
  return {
    ok: false,
    response: {
      contract: 'moonshadow.editor',
      version: HEADQUARTERS_EDITOR_CONTRACT_VERSION,
      requestId,
      ok: false,
      error: { code, message },
    },
  };
}
