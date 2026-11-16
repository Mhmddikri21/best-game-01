// Synthesized sound effects: no audio files, everything is an oscillator.
// Created lazily on the first user gesture; silent in headless/screenshot runs.

export function createAudio() {
  const audio = { ctx: null, muted: false, enabled: false };

  function ensure() {
    if (audio.ctx) return audio.ctx;
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) return null;
      audio.ctx = new Ctx();
      audio.enabled = true;
    } catch {
      audio.ctx = null;
    }
    return audio.ctx;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    const ctx = ensure();
    if (!ctx || audio.muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, when = 0) {
    const ctx = ensure();
    if (!ctx || audio.muted) return;
    const t0 = ctx.currentTime + when;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  return {
    unlock() { ensure(); },
    toggleMute() { audio.muted = !audio.muted; return audio.muted; },
    get muted() { return audio.muted; },
    pickup() { tone(660, 0.09, 'sine', 0.16); tone(990, 0.12, 'sine', 0.14, 0.07); },
    deliver() { tone(523, 0.12, 'triangle', 0.18); tone(659, 0.12, 'triangle', 0.18, 0.09); tone(784, 0.2, 'triangle', 0.18, 0.18); },
    gold() { tone(784, 0.1, 'sine', 0.16); tone(1046, 0.1, 'sine', 0.16, 0.08); tone(1318, 0.22, 'sine', 0.16, 0.16); },
    crash() { noise(0.25, 0.3); tone(110, 0.22, 'sawtooth', 0.14, 0, 55); },
    gust() { noise(0.4, 0.12); tone(220, 0.35, 'sine', 0.08, 0, 660); },
    horn() { tone(196, 0.3, 'square', 0.07); tone(262, 0.3, 'square', 0.06, 0.05); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.12)); },
    lose() { tone(330, 0.4, 'sawtooth', 0.1, 0, 110); tone(220, 0.6, 'sawtooth', 0.09, 0.3, 82); },
    click() { tone(880, 0.05, 'sine', 0.1); },
  };
}
