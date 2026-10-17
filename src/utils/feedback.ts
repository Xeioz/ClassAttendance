let audio: AudioContext | undefined;
export async function enableAudio(): Promise<void> {
  audio ??= new AudioContext();
  await audio.resume();
}
export function feedback(success: boolean, sound: boolean): void {
  try {
    if (sound && audio?.state === 'running') {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = success ? 'sine' : 'sawtooth';
      oscillator.frequency.value = success ? 880 : 220;
      const duration = success ? 0.12 : 0.25;
      gain.gain.setValueAtTime(0.07, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
    if (success) navigator.vibrate?.(100);
  } catch {
    /* Feedback must never change the outcome of a committed attendance write. */
  }
}
