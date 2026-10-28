const CUES = {
  menu: [440, 660, 0.08], cargo: [330, 110, 0.25], brake: [180, 70, 0.12],
  pursuit: [600, 900, 0.22], impact: [90, 30, 0.16],
  delivery: [523, 1046, 0.4], failure: [220, 55, 0.5],
  countdown: [880, 880, 0.1], go: [1320, 1760, 0.35],
  beaten: [660, 990, 0.18], firstOut: [523, 1568, 0.5],
  pedestrianHit: [140, 45, 0.18]
};

const RECORDINGS = {
  idle: 'engine-idle.mp3', drive: 'engine-drive.mp3', siren: 'police-wail.mp3',
  impact: 'body-impact.mp3', cargo: 'cargo-thud.mp3', music: 'township-drive.mp3'
};

/** Local recordings with one context, bounded effects and a procedural fallback. */
export class GameAudio {
  constructor(createContext = () => {
    const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    return AudioContext ? new AudioContext() : null;
  }) {
    this.createContext = createContext;
    this.volume = 0.6;
    this.active = false;
    this.voices = new Set();
    this.wasBraking = false;
    this.unlocking = null;
    this.musicStep = 0;
    this.nextBeat = 0;
    this.buffers = {};
    this.loops = {};
    this.musicOffset = 0;
    this.previousSpeed = 0;
  }

  async unlock() {
    if (this.unlocking) return this.unlocking;
    this.unlocking = this.activate();
    try { return await this.unlocking; } finally { this.unlocking = null; }
  }

  async activate() {
    try {
      if (!this.context) {
        this.context = this.createContext();
        if (!this.context) return false;
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        if (this.context.createDynamicsCompressor) {
          this.compressor = this.context.createDynamicsCompressor();
          this.compressor.threshold.value = -12;
          this.compressor.knee.value = 12;
          this.compressor.ratio.value = 8;
          this.compressor.attack.value = 0.003;
          this.compressor.release.value = 0.16;
          this.master.connect(this.compressor).connect(this.context.destination);
        } else this.master.connect(this.context.destination);
        this.engine = this.context.createOscillator();
        this.engine.type = 'triangle';
        this.engineGain = this.context.createGain();
        this.engineGain.gain.value = 0;
        this.engine.connect(this.engineGain).connect(this.master);
        this.engine.start();
        this.wind = this.context.createOscillator();
        this.wind.type = 'sine';
        this.wind.frequency.value = 180;
        this.windGain = this.context.createGain();
        this.windGain.gain.value = 0;
        this.wind.connect(this.windGain).connect(this.master);
        this.wind.start();
        this.siren = this.context.createOscillator();
        this.siren.type = 'sine';
        this.sirenGain = this.context.createGain();
        this.sirenGain.gain.value = 0;
        this.siren.connect(this.sirenGain).connect(this.master);
        this.siren.start();
        this.musicGain = this.context.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.master);
      }
      // Resume inside the gesture, before fetching or decoding any recordings.
      if (this.context.state !== 'running') await this.context.resume();
      this.loadRecordings();
      return this.context.state === 'running';
    } catch { return false; }
  }

  loadRecordings() {
    if (this.loading || !this.context.createBufferSource || !this.context.decodeAudioData) return;
    const context = this.context;
    const base = import.meta.env?.BASE_URL ?? './';
    this.loadController = new AbortController();
    this.loading = Promise.all(Object.entries(RECORDINGS).map(async ([name, file]) => {
      try {
        const response = await fetch(`${base}assets/audio/${file}`, { signal: this.loadController.signal });
        if (!response.ok) throw Error(`Audio HTTP ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (this.context === context) this.buffers[name] = buffer;
      } catch {
        // Keep the original sound available if a browser cannot load a recording.
      }
    }));
  }

  startLoop(name, gain, fallback) {
    if (!this.buffers[name] || this.loops[name]) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffers[name];
    source.loop = true;
    source.connect(gain);
    source.start();
    this.loops[name] = source;
    // Replace each fallback once, even after repeated pauses and level changes.
    fallback.disconnect();
    fallback.stop();
  }

  startMusic(now) {
    if (!this.buffers.music || this.music) return;
    if (this.fadingMusic) {
      this.fadingMusic.stop(now);
      this.fadingMusic.disconnect();
      this.fadingMusic = null;
    }
    const source = this.context.createBufferSource();
    source.buffer = this.buffers.music;
    source.loop = true;
    source.connect(this.musicGain);
    source.start(now, this.musicOffset % source.buffer.duration);
    this.music = source;
    this.musicStarted = now;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(0, now);
    this.musicGain.gain.setTargetAtTime(0.24, now, 0.12);
  }

  stopMusic() {
    if (!this.music) return;
    const now = this.context.currentTime;
    this.musicOffset = (this.musicOffset + now - this.musicStarted) % this.music.buffer.duration;
    this.musicGain.gain.setTargetAtTime(0, now, 0.02);
    const source = this.music;
    this.fadingMusic = source;
    source.onended = () => {
      source.disconnect();
      if (this.fadingMusic === source) this.fadingMusic = null;
    };
    source.stop(now + 0.08);
    this.music = null;
  }

  setVolume(value) {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.6;
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
  }

  setActive(active) {
    if (this.active === active && (active || this.voices.size === 0)) return;
    this.active = active;
    this.nextBeat = 0;
    if (!active) {
      this.wasBraking = false;
      this.previousSpeed = 0;
      for (const gain of [this.engineGain, this.windGain, this.sirenGain]) {
        gain?.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
      }
      for (const voice of this.voices) voice.stop();
      this.voices.clear();
      this.stopMusic();
    }
  }

  cue(name, frequency = null, level = 0.16) {
    const cue = CUES[name];
    if (!cue || this.context?.state !== 'running' || this.volume === 0 || this.voices.size >= 8) return false;
    if (frequency === null && this.buffers[name]) return this.playRecording(name, level);
    const [start, end, duration] = frequency === null ? cue : [frequency, frequency, 0.18];
    const now = this.context.currentTime;
    const voice = this.context.createOscillator();
    const gain = this.context.createGain();
    voice.type = ['impact', 'pedestrianHit'].includes(name) ? 'sawtooth' : 'sine';
    voice.frequency.setValueAtTime(start, now);
    voice.frequency.exponentialRampToValueAtTime(end, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    voice.connect(gain).connect(this.master);
    this.voices.add(voice);
    voice.onended = () => { this.voices.delete(voice); voice.disconnect(); gain.disconnect(); };
    voice.start(now);
    voice.stop(now + duration);
    return true;
  }

  playRecording(name, level) {
    const now = this.context.currentTime;
    const voice = this.context.createBufferSource();
    voice.buffer = this.buffers[name];
    voice.playbackRate.value = 0.95 + Math.random() * 0.1;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(level * 1.8 / Math.sqrt(1 + this.voices.size * 0.5), now);
    voice.connect(gain).connect(this.master);
    this.voices.add(voice);
    voice.onended = () => { this.voices.delete(voice); voice.disconnect(); gain.disconnect(); };
    voice.start(now);
    return true;
  }

  update(dt, speed, pursuit, braking) {
    if (!this.active || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    const amount = Math.min(1, Math.abs(speed) / 30);
    this.startLoop('idle', this.engineGain, this.engine);
    this.startLoop('drive', this.windGain, this.wind);
    this.startLoop('siren', this.sirenGain, this.siren);
    this.engine.frequency.setTargetAtTime(45 + amount * 110, now, 0.08);
    const acceleration = Math.max(-1, Math.min(1,
      (Math.abs(speed) - this.previousSpeed) / Math.max(0.016, dt) / 6));
    this.previousSpeed = Math.abs(speed);
    const load = braking ? 0 : Math.max(0, acceleration);
    const blend = Math.min(1, amount * 0.85 + load * 0.15);
    this.engineGain.gain.setTargetAtTime(this.loops.idle
      ? 0.28 * Math.cos(blend * Math.PI / 2)
      : braking ? 0.025 : 0.035 + amount * 0.06, now, 0.12);
    this.windGain.gain.setTargetAtTime(this.loops.drive
      ? (braking ? 0.14 : 0.27) * Math.sin(blend * Math.PI / 2)
      : amount * 0.015, now, 0.14);
    this.loops.idle?.playbackRate.setTargetAtTime(0.9 + amount * 0.32 + load * 0.04, now, 0.16);
    this.loops.drive?.playbackRate.setTargetAtTime(0.8 + amount * 0.46 + load * 0.05, now, 0.18);
    const pursuing = ['reacting', 'chasing', 'catching'].includes(pursuit);
    this.siren.frequency.setTargetAtTime(725 + Math.sin(now * 7) * 225, now, 0.03);
    this.sirenGain.gain.setTargetAtTime(pursuing ? (this.loops.siren ? 0.24 : 0.045) : 0, now, 0.08);
    // The recording replaces the original score; retain its bounded fallback.
    if (this.buffers.music) this.startMusic(now);
    else if (now >= this.nextBeat) {
      const notes = [130.81, 0, 196, 0, 155.56, 196, 0, 174.61,
        130.81, 0, 233.08, 196, 0, 174.61, 155.56, 0];
      const note = notes[this.musicStep++ % notes.length];
      if (note) this.cue('menu', note, 0.045);
      if (this.musicStep % 4 === 1) this.cue('impact', 65.41, 0.055);
      this.nextBeat = now + 60 / 112 / 2;
    }
    if (braking && !this.wasBraking && Math.abs(speed) > 4) this.cue('brake');
    this.wasBraking = Boolean(braking);
  }

  dispose() {
    this.setActive(false);
    this.loadController?.abort();
    this.loadController = null;
    this.fadingMusic?.stop();
    this.fadingMusic?.disconnect();
    this.fadingMusic = null;
    for (const source of Object.values(this.loops)) { source.stop(); source.disconnect(); }
    this.loops = {};
    this.buffers = {};
    this.loading = null;
    this.musicOffset = 0;
    this.engine?.stop();
    this.wind?.stop();
    this.siren?.stop();
    this.engine?.disconnect();
    this.wind?.disconnect();
    this.siren?.disconnect();
    this.sirenGain?.disconnect();
    this.engineGain?.disconnect();
    this.windGain?.disconnect();
    this.musicGain?.disconnect();
    this.master?.disconnect();
    this.compressor?.disconnect();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
