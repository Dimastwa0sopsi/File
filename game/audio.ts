// Звук на WebAudio: двигатель, вертолёт, сирена, выстрелы, удары, интерфейс
export class Sound {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private eng: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filt: BiquadFilterNode } | null = null;
  private heli: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.6; muted = false;
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return this.ctx; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.applyVolume();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
    return this.ctx;
  }
  setVolume(v: number, muted: boolean) { this.volume = v; this.muted = muted; this.applyVolume(); }
  private applyVolume() { if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.5; }
  engine(on: boolean, rpm: number, load: number, electric: boolean) {
    const c = this.ctx; if (!c || !this.master) return;
    if (on && !this.eng) {
      const osc = c.createOscillator(), osc2 = c.createOscillator(), gain = c.createGain(), filt = c.createBiquadFilter();
      osc.type = 'sawtooth'; osc2.type = 'square'; filt.type = 'lowpass'; filt.frequency.value = 600; gain.gain.value = 0;
      osc.connect(filt); osc2.connect(filt); filt.connect(gain); gain.connect(this.master); osc.start(); osc2.start();
      this.eng = { osc, osc2, gain, filt };
    }
    if (!this.eng) return;
    const t = c.currentTime;
    if (!on) { this.eng.gain.gain.setTargetAtTime(0, t, 0.1); return; }
    const f = electric ? 180 + rpm * 0.12 : 32 + rpm * 0.018;
    this.eng.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.eng.osc2.frequency.setTargetAtTime(f * (electric ? 1.5 : 0.5), t, 0.05);
    this.eng.filt.frequency.setTargetAtTime(electric ? 900 : 300 + rpm * 0.12 + load * 500, t, 0.05);
    this.eng.gain.gain.setTargetAtTime(electric ? 0.035 : 0.08 + load * 0.07, t, 0.08);
  }
  heliSound(on: boolean, power: number) {
    const c = this.ctx; if (!c || !this.master || !this.noiseBuf) return;
    if (on && !this.heli) {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 400;
      const gain = c.createGain(); gain.gain.value = 0;
      const lfo = c.createOscillator(); lfo.frequency.value = 14; const lg = c.createGain(); lg.gain.value = 0.12;
      lfo.connect(lg); lg.connect(gain.gain); src.connect(filt); filt.connect(gain); gain.connect(this.master); src.start(); lfo.start();
      this.heli = { src, gain, lfo };
    }
    if (!this.heli) return;
    this.heli.gain.gain.setTargetAtTime(on ? 0.15 + power * 0.1 : 0, c.currentTime, 0.2);
    this.heli.lfo.frequency.setTargetAtTime(10 + power * 8, c.currentTime, 0.2);
  }
  sirenSound(on: boolean) {
    const c = this.ctx; if (!c || !this.master) return;
    if (on && !this.siren) {
      const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 700;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.8; const lg = c.createGain(); lg.gain.value = 250;
      lfo.connect(lg); lg.connect(osc.frequency);
      const gain = c.createGain(); gain.gain.value = 0; osc.connect(gain); gain.connect(this.master); osc.start(); lfo.start();
      this.siren = { osc, gain, lfo };
    }
    if (this.siren) this.siren.gain.gain.setTargetAtTime(on ? 0.04 : 0, c.currentTime, 0.2);
  }
  private burst(dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass') {
    const c = this.ensure(); if (!c || !this.master || !this.noiseBuf) return;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); const t = c.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur);
  }
  private tone(freq: number, dur: number, vol = 0.15, type: OscillatorType = 'sine', delay = 0) {
    const c = this.ensure(); if (!c || !this.master) return;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); const t = c.currentTime + delay;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  shot(vol = 1) { this.burst(0.22, 2800, 0.9 * vol); this.burst(0.5, 500, 0.5 * vol); this.tone(85, 0.14, 0.4 * vol, 'square'); }
  swing() { this.burst(0.09, 1800, 0.12, 'bandpass'); }
  block() { this.burst(0.08, 350, 0.35); this.tone(140, 0.06, 0.12, 'triangle'); }
  hurt() { this.tone(170, 0.12, 0.12, 'sawtooth'); this.burst(0.1, 600, 0.35); }
  reload() { this.tone(900, 0.04, 0.1, 'square'); this.tone(600, 0.05, 0.1, 'square', 0.5); this.tone(1200, 0.04, 0.12, 'square', 1.15); }
  dry() { this.tone(1500, 0.03, 0.1, 'square'); }
  punch() { this.burst(0.12, 500, 0.6); }
  crash(power: number) { this.burst(0.4, 900, Math.min(1, 0.3 + power * 0.05)); this.tone(60, 0.3, 0.3, 'sawtooth'); }
  crackle() { for (let i = 0; i < 4; i++) setTimeout(() => this.burst(0.03 + Math.random() * 0.05, 2000 + Math.random() * 4000, 0.25 + Math.random() * 0.3, 'highpass'), i * (30 + Math.random() * 70)); }
  beep() { this.tone(1400, 0.08, 0.12, 'square'); this.tone(1400, 0.08, 0.12, 'square', 0.14); }
  tick() { this.tone(1500 + Math.random() * 300, 0.04, 0.05); }
  click() { this.tone(900, 0.05, 0.08, 'square'); }
  coin() { this.tone(1200, 0.08, 0.12); this.tone(1700, 0.12, 0.1, 'sine', 0.07); }
  error() { this.tone(200, 0.2, 0.12, 'square'); }
  door() { this.burst(0.2, 300, 0.4); }
  gear() { this.tone(300, 0.04, 0.1, 'square'); }
  dispose() {
    try { this.eng?.osc.stop(); this.eng?.osc2.stop(); this.heli?.src.stop(); this.heli?.lfo.stop(); this.siren?.osc.stop(); this.siren?.lfo.stop(); } catch { /* */ }
    this.ctx?.close().catch(() => {}); this.ctx = null; this.eng = null; this.heli = null; this.siren = null;
  }
}
