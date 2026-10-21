// Synthesized sound effects (Web Audio API), no audio files
// Inspired by Tetsuya Mizuguchi (Rez, Lumines) - layered, resonant, memorable sounds
const Sound = (() => {
  let enabled = localStorage.getItem('omok_sound') !== 'off';
  let audioCtx = null;

  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function setEnabled(val) {
    enabled = val;
    localStorage.setItem('omok_sound', val ? 'on' : 'off');
  }

  function isEnabled() { return enabled; }

  function toggle() {
    setEnabled(!enabled);
    return enabled;
  }

  // ─── Utility helpers ───────────────────────────────────────────────

  // Create convolver-based reverb from synthesized impulse response
  function createReverb(ctx, duration = 1.5, decay = 2.0) {
    const rate = ctx.sampleRate;
    const length = rate * duration;
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  // Create white noise buffer source
  function createNoise(ctx, duration) {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  // Quick oscillator setup
  function mkOsc(ctx, type, freq) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  // Quick gain node
  function mkGain(ctx, value = 0) {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  // ─── 1. playStone: satisfying "click" with resonant wooden body ────

  function playStone() {
    if (!enabled) return;
    const ctx = getCtx();
    const t = ctx.currentTime;

    // Layer 1: Attack transient - short noise burst (the "click")
    const noise = createNoise(ctx, 0.04);
    const noiseGain = mkGain(ctx, 0);
    const noiseBP = ctx.createBiquadFilter();
    noiseBP.type = 'bandpass';
    noiseBP.frequency.value = 3500;
    noiseBP.Q.value = 2.0;
    noise.connect(noiseBP);
    noiseBP.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseGain.gain.setValueAtTime(0.35, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    noise.start(t);
    noise.stop(t + 0.04);

    // Layer 2: Resonant body (wooden tone) - two detuned sines
    [280, 420].forEach((freq) => {
      const o = mkOsc(ctx, 'sine', freq);
      const g = mkGain(ctx, 0);
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.1);
      o.start(t);
      o.stop(t + 0.13);
    });

    // Layer 3: Subtle low thud
    const thud = mkOsc(ctx, 'sine', 120);
    const thudGain = mkGain(ctx, 0);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudGain.gain.setValueAtTime(0.12, t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    thud.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    thud.start(t);
    thud.stop(t + 0.09);
  }

  // ─── 2. playWin: epic ascending chord progression with shimmer ─────

  function playWin() {
    if (!enabled) return;
    const ctx = getCtx();
    const t = ctx.currentTime;

    // Reverb bus
    const reverb = createReverb(ctx, 2.5, 2.5);
    const reverbGain = mkGain(ctx, 0.3);
    reverb.connect(reverbGain);
    reverbGain.connect(ctx.destination);

    // Chord progression: C major -> E major -> G major -> C major (octave up)
    const chords = [
      { notes: [261.6, 329.6, 392.0], time: 0 },
      { notes: [329.6, 415.3, 493.9], time: 0.28 },
      { notes: [392.0, 493.9, 587.3], time: 0.56 },
      { notes: [523.3, 659.3, 784.0], time: 0.84 },
    ];

    chords.forEach((chord, ci) => {
      const chordTime = t + chord.time;
      const isLast = ci === chords.length - 1;
      const dur = isLast ? 1.2 : 0.35;

      chord.notes.forEach((freq, ni) => {
        // Main tone (triangle for warmth)
        const o1 = mkOsc(ctx, 'triangle', freq);
        const g1 = mkGain(ctx, 0);
        o1.connect(g1);
        g1.connect(ctx.destination);
        g1.connect(reverb);
        g1.gain.setValueAtTime(0.001, chordTime);
        g1.gain.linearRampToValueAtTime(isLast ? 0.15 : 0.12, chordTime + 0.03);
        g1.gain.exponentialRampToValueAtTime(0.001, chordTime + dur);
        o1.start(chordTime);
        o1.stop(chordTime + dur + 0.1);

        // Shimmer layer (sine, octave up, quieter)
        const o2 = mkOsc(ctx, 'sine', freq * 2);
        const g2 = mkGain(ctx, 0);
        o2.connect(g2);
        g2.connect(ctx.destination);
        g2.connect(reverb);
        g2.gain.setValueAtTime(0.001, chordTime);
        g2.gain.linearRampToValueAtTime(isLast ? 0.06 : 0.04, chordTime + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, chordTime + dur);
        // Slight vibrato on shimmer
        const lfo = mkOsc(ctx, 'sine', 5 + ni);
        const lfoGain = mkGain(ctx, 3);
        lfo.connect(lfoGain);
        lfoGain.connect(o2.frequency);
        lfo.start(chordTime);
        lfo.stop(chordTime + dur + 0.1);
        o2.start(chordTime);
        o2.stop(chordTime + dur + 0.1);
      });
    });

    // Final sparkle: high-frequency shimmer cascade
    const sparkleStart = t + 1.1;
    for (let i = 0; i < 6; i++) {
      const so = mkOsc(ctx, 'sine', 2000 + i * 400);
      const sg = mkGain(ctx, 0);
      so.connect(sg);
      sg.connect(reverb);
      sg.gain.setValueAtTime(0.001, sparkleStart + i * 0.05);
      sg.gain.linearRampToValueAtTime(0.04, sparkleStart + i * 0.05 + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.001, sparkleStart + i * 0.05 + 0.25);
      so.start(sparkleStart + i * 0.05);
      so.stop(sparkleStart + i * 0.05 + 0.3);
    }
  }

  // ─── 3. playLose: dramatic descending tones, ominous and final ─────

  function playLose() {
    if (!enabled) return;
    const ctx = getCtx();
    const t = ctx.currentTime;

    // Reverb for atmosphere
    const reverb = createReverb(ctx, 2.0, 3.0);
    const reverbGain = mkGain(ctx, 0.25);
    reverb.connect(reverbGain);
    reverbGain.connect(ctx.destination);

    // Descending minor chord progression with pitch droop
    const steps = [
      { freq: 440, time: 0 },
      { freq: 370, time: 0.3 },
      { freq: 311, time: 0.6 },
      { freq: 220, time: 0.9 },
    ];

    steps.forEach((step, i) => {
      const st = t + step.time;
      const isLast = i === steps.length - 1;
      const dur = isLast ? 1.5 : 0.4;

      // Dark sawtooth tone through closing lowpass filter
      const o1 = mkOsc(ctx, 'sawtooth', step.freq);
      const g1 = mkGain(ctx, 0);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      lp.Q.value = 2;
      o1.connect(lp);
      lp.connect(g1);
      g1.connect(ctx.destination);
      g1.connect(reverb);
      g1.gain.setValueAtTime(0.001, st);
      g1.gain.linearRampToValueAtTime(0.1, st + 0.04);
      g1.gain.exponentialRampToValueAtTime(0.001, st + dur);
      o1.frequency.setValueAtTime(step.freq, st);
      o1.frequency.exponentialRampToValueAtTime(step.freq * 0.85, st + dur);
      lp.frequency.setValueAtTime(800, st);
      lp.frequency.exponentialRampToValueAtTime(200, st + dur);
      o1.start(st);
      o1.stop(st + dur + 0.1);

      // Minor third sub-tone for darkness
      const o2 = mkOsc(ctx, 'triangle', step.freq * 0.75);
      const g2 = mkGain(ctx, 0);
      o2.connect(g2);
      g2.connect(ctx.destination);
      g2.connect(reverb);
      g2.gain.setValueAtTime(0.001, st);
      g2.gain.linearRampToValueAtTime(0.06, st + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, st + dur * 0.8);
      o2.start(st);
      o2.stop(st + dur + 0.1);
    });

    // Low rumble at the end
    const rumble = mkOsc(ctx, 'sine', 55);
    const rumbleGain = mkGain(ctx, 0);
    rumble.connect(rumbleGain);
    rumbleGain.connect(ctx.destination);
    rumbleGain.gain.setValueAtTime(0.001, t + 1.0);
    rumbleGain.gain.linearRampToValueAtTime(0.15, t + 1.3);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    rumble.start(t + 1.0);
    rumble.stop(t + 2.6);
  }

  // ─── 4. playTaunt: unique sound per effectKey ──────────────────────

  const tauntEffects = {

    // Glitchy digital alarm - rapid alternating square waves with random pitch
    system_override(ctx, t) {
      for (let i = 0; i < 8; i++) {
        const freq = i % 2 === 0 ? 1200 : 600;
        const o = mkOsc(ctx, 'square', freq);
        const g = mkGain(ctx, 0);
        o.connect(g);
        g.connect(ctx.destination);
        const onset = t + i * 0.06;
        g.gain.setValueAtTime(0.12, onset);
        g.gain.exponentialRampToValueAtTime(0.001, onset + 0.05);
        o.frequency.setValueAtTime(freq + Math.random() * 400, onset);
        o.frequency.setValueAtTime(freq - Math.random() * 200, onset + 0.03);
        o.start(onset);
        o.stop(onset + 0.055);
      }
      // Alarm sweep layer
      const sweep = mkOsc(ctx, 'sawtooth', 800);
      const sg = mkGain(ctx, 0);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 600;
      sweep.connect(hp);
      hp.connect(sg);
      sg.connect(ctx.destination);
      sg.gain.setValueAtTime(0.08, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      sweep.frequency.setValueAtTime(800, t);
      sweep.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
      sweep.frequency.exponentialRampToValueAtTime(400, t + 0.5);
      sweep.start(t);
      sweep.stop(t + 0.55);
    },

    // Deep bass impact + metallic ring (inharmonic overtones)
    zero_sum(ctx, t) {
      // Sub bass impact
      const sub = mkOsc(ctx, 'sine', 60);
      const subG = mkGain(ctx, 0);
      sub.connect(subG);
      subG.connect(ctx.destination);
      subG.gain.setValueAtTime(0.35, t);
      subG.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      sub.frequency.setValueAtTime(60, t);
      sub.frequency.exponentialRampToValueAtTime(30, t + 0.3);
      sub.start(t);
      sub.stop(t + 0.45);

      // Metallic ring - inharmonic partials for bell-like quality
      [1340, 1780, 2100, 2870].forEach((freq) => {
        const o = mkOsc(ctx, 'sine', freq);
        const g = mkGain(ctx, 0);
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0.06, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        o.start(t + 0.01);
        o.stop(t + 0.85);
      });

      // Noise transient for attack
      const noise = createNoise(ctx, 0.05);
      const ng = mkGain(ctx, 0);
      noise.connect(ng);
      ng.connect(ctx.destination);
      ng.gain.setValueAtTime(0.2, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      noise.start(t);
      noise.stop(t + 0.05);
    },

    // Warbling/wobbling pitch - heavy LFO modulation
    neural_lag(ctx, t) {
      const o1 = mkOsc(ctx, 'triangle', 400);
      const g1 = mkGain(ctx, 0);
      o1.connect(g1);
      g1.connect(ctx.destination);
      g1.gain.setValueAtTime(0.15, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

      // Heavy LFO wobble on first voice
      const lfo = mkOsc(ctx, 'sine', 8);
      const lfoG = mkGain(ctx, 120);
      lfo.connect(lfoG);
      lfoG.connect(o1.frequency);
      lfo.start(t);
      lfo.stop(t + 0.85);

      // Second wobble layer at different rate
      const o2 = mkOsc(ctx, 'sine', 500);
      const g2 = mkGain(ctx, 0);
      o2.connect(g2);
      g2.connect(ctx.destination);
      g2.gain.setValueAtTime(0.08, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      const lfo2 = mkOsc(ctx, 'sine', 12);
      const lfo2G = mkGain(ctx, 200);
      lfo2.connect(lfo2G);
      lfo2G.connect(o2.frequency);
      lfo2.start(t);
      lfo2.stop(t + 0.75);

      o1.start(t);
      o1.stop(t + 0.85);
      o2.start(t);
      o2.stop(t + 0.75);
    },

    // Eerie ghost whistle - breathy sine with slow vibrato and reverb
    ghost_shell(ctx, t) {
      const reverb = createReverb(ctx, 2.0, 2.5);
      const reverbGain = mkGain(ctx, 0.3);
      reverb.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      // Breathy whistle with sliding pitch
      const whistle = mkOsc(ctx, 'sine', 800);
      const wg = mkGain(ctx, 0);
      whistle.connect(wg);
      wg.connect(reverb);
      wg.connect(ctx.destination);
      wg.gain.setValueAtTime(0.001, t);
      wg.gain.linearRampToValueAtTime(0.1, t + 0.15);
      wg.gain.linearRampToValueAtTime(0.08, t + 0.5);
      wg.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      whistle.frequency.setValueAtTime(800, t);
      whistle.frequency.linearRampToValueAtTime(1000, t + 0.3);
      whistle.frequency.linearRampToValueAtTime(700, t + 0.7);
      whistle.frequency.linearRampToValueAtTime(850, t + 1.0);

      // Slow vibrato
      const vib = mkOsc(ctx, 'sine', 4);
      const vibG = mkGain(ctx, 15);
      vib.connect(vibG);
      vibG.connect(whistle.frequency);
      vib.start(t);
      vib.stop(t + 1.05);

      // Breath noise layer (bandpassed for airiness)
      const noise = createNoise(ctx, 1.0);
      const nBP = ctx.createBiquadFilter();
      nBP.type = 'bandpass';
      nBP.frequency.value = 900;
      nBP.Q.value = 5;
      const ng = mkGain(ctx, 0);
      noise.connect(nBP);
      nBP.connect(ng);
      ng.connect(reverb);
      ng.gain.setValueAtTime(0.001, t);
      ng.gain.linearRampToValueAtTime(0.04, t + 0.2);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      noise.start(t);
      noise.stop(t + 1.0);

      whistle.start(t);
      whistle.stop(t + 1.05);
    },

    // Glass breaking - sharp transient + white noise shatter cascade
    fragile(ctx, t) {
      // Initial crack transient
      const crack = mkOsc(ctx, 'square', 4000);
      const cg = mkGain(ctx, 0);
      crack.connect(cg);
      cg.connect(ctx.destination);
      cg.gain.setValueAtTime(0.2, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      crack.start(t);
      crack.stop(t + 0.025);

      // Shatter: multiple short noise bursts at staggered times
      for (let i = 0; i < 7; i++) {
        const onset = t + 0.02 + i * 0.04 + Math.random() * 0.02;
        const shard = createNoise(ctx, 0.06);
        const sg = mkGain(ctx, 0);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2000 + Math.random() * 6000;
        bp.Q.value = 3 + Math.random() * 5;
        shard.connect(bp);
        bp.connect(sg);
        sg.connect(ctx.destination);
        const vol = 0.12 - i * 0.012;
        sg.gain.setValueAtTime(Math.max(vol, 0.02), onset);
        sg.gain.exponentialRampToValueAtTime(0.001, onset + 0.05);
        shard.start(onset);
        shard.stop(onset + 0.06);
      }

      // Tinkle: high sine pings (glass fragments settling)
      [3200, 4500, 5800, 3800, 6200].forEach((freq, i) => {
        const onset = t + 0.1 + i * 0.06;
        const o = mkOsc(ctx, 'sine', freq);
        const g = mkGain(ctx, 0);
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0.05 - i * 0.008, onset);
        g.gain.exponentialRampToValueAtTime(0.001, onset + 0.15);
        o.start(onset);
        o.stop(onset + 0.16);
      });
    },

    // Deep drone + reverb - ominous void atmosphere
    the_void(ctx, t) {
      const reverb = createReverb(ctx, 3.0, 2.0);
      const reverbGain = mkGain(ctx, 0.35);
      reverb.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      // Layered low-frequency drones with slow filter sweep
      [55, 58, 82.5].forEach((freq) => {
        const o = mkOsc(ctx, 'sawtooth', freq);
        const g = mkGain(ctx, 0);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 300;
        lp.Q.value = 4;
        o.connect(lp);
        lp.connect(g);
        g.connect(reverb);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.08, t + 0.3);
        g.gain.setValueAtTime(0.08, t + 0.8);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        lp.frequency.setValueAtTime(150, t);
        lp.frequency.linearRampToValueAtTime(400, t + 0.7);
        lp.frequency.linearRampToValueAtTime(100, t + 1.5);
        o.start(t);
        o.stop(t + 1.55);
      });

      // Distant low rumble noise
      const noise = createNoise(ctx, 1.5);
      const nlp = ctx.createBiquadFilter();
      nlp.type = 'lowpass';
      nlp.frequency.value = 150;
      const ng = mkGain(ctx, 0);
      noise.connect(nlp);
      nlp.connect(ng);
      ng.connect(reverb);
      ng.gain.setValueAtTime(0.001, t);
      ng.gain.linearRampToValueAtTime(0.06, t + 0.5);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      noise.start(t);
      noise.stop(t + 1.5);
    },

    // Rapid clicking/typing sounds - data exfiltration
    data_leak(ctx, t) {
      const numClicks = 16;
      for (let i = 0; i < numClicks; i++) {
        const onset = t + i * 0.04 + Math.random() * 0.015;
        // Each click: very short noise burst
        const noise = createNoise(ctx, 0.015);
        const ng = mkGain(ctx, 0);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000 + Math.random() * 3000;
        noise.connect(hp);
        hp.connect(ng);
        ng.connect(ctx.destination);
        const vol = 0.08 + Math.random() * 0.06;
        ng.gain.setValueAtTime(vol, onset);
        ng.gain.exponentialRampToValueAtTime(0.001, onset + 0.012);
        noise.start(onset);
        noise.stop(onset + 0.015);

        // Occasional key "ping" (every 3rd click)
        if (i % 3 === 0) {
          const ping = mkOsc(ctx, 'sine', 1800 + Math.random() * 1500);
          const pg = mkGain(ctx, 0);
          ping.connect(pg);
          pg.connect(ctx.destination);
          pg.gain.setValueAtTime(0.04, onset);
          pg.gain.exponentialRampToValueAtTime(0.001, onset + 0.03);
          ping.start(onset);
          ping.stop(onset + 0.035);
        }
      }
      // Digital whine underneath
      const whine = mkOsc(ctx, 'sine', 3600);
      const wg = mkGain(ctx, 0);
      whine.connect(wg);
      wg.connect(ctx.destination);
      wg.gain.setValueAtTime(0.001, t);
      wg.gain.linearRampToValueAtTime(0.03, t + 0.2);
      wg.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      whine.start(t);
      whine.stop(t + 0.7);
    },

    // Static/noise burst with stuttering signal cutout
    signal_loss(ctx, t) {
      // Main static burst
      const noise = createNoise(ctx, 0.5);
      const ng = mkGain(ctx, 0);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3000;
      bp.Q.value = 0.5;
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(ctx.destination);
      ng.gain.setValueAtTime(0.2, t);
      // Stuttering volume (simulate signal cutting in/out)
      for (let i = 0; i < 6; i++) {
        const onset = t + i * 0.07;
        ng.gain.setValueAtTime(0.18, onset);
        ng.gain.setValueAtTime(0.02, onset + 0.03);
      }
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      noise.start(t);
      noise.stop(t + 0.55);

      // Descending carrier tone (radio tuning away)
      const carrier = mkOsc(ctx, 'sine', 1200);
      const cg = mkGain(ctx, 0);
      carrier.connect(cg);
      cg.connect(ctx.destination);
      cg.gain.setValueAtTime(0.08, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      carrier.frequency.exponentialRampToValueAtTime(200, t + 0.45);
      carrier.start(t);
      carrier.stop(t + 0.5);
    },

    // Clock ticking that accelerates, ending with a bell
    chronos(ctx, t) {
      const totalTicks = 12;
      let tickTime = 0;
      for (let i = 0; i < totalTicks; i++) {
        // Accelerating interval: starts slow, gets faster
        const interval = 0.15 - (i / totalTicks) * 0.11;
        const onset = t + tickTime;
        tickTime += Math.max(interval, 0.04);

        // Tick: short high click
        const tick = mkOsc(ctx, 'sine', 1600 + i * 50);
        const tg = mkGain(ctx, 0);
        tick.connect(tg);
        tg.connect(ctx.destination);
        const vol = 0.1 + (i / totalTicks) * 0.08;
        tg.gain.setValueAtTime(vol, onset);
        tg.gain.exponentialRampToValueAtTime(0.001, onset + 0.025);
        tick.start(onset);
        tick.stop(onset + 0.03);

        // Tock (alternating lower sound)
        if (i % 2 === 1) {
          const tock = mkOsc(ctx, 'triangle', 800);
          const tog = mkGain(ctx, 0);
          tock.connect(tog);
          tog.connect(ctx.destination);
          tog.gain.setValueAtTime(vol * 0.6, onset);
          tog.gain.exponentialRampToValueAtTime(0.001, onset + 0.03);
          tock.start(onset);
          tock.stop(onset + 0.035);
        }
      }

      // Final "time's up" bell
      const bellTime = t + tickTime + 0.05;
      const bell = mkOsc(ctx, 'sine', 2200);
      const bg = mkGain(ctx, 0);
      bell.connect(bg);
      bg.connect(ctx.destination);
      bg.gain.setValueAtTime(0.15, bellTime);
      bg.gain.exponentialRampToValueAtTime(0.001, bellTime + 0.4);
      bell.start(bellTime);
      bell.stop(bellTime + 0.45);
    },

    // Dramatic horn + fanfare - god-tier announcement
    omok_god(ctx, t) {
      const reverb = createReverb(ctx, 2.0, 2.0);
      const reverbGain = mkGain(ctx, 0.25);
      reverb.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      // Brass-like horn: sawtooth through lowpass filter
      const hornNotes = [
        { freq: 220, start: 0, dur: 0.25 },
        { freq: 220, start: 0.28, dur: 0.25 },
        { freq: 330, start: 0.56, dur: 0.15 },
        { freq: 440, start: 0.74, dur: 0.8 },
      ];

      hornNotes.forEach((note) => {
        const horn = mkOsc(ctx, 'sawtooth', note.freq);
        const hg = mkGain(ctx, 0);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = note.freq * 3;
        lp.Q.value = 1;
        horn.connect(lp);
        lp.connect(hg);
        hg.connect(ctx.destination);
        hg.connect(reverb);
        const onset = t + note.start;
        hg.gain.setValueAtTime(0.001, onset);
        hg.gain.linearRampToValueAtTime(0.1, onset + 0.03);
        hg.gain.setValueAtTime(0.1, onset + note.dur * 0.7);
        hg.gain.exponentialRampToValueAtTime(0.001, onset + note.dur);
        horn.start(onset);
        horn.stop(onset + note.dur + 0.05);
      });

      // Power chord underneath the sustained note
      const chordStart = t + 0.74;
      [440, 554, 660].forEach((freq) => {
        const o = mkOsc(ctx, 'triangle', freq);
        const g = mkGain(ctx, 0);
        o.connect(g);
        g.connect(reverb);
        g.gain.setValueAtTime(0.001, chordStart);
        g.gain.linearRampToValueAtTime(0.06, chordStart + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.9);
        o.start(chordStart);
        o.stop(chordStart + 0.95);
      });

      // Impact hit at the very beginning
      const impact = createNoise(ctx, 0.08);
      const ig = mkGain(ctx, 0);
      impact.connect(ig);
      ig.connect(ctx.destination);
      ig.gain.setValueAtTime(0.2, t);
      ig.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      impact.start(t);
      impact.stop(t + 0.08);
    },
  };

  // Default taunt fallback: simple up-down sweep
  function defaultTaunt(ctx, t) {
    const o = mkOsc(ctx, 'square', 300);
    const g = mkGain(ctx, 0);
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.start(t);
    o.stop(t + 0.4);
  }

  function playTaunt(effectKey) {
    if (!enabled) return;
    const ctx = getCtx();
    const t = ctx.currentTime;
    const fn = tauntEffects[effectKey] || defaultTaunt;
    fn(ctx, t);
  }

  // ─── 5. playImpact: escalating stone placement significance ────────

  function playImpact(level = 1) {
    if (!enabled) return;
    const ctx = getCtx();
    const t = ctx.currentTime;

    if (level <= 1) {
      // Level 1: Normal stone - subtle clean click
      const o = mkOsc(ctx, 'sine', 600);
      const g = mkGain(ctx, 0);
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.05);
      o.start(t);
      o.stop(t + 0.07);
    }

    else if (level === 2) {
      // Level 2: 3 in a row - resonant with harmonic overtone
      const o1 = mkOsc(ctx, 'sine', 500);
      const g1 = mkGain(ctx, 0);
      o1.connect(g1);
      g1.connect(ctx.destination);
      g1.gain.setValueAtTime(0.18, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o1.frequency.exponentialRampToValueAtTime(350, t + 0.12);
      o1.start(t);
      o1.stop(t + 0.16);

      // Harmonic overtone
      const o2 = mkOsc(ctx, 'sine', 1000);
      const g2 = mkGain(ctx, 0);
      o2.connect(g2);
      g2.connect(ctx.destination);
      g2.gain.setValueAtTime(0.06, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o2.start(t);
      o2.stop(t + 0.12);

      // Subtle body
      const body = mkOsc(ctx, 'triangle', 200);
      const bg = mkGain(ctx, 0);
      body.connect(bg);
      bg.connect(ctx.destination);
      bg.gain.setValueAtTime(0.08, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      body.start(t);
      body.stop(t + 0.12);
    }

    else if (level === 3) {
      // Level 3: 4 in a row - building tension with dissonant edge
      const reverb = createReverb(ctx, 0.8, 2.0);
      const reverbGain = mkGain(ctx, 0.15);
      reverb.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      // Main tone with rising pitch (tension building)
      const o1 = mkOsc(ctx, 'triangle', 400);
      const g1 = mkGain(ctx, 0);
      o1.connect(g1);
      g1.connect(ctx.destination);
      g1.connect(reverb);
      g1.gain.setValueAtTime(0.2, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o1.frequency.setValueAtTime(400, t);
      o1.frequency.linearRampToValueAtTime(600, t + 0.25);
      o1.start(t);
      o1.stop(t + 0.32);

      // Dissonant tritone layer for unease
      const o2 = mkOsc(ctx, 'sine', 567);
      const g2 = mkGain(ctx, 0);
      o2.connect(g2);
      g2.connect(ctx.destination);
      g2.connect(reverb);
      g2.gain.setValueAtTime(0.08, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o2.frequency.linearRampToValueAtTime(850, t + 0.2);
      o2.start(t);
      o2.stop(t + 0.27);

      // Attack transient
      const noise = createNoise(ctx, 0.03);
      const ng = mkGain(ctx, 0);
      noise.connect(ng);
      ng.connect(ctx.destination);
      ng.gain.setValueAtTime(0.15, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
      noise.start(t);
      noise.stop(t + 0.03);

      // Sub rumble for weight
      const sub = mkOsc(ctx, 'sine', 80);
      const sg = mkGain(ctx, 0);
      sub.connect(sg);
      sg.connect(ctx.destination);
      sg.gain.setValueAtTime(0.12, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      sub.start(t);
      sub.stop(t + 0.22);
    }

    else {
      // Level 4: Winning stone - massive dramatic impact with reverb tail
      const reverb = createReverb(ctx, 2.5, 2.0);
      const reverbGain = mkGain(ctx, 0.3);
      reverb.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      // Massive noise transient
      const noise = createNoise(ctx, 0.08);
      const ng = mkGain(ctx, 0);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2000;
      bp.Q.value = 0.8;
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(ctx.destination);
      ng.connect(reverb);
      ng.gain.setValueAtTime(0.3, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      noise.start(t);
      noise.stop(t + 0.08);

      // Deep sub boom with pitch drop
      const sub = mkOsc(ctx, 'sine', 80);
      const sg = mkGain(ctx, 0);
      sub.connect(sg);
      sg.connect(ctx.destination);
      sg.gain.setValueAtTime(0.3, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      sub.frequency.exponentialRampToValueAtTime(35, t + 0.4);
      sub.start(t);
      sub.stop(t + 0.55);

      // Power chord swell with opening/closing filter
      [220, 330, 440, 550, 660].forEach((freq) => {
        const o = mkOsc(ctx, 'sawtooth', freq);
        const g = mkGain(ctx, 0);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = freq * 2;
        lp.Q.value = 1.5;
        o.connect(lp);
        lp.connect(g);
        g.connect(ctx.destination);
        g.connect(reverb);
        g.gain.setValueAtTime(0.001, t + 0.02);
        g.gain.linearRampToValueAtTime(0.07, t + 0.08);
        g.gain.setValueAtTime(0.07, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        lp.frequency.setValueAtTime(freq, t);
        lp.frequency.linearRampToValueAtTime(freq * 4, t + 0.3);
        lp.frequency.exponentialRampToValueAtTime(freq, t + 1.0);
        o.start(t + 0.02);
        o.stop(t + 1.25);
      });

      // Shimmer sparkles trailing the impact
      for (let i = 0; i < 5; i++) {
        const sparkle = mkOsc(ctx, 'sine', 1500 + i * 500);
        const spG = mkGain(ctx, 0);
        sparkle.connect(spG);
        spG.connect(reverb);
        const onset = t + 0.15 + i * 0.08;
        spG.gain.setValueAtTime(0.04, onset);
        spG.gain.exponentialRampToValueAtTime(0.001, onset + 0.3);
        sparkle.start(onset);
        sparkle.stop(onset + 0.35);
      }
    }
  }

  return { playStone, playWin, playLose, playTaunt, playImpact, toggle, isEnabled, setEnabled };
})();
