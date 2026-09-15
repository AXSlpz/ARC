let audioCtx: AudioContext | null = null;
let initialized = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function initNotificationSounds(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const unlock = () => {
    void getCtx().resume();
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
    document.removeEventListener("touchstart", unlock);
  };

  document.addEventListener("click", unlock);
  document.addEventListener("keydown", unlock);
  document.addEventListener("touchstart", unlock, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void getCtx().resume();
    }
  });
}

function playTone(
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine"
): void {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  } catch {}
}

export function playMessageNotification(): void {
  playTone(880, 0.12, 0.12);
  setTimeout(() => playTone(1100, 0.1, 0.08), 100);
}

export function playAdvisorRequestNotification(): void {
  const pattern = [
    { freq: 660, delay: 0, dur: 0.2, vol: 0.22 },
    { freq: 880, delay: 220, dur: 0.2, vol: 0.25 },
    { freq: 1100, delay: 440, dur: 0.35, vol: 0.3 },
    { freq: 880, delay: 820, dur: 0.25, vol: 0.22 },
    { freq: 660, delay: 1100, dur: 0.4, vol: 0.2 },
  ];

  for (const step of pattern) {
    setTimeout(
      () => playTone(step.freq, step.dur, step.vol, "triangle"),
      step.delay
    );
  }
}
