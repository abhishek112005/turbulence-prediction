// Audio Alert Service — sound effects + TTS for all connected devices
//
// Standard level announcements use pre-generated MP3 files (en-GB-RyanNeural)
// so the voice is IDENTICAL on every device regardless of what TTS is installed.
// Run generate_pa_audio.py once to create: public/audio/pa_calm/light/moderate/severe.mp3
// Custom pilot text falls back to the best available device TTS voice.

const PA_FILES = {
  0: "/audio/pa_calm.mp3",
  1: "/audio/pa_light.mp3",
  2: "/audio/pa_moderate.mp3",
  3: "/audio/pa_severe.mp3",
};

class AudioAlertService {
  constructor() {
    this.audioContext   = null;
    this.isSirenPlaying = false;
    this.ttsEnabled     = true;
    this._selectedVoice = null;
    this._voiceReady    = false;
    this._keepAlive     = null;
    this._paElements    = {};    // pre-loaded <audio> elements
    this._filesReady    = false;

    this._loadVoices();
    this._preloadPAFiles();
  }

  // ── Pre-load MP3 files ─────────────────────────────────────────────────────
  _preloadPAFiles() {
    if (typeof window === "undefined") return;
    for (const [level, src] of Object.entries(PA_FILES)) {
      const el = new Audio(src);
      el.preload = "auto";
      el.volume  = 1.0;
      this._paElements[level] = el;
    }
    this._filesReady = true;
  }

  // Play pre-generated MP3 for a given level (0-3).
  // Returns a Promise that resolves true on success, false if file missing/error.
  _playPAFile(level) {
    return new Promise((resolve) => {
      const el = this._paElements[Math.min(level, 3)];
      if (!el) { resolve(false); return; }

      el.pause();
      el.currentTime = 0;

      const onEnd   = () => { cleanup(); resolve(true); };
      const onError = () => { cleanup(); resolve(false); };

      const cleanup = () => {
        el.removeEventListener("ended", onEnd);
        el.removeEventListener("error", onError);
      };

      el.addEventListener("ended", onEnd, { once: true });
      el.addEventListener("error", onError, { once: true });

      el.play().catch(() => { cleanup(); resolve(false); });
    });
  }

  // ── Voice loading (for fallback TTS) ──────────────────────────────────────
  _loadVoices() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const attempt = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) {
        this._selectedVoice = this._pickVoice(voices);
        this._voiceReady    = true;
      }
    };
    attempt();
    window.speechSynthesis.addEventListener("voiceschanged", attempt);
  }

  _pickVoice(voices) {
    const tests = [
      v => v.name === "Google UK English Male",
      v => v.name === "Google US English Male",
      v => /Microsoft David/i.test(v.name),
      v => /Microsoft Mark/i.test(v.name),
      v => v.name === "Daniel",
      v => v.lang === "en-GB" && /male/i.test(v.name),
      v => v.lang === "en-US" && /male/i.test(v.name),
      v => v.lang === "en-GB",
      v => v.lang.startsWith("en"),
    ];
    const en = voices.filter(v => v.lang.startsWith("en"));
    for (const test of tests) {
      const match = en.find(test) ?? voices.find(test);
      if (match) return match;
    }
    return null;
  }

  // ── TTS fallback (Android-safe) ────────────────────────────────────────────
  speak(text) {
    if (!this.ttsEnabled || typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; }

    setTimeout(() => {
      if (!this.ttsEnabled) return;

      if (!this._voiceReady) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) {
          this._selectedVoice = this._pickVoice(voices);
          this._voiceReady    = true;
        }
      }

      const utterance    = new SpeechSynthesisUtterance(text);
      if (this._selectedVoice) utterance.voice = this._selectedVoice;
      utterance.rate   = 0.86;
      utterance.pitch  = 0.88;
      utterance.volume = 1.0;

      // Android Chrome: re-resume every 3s to prevent silent pause mid-sentence
      utterance.onstart = () => {
        this._keepAlive = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(this._keepAlive); this._keepAlive = null;
          } else if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        }, 3000);
      };
      const cleanup = () => {
        if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; }
      };
      utterance.onend   = cleanup;
      utterance.onerror = cleanup;

      window.speechSynthesis.speak(utterance);
    }, 50);
  }

  // ── Airline ding-dong chime ────────────────────────────────────────────────
  // D5 → B4  (587 Hz → 494 Hz) — classic two-tone aircraft PA lead-in
  playDingDong() {
    this.initAudioContext();
    if (!this.audioContext) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const tone = (freq, start, dur) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.55, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.01, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    };

    tone(587.33, now,        0.75);  // D5
    tone(493.88, now + 0.55, 0.80);  // B4
  }

  // ── Main announce method ───────────────────────────────────────────────────
  /**
   * Standard level announcement — plays pre-generated MP3 (same on all devices).
   * Falls back to TTS if the file isn't found.
   *
   * @param {number} level  0=calm  1=light  2=moderate  3=severe
   */
  async announceLevelPA(level) {
    if (!this.ttsEnabled) return;

    const l = Math.min(Math.max(Number(level) || 0, 0), 3);

    // Ding-dong before calm / light announcements (like real airline PA)
    if (l <= 1) this.playDingDong();
    const speechDelay = l <= 1 ? 1350 : 0;

    await new Promise(r => setTimeout(r, speechDelay));
    const ok = await this._playPAFile(l);

    if (!ok) {
      // File not generated yet — fall back to TTS
      const fallbackText = {
        0: "Ladies and gentlemen, we are now cruising through smooth conditions. You are free to move about the cabin.",
        1: "Ladies and gentlemen, this is your cabin crew. We are currently experiencing light turbulence. Please return to your seats and fasten your seatbelts.",
        2: "Ladies and gentlemen, this is your captain speaking. We are encountering moderate turbulence. Please return to your seats and fasten your seatbelts immediately.",
        3: "Attention all passengers. This is an urgent message from your captain. We are experiencing severe turbulence. All passengers must remain seated with seatbelts tightly fastened.",
      };
      this.speak(fallbackText[l]);
    }
  }

  /**
   * Custom / pilot-broadcast announcement — always TTS (dynamic text).
   * Plays ding-dong lead-in for calm / light.
   *
   * @param {string} text
   * @param {number} level
   */
  announceCustomPA(text, level = 0) {
    if (!this.ttsEnabled) return;
    const l = Math.min(Math.max(Number(level) || 0, 0), 3);
    if (l <= 1) {
      this.playDingDong();
      setTimeout(() => this.speak(text), 1350);
    } else {
      this.speak(text);
    }
  }

  // ── Audio context ──────────────────────────────────────────────────────────
  initAudioContext() {
    if (this.audioContext) return this.audioContext;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) this.audioContext = new AudioCtx();
    return this.audioContext;
  }

  async armAudio() {
    const ctx = this.initAudioContext();
    if (ctx && ctx.state === "suspended") {
      try { await ctx.resume(); } catch { return false; }
    }
    if (!this._voiceReady && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) {
        this._selectedVoice = this._pickVoice(voices);
        this._voiceReady    = true;
      }
    }
    return Boolean(ctx || (typeof window !== "undefined" && window.speechSynthesis));
  }

  isReady() {
    return !this.audioContext || this.audioContext.state === "running";
  }

  // ── Chime ──────────────────────────────────────────────────────────────────
  playChime() {
    this.initAudioContext();
    if (!this.audioContext) return;
    const now  = this.audioContext.currentTime;
    const osc  = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.frequency.value = 1046.5; osc.type = "sine";
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.connect(gain); gain.connect(this.audioContext.destination);
    osc.start(now); osc.stop(now + 0.5);
  }

  // ── Buzzer ─────────────────────────────────────────────────────────────────
  playBuzzer(count = 2) {
    this.initAudioContext();
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    for (let i = 0; i < count; i++) {
      const t = now + i * 0.4;
      const osc  = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.frequency.value = i % 2 === 0 ? 800 : 600; osc.type = "square";
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.connect(gain); gain.connect(this.audioContext.destination);
      osc.start(t); osc.stop(t + 0.2);
    }
  }

  // ── Siren ──────────────────────────────────────────────────────────────────
  playSiren(duration = 3) {
    this.initAudioContext();
    if (!this.audioContext || this.isSirenPlaying) return;
    this.isSirenPlaying = true;
    const now  = this.audioContext.currentTime;
    const osc  = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
    osc.frequency.exponentialRampToValueAtTime(600,  now + 0.6);
    osc.frequency.setValueAtTime(600, now + 0.6);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.9);
    osc.frequency.exponentialRampToValueAtTime(600,  now + 1.2);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.setValueAtTime(0.3, now + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    osc.connect(gain); gain.connect(this.audioContext.destination);
    osc.start(now); osc.stop(now + duration);
    setTimeout(() => { this.isSirenPlaying = false; }, duration * 1000);
  }

  startContinuousSiren() {
    this.initAudioContext();
    if (!this.audioContext) return;
    this.stopContinuousSiren();
    this.isSirenPlaying = true;
    const cycle = () => {
      if (!this.isSirenPlaying) return;
      this.playSiren(1.5);
      setTimeout(cycle, 2000);
    };
    cycle();
  }

  stopContinuousSiren() { this.isSirenPlaying = false; }
  setTTSEnabled(enabled) { this.ttsEnabled = enabled; }
}

export const audioAlerts = new AudioAlertService();
