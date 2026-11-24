import type { GameEvent } from './engine';
import { WEAPONS } from './weapons';
import { AudioMixGate, type AudioBus } from './audio-mix';

/** Offline synth, with separate music, weapon and priority cue buses. */
export class BattleAudio {
  enabled = true;
  private context?: AudioContext;
  private master?: GainNode;
  private buses?: Record<AudioBus, GainNode>;
  private noise?: AudioBuffer;
  private timer?: ReturnType<typeof setInterval>;
  private active = false;
  private nextTime = 0;
  private step = 0;
  private fever = false;
  private mix = new AudioMixGate();
  onBeat: (strength: number) => void = () => {};
  get state() { return { enabled: this.enabled, active: this.active, context: this.context?.state ?? 'uninitialized',
    bpm: this.fever ? 156 : 136, steps: this.step, voices: { ...this.mix.voices }, peakVoices: this.mix.peak,
    dropped: this.mix.dropped, accepted: this.mix.accepted, ducking: (this.context?.currentTime ?? 0) < this.mix.duckUntil }; }

  init() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? .65 : 0;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 8;
        limiter.attack.value = .003; limiter.release.value = .18;
        this.master.connect(limiter); limiter.connect(this.context.destination);
        this.buses = { music: this.context.createGain(), shot: this.context.createGain(), cue: this.context.createGain() };
        for (const bus of Object.values(this.buses)) bus.connect(this.master);
        this.buses.music.gain.value = .7; this.buses.shot.gain.value = .8; this.buses.cue.gain.value = 1;
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.timer = setInterval(() => this.schedule(), 45);
      }
      if (this.context.state === 'suspended') void this.context.resume();
    } catch { /* Gameplay stays available without Web Audio. */ }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.master && this.context) this.master.gain.setTargetAtTime(enabled ? .65 : 0, this.context.currentTime, .04);
  }
  setState(active: boolean, fever: boolean) {
    if (active !== this.active && this.context && this.buses) {
      const now = this.context.currentTime;
      for (const [bus, level] of [[this.buses.music, .7], [this.buses.shot, .8]] as const) {
        bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(active ? level : 0, now, .035);
      }
      if (active) { this.nextTime = now + .04; this.step = 0; }
    }
    this.active = active; this.fever = fever;
  }
  private duck(seconds = .28) {
    if (!this.context || !this.buses) return;
    const at = this.context.currentTime;
    this.mix.duck(at, seconds);
    for (const [bus, volume] of [[this.buses.shot, .8], [this.buses.music, .7]] as const) {
      bus.gain.cancelScheduledValues(at); bus.gain.setTargetAtTime(volume * .38, at, .012);
      bus.gain.setTargetAtTime(this.active ? volume : 0, this.mix.duckUntil, .10);
    }
  }
  private note(freq: number, at: number, length: number, volume: number, wave: OscillatorType = 'sine', end?: number, bus: AudioBus = 'cue') {
    if (!this.context || !this.buses || !this.mix.reserve(bus, at)) return;
    const osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.type = wave; osc.frequency.setValueAtTime(freq, at);
    if (end) osc.frequency.exponentialRampToValueAtTime(end, at + length);
    gain.gain.setValueAtTime(.001, at); gain.gain.linearRampToValueAtTime(volume, at + .006);
    gain.gain.exponentialRampToValueAtTime(.001, at + length);
    osc.connect(gain); gain.connect(this.buses[bus]);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); this.mix.release(bus); };
    osc.start(at); osc.stop(at + length + .01);
  }
  private percussion(at: number, length: number, volume: number, cutoff: number, bus: AudioBus = 'cue', lowpass = false) {
    if (!this.context || !this.buses || !this.noise || !this.mix.reserve(bus, at)) return;
    const source = this.context.createBufferSource(); source.buffer = this.noise;
    const filter = this.context.createBiquadFilter(); filter.type = lowpass ? 'lowpass' : 'highpass';
    filter.frequency.value = cutoff; filter.Q.value = .6;
    const gain = this.context.createGain(); gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(.001, at + length);
    source.connect(filter); filter.connect(gain); gain.connect(this.buses[bus]);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.mix.release(bus); };
    source.start(at); source.stop(at + length);
  }
  private schedule() {
    if (!this.context || !this.active || !this.enabled) return;
    const now = this.context.currentTime;
    if (this.nextTime < now) this.nextTime = now + .02;
    let count = 0;
    while (this.nextTime < now + .16 && count++ < 3) {
      const at = this.nextTime, s = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      const bpm = this.fever ? 156 : 136;
      if (s % 4 === 0) {
        this.note(145, at, .16, .22, 'sine', 42, 'music'); this.onBeat(s === 0 ? 1 : .65);
      }
      if (s === 4 || s === 12) {
        this.percussion(at, .12, .045, 1400, 'music');
        this.note(180, at, .1, .03, 'triangle', 90, 'music');
      }
      this.percussion(at, s % 2 ? .028 : .045, s % 2 ? .008 : .014, 7200, 'music');
      const roots = [82.41, 65.41, 73.42, 61.74], arp = [1, 1.5, 2, 2.5, 2, 1.5, 3, 2];
      if (s % 2 === 0) {
        this.note(roots[bar] * (s === 10 ? 2 : 1), at, .13, .038, 'triangle', undefined, 'music');
        this.note(roots[bar] * 4 * arp[s / 2], at, .09, .01, 'triangle', undefined, 'music');
      }
      this.nextTime += 60 / bpm / 4; this.step++;
    }
  }
  effect(event: GameEvent) {
    if (!this.context || !this.enabled) return;
    const at = this.context.currentTime;
    if (event.type === 'shot') {
      if (!this.mix.event('shot', at, .10)) return;
      const weapon = WEAPONS[event.weapon ?? 0], profile = weapon.audio;
      this.note(profile.pitch, at, profile.length, .019, profile.wave, profile.end, 'shot');
      if (profile.noise) this.percussion(at, .05, profile.noise, 2100, 'shot', true);
      if ((event.weapon ?? 0) >= 10) this.note(profile.pitch * .5, at, .075, .008, 'sine', profile.end * .5, 'shot');
    } else if (event.type === 'kill') {
      if (!this.mix.event(event.boss ? 'bossKill' : 'kill', at, event.boss ? .3 : .17)) return;
      if (event.boss) this.duck(.55);
      this.note(event.boss ? 85 : 230, at, event.boss ? .4 : .10, event.boss ? .16 : .028, 'triangle', 45);
      this.percussion(at, event.boss ? .3 : .05, event.boss ? .08 : .014, 600, 'cue', true);
    } else if (event.type === 'gate') {
      if (!this.mix.event('gate', at, .25)) return;
      [520, 780, 1040].forEach((f, i) => this.note(f, at + i * .04, .12, .027));
    } else if (event.type === 'upgrade' || event.type === 'fever') {
      if (!this.mix.event('powerUp', at, .35)) return;
      this.duck(.42);
      [330, 440, 660, 880].forEach((f, i) => this.note(f, at + i * .06, .16, .038, 'triangle'));
      if (event.type === 'fever') this.note(100, at, .3, .075, 'sine', 45);
    } else if (event.type === 'hurt') {
      if (!this.mix.event('hurt', at, .18)) return;
      this.duck(); this.note(150, at, .15, .06, 'triangle', 40);
    } else if (event.type === 'bossAttack') {
      if (!this.mix.event('bossCast', at, .16)) return;
      const variation = Number(event.effectId?.split('_')[1] ?? 0);
      const pitch = { slam: 130, lightning: 680, flame: 220, venom: 310, ice: 960, rune: 440, eruption: 90, blade: 820, void: 180, tide: 260 }[event.style ?? 'slam'];
      this.duck(.22); this.note(pitch + variation * 13, at, .22, .042, 'triangle', pitch * 2);
    } else if (event.type === 'bossImpact') {
      if (!this.mix.event('bossImpact', at, .16)) return;
      this.duck(.32);
      if (['lightning', 'void', 'blade'].includes(event.style ?? '')) {
        this.percussion(at, .16, .055, 1800, 'cue', true); this.note(900, at, .15, .034, 'triangle', 70);
      } else if (event.style === 'ice' || event.style === 'rune') {
        [660, 990, 1320].forEach((pitch, i) => this.note(pitch, at + i * .035, .16, .025, 'sine', pitch * .7));
      } else {
        this.note(110, at, .22, .075, 'sine', 32); this.percussion(at, .16, .045, 1600, 'cue', true);
      }
    }
  }
  dispose() { clearInterval(this.timer); void this.context?.close(); }
}
