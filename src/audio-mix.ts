export type AudioBus = 'music' | 'shot' | 'cue';

/** Bound synth work and preserve room for warning/impact sounds during dense fire. */
export class AudioMixGate {
  readonly limits = { music: 12, shot: 4, cue: 16 };
  readonly voices = { music: 0, shot: 0, cue: 0 };
  peak = 0;
  dropped = 0;
  accepted = 0;
  duckUntil = 0;
  private last = new Map<string, number>();
  get total() { return this.voices.music + this.voices.shot + this.voices.cue; }
  event(key: string, now: number, cooldown: number) {
    if (now - (this.last.get(key) ?? -Infinity) < cooldown) { this.dropped++; return false; }
    this.last.set(key, now); this.accepted++; return true;
  }
  duck(now: number, seconds = .28) { this.duckUntil = Math.max(this.duckUntil, now + seconds); }
  reserve(bus: AudioBus, now: number) {
    if (this.total >= 32 || this.voices[bus] >= this.limits[bus] || (bus === 'shot' && now < this.duckUntil)) {
      this.dropped++; return false;
    }
    this.voices[bus]++; this.peak = Math.max(this.peak, this.total); return true;
  }
  release(bus: AudioBus) { this.voices[bus] = Math.max(0, this.voices[bus] - 1); }
}
