type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};
export interface CameraHandle {
  stop(): Promise<void>;
  torch(on: boolean): Promise<void>;
  hasTorch: boolean;
}

export async function startCamera(
  hostId: string,
  onRead: (value: string) => void,
  onError: (message: string) => void,
  deviceId?: string,
  forceFallback = false,
): Promise<CameraHandle> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new Error(
      'Camera access requires HTTPS or localhost and a supported browser. Use manual check-in.',
    );
  const host = document.getElementById(hostId);
  if (!host) throw new Error('Camera viewport is unavailable.');
  const Native = (globalThis as unknown as { BarcodeDetector?: DetectorConstructor })
    .BarcodeDetector;
  let nativeSupported = false;
  try {
    nativeSupported =
      !forceFallback && Boolean(Native && (await Native.getSupportedFormats()).includes('qr_code'));
  } catch {
    /* Use bundled decoder. */
  }
  if (Native && nativeSupported) {
    let stream: MediaStream | undefined;
    try {
      const detector = new Native({ formats: ['qr_code'] });
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: 'environment' } },
      });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      host.replaceChildren(video);
      await video.play();
      const track = stream.getVideoTracks()[0];
      const hasTorch = Boolean(
        (track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }).torch,
      );
      let stopped = false;
      let timer = 0;
      async function tick() {
        if (stopped) return;
        try {
          if (video.readyState >= 2)
            for (const code of await detector.detect(video)) if (!stopped) onRead(code.rawValue);
        } catch {
          if (!stopped)
            onError(
              'Native decoding failed. Stop scanning, enable the compatibility decoder, and restart.',
            );
          return;
        }
        if (!stopped) timer = window.setTimeout(() => void tick(), 120);
      }
      void tick();
      return {
        hasTorch,
        async torch(on) {
          await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
        },
        async stop() {
          stopped = true;
          clearTimeout(timer);
          stream?.getTracks().forEach((track) => track.stop());
          video.srcObject = null;
          video.remove();
        },
      };
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      host.replaceChildren();
      if (
        error instanceof DOMException &&
        ['NotAllowedError', 'NotFoundError'].includes(error.name)
      )
        throw error;
      // Native startup failed: fall through to the bundled, offline-compatible decoder.
    }
  }
  const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
  const scanner = new Html5Qrcode(hostId, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false,
  });
  try {
    await scanner.start(
      deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
      { fps: 10, disableFlip: false },
      onRead,
      () => {},
    );
  } catch (error) {
    scanner.clear();
    throw error;
  }
  let hasTorch = false;
  try {
    hasTorch = Boolean(
      (scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & { torch?: boolean }).torch,
    );
  } catch {
    /* Optional capability. */
  }
  return {
    hasTorch,
    async torch(on) {
      await scanner.applyVideoConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    },
    async stop() {
      try {
        await scanner.stop();
      } finally {
        scanner.clear();
      }
    },
  };
}
