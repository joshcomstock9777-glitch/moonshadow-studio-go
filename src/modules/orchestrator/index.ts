// Orchestrator / Floor Control
// Critical rule: AIs do NOT all answer every message.
// Silence is valid. Only one speaker at a time.

import { Seat, FloorState, OrchestratorMode, TranscriptEntry } from '../../types';

export interface OrchestratorConfig {
  mode: OrchestratorMode;
  maxAiTurnsBeforeHuman: number;
  allowSilence: boolean;
}

export interface FloorDecision {
  action: 'speak' | 'pass' | 'request_floor' | 'stay_silent';
  seatId?: string;
  reason?: string;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  mode: 'natural',
  maxAiTurnsBeforeHuman: 3,
  allowSilence: true,
};

export class Orchestrator {
  private state: FloorState = 'listening';
  private config: OrchestratorConfig;
  private consecutiveAiTurns = 0;
  private lastSpeakerId: string | null = null;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): FloorState {
    return this.state;
  }

  setMode(mode: OrchestratorMode) {
    this.config.mode = mode;
  }

  /**
   * Called when human speaks or sends text.
   * Direct address (e.g. "Amber?") overrides normal routing.
   */
  onHumanInput(
    text: string,
    seats: Seat[],
    transcript: TranscriptEntry[]
  ): FloorDecision {
    this.state = 'decide_speaker';
    this.consecutiveAiTurns = 0;

    // Direct address check
    const direct = this.detectDirectAddress(text, seats);
    if (direct) {
      this.state = 'generating';
      return { action: 'speak', seatId: direct.id, reason: 'direct_address' };
    }

    // Mode-based decision
    switch (this.config.mode) {
      case 'one_speaker':
        // Prefer the last speaker or first enabled
        const preferred =
          seats.find((s) => s.id === this.lastSpeakerId && s.enabled && !s.muted) ||
          seats.find((s) => s.enabled && !s.muted);
        if (preferred) {
          this.state = 'generating';
          return { action: 'speak', seatId: preferred.id, reason: 'one_speaker_mode' };
        }
        break;

      case 'round_robin':
        const next = this.nextRoundRobin(seats);
        if (next) {
          this.state = 'generating';
          return { action: 'speak', seatId: next.id, reason: 'round_robin' };
        }
        break;

      case 'everyone_brief':
        // For now return first; real impl would queue all
        const first = seats.find((s) => s.enabled && !s.muted);
        if (first) {
          this.state = 'generating';
          return { action: 'speak', seatId: first.id, reason: 'everyone_brief' };
        }
        break;

      case 'brainstorm':
      case 'natural':
      default:
        // Natural: only speak if something useful. For scaffolding we pick one enabled seat
        // Real version will evaluate "SPEAK / PASS / REQUEST_FLOOR" per seat.
        const candidate = seats.find(
          (s) => s.enabled && !s.muted && s.status !== 'offline'
        );
        if (candidate && this.config.allowSilence) {
          // In real system many messages will result in stay_silent
          this.state = 'generating';
          return { action: 'speak', seatId: candidate.id, reason: 'natural' };
        }
        break;
    }

    this.state = 'floor_open';
    return { action: 'stay_silent', reason: 'no_useful_contribution' };
  }

  onAiFinishedSpeaking(seatId: string) {
    this.lastSpeakerId = seatId;
    this.consecutiveAiTurns += 1;
    this.state = 'floor_open';

    if (this.consecutiveAiTurns >= this.config.maxAiTurnsBeforeHuman) {
      // Force return to human
      this.consecutiveAiTurns = 0;
    }
  }

  private detectDirectAddress(text: string, seats: Seat[]): Seat | null {
    const lower = text.toLowerCase().trim();
    for (const seat of seats) {
      if (!seat.enabled) continue;
      const name = seat.name.toLowerCase();
      // "Amber?" or "Amber," or "hey Amber"
      if (
        lower.startsWith(name + '?') ||
        lower.startsWith(name + ',') ||
        lower.startsWith(name + ' ') ||
        lower.includes(` ${name}?`) ||
        lower.includes(` ${name},`)
      ) {
        return seat;
      }
    }
    // "everybody" / "everyone" / "all of you"
    if (
      lower.includes('everybody') ||
      lower.includes('everyone') ||
      lower.includes('all of you') ||
      lower.includes('you guys')
    ) {
      return seats.find((s) => s.enabled && !s.muted) || null;
    }
    return null;
  }

  private nextRoundRobin(seats: Seat[]): Seat | null {
    const active = seats.filter((s) => s.enabled && !s.muted && s.status !== 'offline');
    if (active.length === 0) return null;
    if (!this.lastSpeakerId) return active[0];
    const idx = active.findIndex((s) => s.id === this.lastSpeakerId);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % active.length;
    return active[nextIdx];
  }
}

export function createOrchestrator(config?: Partial<OrchestratorConfig>) {
  return new Orchestrator(config);
}
