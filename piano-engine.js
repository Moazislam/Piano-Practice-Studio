'use strict';

class PianoEngine {
  constructor(sampleData, Context = window.AudioContext || window.webkitAudioContext) {
    this.sampleData = sampleData;
    this.Context = Context;
    this.buffers = new Map();
    this.voices = new Set();
    this.pedal = false;
    this.ready = false;
    this.volume = .65;
    this.room = .18;
    this.tone = .6;
    this.maxVoices = 64;
  }

  async init(onProgress = () => {}) {
    if (this.loading) {
      if (this.context?.state === 'suspended') await this.context.resume();
      return this.loading;
    }
    if (!this.Context) throw new Error('This browser does not support Web Audio. Try a current version of Chrome, Edge, Firefox, or Safari.');
    const ctx = this.context = new this.Context({latencyHint: 'interactive'});
    // Resume during the original user gesture, before waiting for decodes.
    const resumed = ctx.resume();
    this.input = ctx.createGain();
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = 'highpass'; this.highpass.frequency.value = 30; this.highpass.Q.value = .5;
    this.input.connect(this.highpass);
    this.dry = ctx.createGain(); this.dry.gain.value = .92;
    this.highpass.connect(this.dry);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.makeImpulse();
    this.wet = ctx.createGain(); this.wet.gain.value = this.room * .65;
    this.highpass.connect(this.reverb); this.reverb.connect(this.wet);
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    this.dry.connect(this.master); this.wet.connect(this.master);
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -9; this.compressor.knee.value = 9;
    this.compressor.ratio.value = 5; this.compressor.attack.value = .003; this.compressor.release.value = .18;
    this.limiter = ctx.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) curve[i] = .97 * Math.tanh((i / (curve.length - 1) * 2 - 1) / .97);
    this.limiter.curve = curve; this.limiter.oversample = '2x';
    this.master.connect(this.compressor); this.compressor.connect(this.limiter); this.limiter.connect(ctx.destination);
    this.loading = (async () => {
      await resumed;
      const entries = Object.entries(this.sampleData);
      let done = 0;
      // Bound decoder concurrency to avoid a startup CPU spike on phones.
      for (let i = 0; i < entries.length; i += 3) {
        await Promise.all(entries.slice(i, i + 3).map(async ([midi, encoded]) => {
          const raw = atob(encoded), bytes = new Uint8Array(raw.length);
          for (let n = 0; n < raw.length; n++) bytes[n] = raw.charCodeAt(n);
          const decoded = await ctx.decodeAudioData(bytes.buffer);
          this.buffers.set(Number(midi), this.trimLeadingSilence(decoded));
          onProgress(++done, entries.length);
        }));
      }
      this.sampleData = null;
      this.ready = true;
      return this;
    })();
    return this.loading;
  }

  trimLeadingSilence(buffer) {
    // MP3 encoder padding is audible as latency. Trim only near-silent leading frames,
    // leaving 1 ms before the attack and preserving the recorded stereo channels.
    const cap = Math.min(buffer.length, Math.floor(buffer.sampleRate * .15));
    let onset = 0;
    for (; onset < cap; onset++) {
      let peak = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) peak = Math.max(peak, Math.abs(buffer.getChannelData(c)[onset]));
      if (peak > .0005) break;
    }
    return {buffer, offset: Math.max(0, onset / buffer.sampleRate - .001)};
  }

  makeImpulse() {
    const ctx = this.context, length = Math.floor(ctx.sampleRate * 1.6);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    let seed = 93821;
    const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296 * 2 - 1);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch); let smooth = 0;
      for (let i = 0; i < length; i++) {
        const t = i / ctx.sampleRate;
        smooth = .65 * smooth + .35 * random();
        data[i] = t < .018 ? 0 : smooth * Math.exp(-t * 4.8);
      }
    }
    return buffer;
  }

  setVolume(value) {this.volume = value; if (this.master) this.master.gain.setTargetAtTime(value, this.context.currentTime, .02);}
  setRoom(value) {this.room = value; if (this.wet) this.wet.gain.setTargetAtTime(value * .65, this.context.currentTime, .04);}
  setTone(value) {this.tone = value;}

  noteOn(midi, velocity = .72, time = this.context?.currentTime) {
    if (!this.ready) return null;
    const ctx = this.context;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // Each strike owns its voice: a second strike never replaces a held key's handle.
    const ringing = [...this.voices].filter(v => v.midi === midi && !v.held && !v.releasing);
    if (ringing.length >= 4) this.release(ringing[0], .08);
    if (this.voices.size >= this.maxVoices) {
      const candidate = [...this.voices].find(v => !v.held) || this.voices.values().next().value;
      this.dispose(candidate);
    }
    const root = [...this.buffers.keys()].reduce((a,b) => Math.abs(a-midi) <= Math.abs(b-midi) ? a : b);
    const sample = this.buffers.get(root), source = ctx.createBufferSource();
    source.buffer = sample.buffer; source.playbackRate.value = Math.pow(2, (midi-root) / 12);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = .35;
    filter.frequency.value = Math.min(ctx.sampleRate * .45, 1800 + 7000 * this.tone + 5500 * velocity);
    const gain = ctx.createGain(), now = Math.max(ctx.currentTime, time ?? ctx.currentTime);
    const amplitude = .72 * Math.pow(Math.max(.05, Math.min(1,velocity)), 1.65);
    gain.gain.setValueAtTime(0,now); gain.gain.linearRampToValueAtTime(amplitude,now+.003);
    source.connect(filter); filter.connect(gain); gain.connect(this.input);
    const voice = {midi, source, filter, gain, held:true, releasing:false, ended:false, amplitude, started:now};
    this.voices.add(voice);
    source.onended = () => this.dispose(voice, false);
    source.start(now, sample.offset);
    return voice;
  }

  noteOff(voice) {if (!voice || voice.ended) return; voice.held = false; if (!this.pedal) this.release(voice);}
  setPedal(down) {
    this.pedal = down;
    if (!down) for (const voice of this.voices) if (!voice.held) this.release(voice);
  }
  release(voice, duration, time = this.context.currentTime) {
    if (!voice || voice.ended || (voice.releasing && duration === undefined)) return;
    voice.releasing = true;
    const now = Math.max(this.context.currentTime, time);
    // Let even a quick tap speak before the damper begins its gradual decay.
    // Ordinary releases have a long, curved tail; panic/voice stealing stay fast.
    const releaseAt = duration === undefined ? Math.max(now, voice.started + .065) : now;
    const decay = duration ?? (1.4 + Math.max(0, 72-voice.midi) * .018);
    const param = voice.gain.gain;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(releaseAt);
    else {
      const previous = voice.releaseEnvelope;
      const level = previous && releaseAt >= previous.time
        ? previous.level * Math.exp(-(releaseAt-previous.time)/previous.constant)
        : voice.amplitude * Math.min(1, Math.max(0,(releaseAt-voice.started)/.003));
      param.cancelScheduledValues(releaseAt); param.setValueAtTime(level,releaseAt);
    }
    const previous = voice.releaseEnvelope;
    const level = previous && releaseAt >= previous.time
      ? previous.level * Math.exp(-(releaseAt-previous.time)/previous.constant)
      : voice.amplitude * Math.min(1, Math.max(0,(releaseAt-voice.started)/.003));
    voice.releaseEnvelope = {time:releaseAt,level,constant:decay/6};
    // Approach silence exponentially, then remove only the inaudible final tail.
    param.setTargetAtTime(0,releaseAt,decay/6);
    param.setValueAtTime(0,releaseAt+decay);
    voice.source.stop(releaseAt+decay+.025);
  }
  dispose(voice, stop = true) {
    if (!voice || voice.ended) return;
    voice.ended = true; this.voices.delete(voice);
    if (stop) {try {voice.source.stop();} catch {}}
    voice.source.disconnect(); voice.filter.disconnect(); voice.gain.disconnect();
    this.onVoicesChanged?.();
  }
  allOff() {
    this.pedal = false;
    for (const voice of this.voices) {voice.held=false; this.release(voice,.045);}
    // Clear the old room tail as well as dry voices.
    if (this.reverb) {const impulse=this.reverb.buffer; this.reverb.buffer=null; this.reverb.buffer=impulse;}
  }
}

class PianoMetronome {
  constructor(engine, onBeat = () => {}, timers = globalThis) {
    this.engine = engine; this.onBeat = onBeat; this.timers = timers;
    this.bpm = 80; this.running = false; this.sources = new Set(); this.visualTimers = new Set();
  }
  start() {
    if (this.running || !this.engine.ready) return;
    this.running = true; this.beat = 0; this.next = this.engine.context.currentTime + .04;
    this.schedule(); this.timer = this.timers.setInterval(() => this.schedule(),25);
  }
  schedule() {
    const ctx = this.engine.context;
    if (!this.running) return;
    // Skip obsolete beats after stalls instead of bursting several clicks at once.
    if (this.next < ctx.currentTime) this.next = ctx.currentTime+.025;
    while (this.next < ctx.currentTime+.1) {
      this.click(this.next, this.beat);
      this.next += 60 / this.bpm; this.beat = (this.beat+1)%4;
    }
  }
  click(time, beat) {
    const ctx = this.engine.context, source=ctx.createOscillator(), gain=ctx.createGain();
    source.frequency.value=beat===0?1450:1050;
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(beat===0?.22:.13,time+.002);
    gain.gain.exponentialRampToValueAtTime(.0001,time+.045);
    source.connect(gain);gain.connect(this.engine.master);source.start(time);source.stop(time+.05);
    this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();};
    const delay=(time-ctx.currentTime+(ctx.outputLatency||ctx.baseLatency||0))*1000;
    const id=this.timers.setTimeout(()=>{this.visualTimers.delete(id);if(this.running)this.onBeat(beat);},Math.max(0,delay));
    this.visualTimers.add(id);
  }
  stop() {
    this.running=false;this.timers.clearInterval(this.timer);
    for(const id of this.visualTimers)this.timers.clearTimeout(id);this.visualTimers.clear();
    for(const source of this.sources){try{source.stop();}catch{}}
    this.sources.clear();this.onBeat(-1);
  }
  setTempo(value) {
    this.bpm=Math.max(30,Math.min(240,Number(value)||80));
    if(this.running){this.stop();this.start();}
    return this.bpm;
  }
}
if (typeof module !== 'undefined') module.exports = {PianoEngine,PianoMetronome};
