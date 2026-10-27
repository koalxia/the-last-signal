import * as THREE from 'three';

export class AudioSystem {
  constructor(scene) {
    this.scene = scene;
    this.listener = new THREE.AudioListener();
    this.scene.add(this.listener);

    this.sounds = [];
    this.enabled = true;

    this.music = null;
    this.ambience = null;

    // Runtime
    this._ctxReady = false;
    this._started = false;
  }

  init() {
    // Create fallback WebAudio-only ambiance using oscillators if no files are present.
    // Also attach positional “wind” and “buzz” with graceful degradation.
    this._setupFallbackAudio();
  }

  _setupFallbackAudio() {
    const listener = this.listener;

    const master = new GainNodeSafe();
    const musicGain = new GainNodeSafe();
    const ambGain = new GainNodeSafe();
    master.gain.value = 0.9;
    ambGain.gain.value = 0.65;
    musicGain.gain.value = 0.45;

    master.connectToDestination();
    musicGain.connectToDestination();
    ambGain.connectToDestination();

    this.master = master;
    this.musicGain = musicGain;
    this.ambGain = ambGain;

    // Create sources lazily on user gesture (autoplay rules)
    this.musicOsc = {
      osc: null,
      lfo: null
    };
    this.amb = {
      windOsc: null,
      buzzOsc: null,
      noiseNode: null,
      started: false
    };

    this._createSuspenseNoise();
  }

  _createSuspenseNoise() {
    // Create a lightweight filtered noise buffer
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    // Keep separate context: many browsers allow only one; but this is best-effort fallback.
    // We instead create on demand in _ensureStarted to avoid double contexts.

    // We'll not store ctx here; handled in ensureStarted.
  }

  _ensureStarted() {
    if (this._started) return;
    this._started = true;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.audioCtx = new AudioCtx();
    const ctx = this.audioCtx;

    // Music: detuned drone with slow tremolo
    const musicOsc1 = ctx.createOscillator();
    musicOsc1.type = 'sawtooth';
    musicOsc1.frequency.value = 41;

    const musicOsc2 = ctx.createOscillator();
    musicOsc2.type = 'triangle';
    musicOsc2.frequency.value = 55;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;

    const musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 340;
    musicFilter.Q.value = 0.6;

    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.12;

    lfo.connect(lfoGain);
    lfoGain.connect(musicGain.gain);

    musicOsc1.connect(musicFilter);
    musicOsc2.connect(musicFilter);
    musicFilter.connect(musicGain);
    musicGain.connect(ctx.destination);

    musicOsc1.start();
    musicOsc2.start();
    lfo.start();

    this.musicOsc = { musicOsc1, musicOsc2, lfo, musicGain };

    // Ambience wind/buzz: noise-like via oscillators + filter
    const wind = ctx.createOscillator();
    wind.type = 'sine';
    wind.frequency.value = 78;

    const buzz = ctx.createOscillator();
    buzz.type = 'square';
    buzz.frequency.value = 24;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.8;

    const ambGain = ctx.createGain();
    ambGain.gain.value = 0.08;

    // Tremolo
    const ambLfo = ctx.createOscillator();
    ambLfo.type = 'sine';
    ambLfo.frequency.value = 0.22;

    const ambLfoGain = ctx.createGain();
    ambLfoGain.gain.value = 0.25;
    ambLfo.connect(ambLfoGain);
    ambLfoGain.connect(ambGain.gain);

    wind.connect(filter);
    buzz.connect(filter);
    filter.connect(ambGain);
    ambGain.connect(ctx.destination);

    wind.start();
    buzz.start();
    ambLfo.start();

    this.amb = { wind, buzz, ambGain, ambLfo, filter, ctx };

    this._ctxReady = true;
  }

  reset() {
    // Keep fallback audio running; stop/start as needed.
  }

  applySave() {}

  resumeAmbience() {
    this._ensureStarted();
    if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }

  pauseAmbience() {
    if (this.audioCtx && this.audioCtx.state === 'running') this.audioCtx.suspend();
  }

  stopCombat() {
    if (!this._ctxReady) return;
    // reduce music/amb
    if (this.musicOsc?.musicGain) this.musicOsc.musicGain.gain.value = 0.06;
    if (this.amb?.ambGain) this.amb.ambGain.gain.value = 0.03;
  }

  update(player, monster, dt) {
    if (!this._started) return;

    const d = monster.getDistanceToPlayer(player.position);

    // Adjust music intensity with proximity
    const danger = 1 - Math.min(1, d / 12);
    const musicTarget = 0.05 + danger * 0.18;
    const ambTarget = 0.03 + danger * 0.10;

    if (this.musicOsc?.musicGain) this.musicOsc.musicGain.gain.value += (musicTarget - this.musicOsc.musicGain.gain.value) * (1 - Math.exp(-dt*3));
    if (this.amb?.ambGain) this.amb.ambGain.gain.value += (ambTarget - this.amb.ambGain.gain.value) * (1 - Math.exp(-dt*3));

    // Slight filter change
    if (this.amb?.filter) {
      const f = 450 + danger * 820;
      this.amb.filter.frequency.value += (f - this.amb.filter.frequency.value) * (1 - Math.exp(-dt*2));
    }
  }
}

// Tiny safe gain/destination wrapper (optional use, not central)
class GainNodeSafe {
  constructor() {
    this.gain = { value: 1 };
  }
  connectToDestination() {}
}
