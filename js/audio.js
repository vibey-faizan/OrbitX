/**
 * Optional ambient soundscape, synthesised with the Web Audio API so no audio
 * files are required (nothing can go missing). Off by default and only ever
 * started by an explicit user action.
 */
export class AmbientAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = false;
    this._suspendTimer = null;
  }

  get supported() {
    return Boolean(window.AudioContext || window.webkitAudioContext);
  }

  async enable() {
    if (!this.supported) throw new Error('Web Audio is not supported');
    if (!this.context) this._build();
    clearTimeout(this._suspendTimer);
    await this.context.resume();
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.16, now + 2.5);
    this.enabled = true;
  }

  disable() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.6);
    this.enabled = false;
    this._suspendTimer = setTimeout(() => this.context?.suspend(), 700);
  }

  /** Soft chime used when a body is selected (only while audio is on). */
  chime() {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.35);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.65);
  }

  _build() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Low drone: detuned oscillators through a slowly sweeping low-pass filter.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.8;
    filter.connect(this.master);

    const sweep = ctx.createOscillator();
    const sweepDepth = ctx.createGain();
    sweep.frequency.value = 0.045;
    sweepDepth.gain.value = 260;
    sweep.connect(sweepDepth).connect(filter.frequency);
    sweep.start();

    [[55, 'sine', 0.5], [82.41, 'triangle', 0.22], [110.3, 'sine', 0.2], [164.8, 'sine', 0.07]].forEach(([freq, type, level]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 8;
      gain.gain.value = level;
      osc.connect(gain).connect(filter);
      osc.start();
    });

    // Gentle "solar wind": filtered noise with a slow swell.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.035;
    const swell = ctx.createOscillator();
    const swellDepth = ctx.createGain();
    swell.frequency.value = 0.07;
    swellDepth.gain.value = 0.025;
    swell.connect(swellDepth).connect(noiseGain.gain);
    noise.connect(band).connect(noiseGain).connect(this.master);
    noise.start();
    swell.start();
  }
}
