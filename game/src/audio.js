// Sound, synthesised live with WebAudio: no audio files, nothing to load. A low engine
// hum follows the throttle, and short voices mark rings, drums, warnings and impacts.
// Everything is wrapped so a browser that refuses audio simply stays silent.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineOsc.connect(filter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freqA, freqB, seconds, type, volume) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  function noiseBurst(seconds, volume, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (engineGain && ctx) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    },
    isMuted() {
      return muted;
    },
    /** Call every frame while flying: the engine note tracks throttle and airspeed. */
    engine(throttle, speedRatio, running) {
      if (!ctx || !engineOsc || muted) return;
      const t = ctx.currentTime;
      const freq = 52 + throttle * 46 + speedRatio * 18;
      engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
      engineGain.gain.setTargetAtTime(running ? 0.028 + throttle * 0.03 : 0, t, 0.12);
    },
    ring(clean) {
      blip(clean ? 880 : 660, clean ? 1320 : 880, 0.16, 'sine', 0.16);
    },
    drum() {
      blip(340, 620, 0.14, 'triangle', 0.18);
    },
    warning() {
      blip(1175, 1175, 0.09, 'square', 0.05);
    },
    hit() {
      noiseBurst(0.35, 0.3, 700);
      blip(160, 50, 0.3, 'sawtooth', 0.2);
    },
    thunder() {
      noiseBurst(0.9, 0.16, 220);
    },
    touchdown() {
      noiseBurst(0.18, 0.2, 500);
      blip(120, 70, 0.2, 'sine', 0.2);
    },
    fanfare() {
      blip(523, 523, 0.12, 'triangle', 0.14);
      setTimeout(() => blip(659, 659, 0.12, 'triangle', 0.14), 110);
      setTimeout(() => blip(784, 988, 0.24, 'triangle', 0.14), 220);
    },
  };
}
