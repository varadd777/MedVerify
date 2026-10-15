import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/*
  Props:
    - onDetected(text) : callback when a code is detected
    - qrRegionId (optional) : element id for the scanner div
    - fps (optional) : scanning fps
    - verbose (optional)
*/
export default function QRScanner({ onDetected, qrRegionId = 'qr-scanner', fps = 10, verbose = false }) {
  const html5QrcodeRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [supported, setSupported] = useState({ camera: false, torch: false });

  useEffect(() => {
    let isMounted = true;

    async function startScanner() {
      // Must be served over HTTPS (or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (verbose) console.warn('getUserMedia not supported');
        return;
      }

      try {
        // Check for cameras (best-effort)
        const devices = await Html5Qrcode.getCameras().catch(() => []);
        if (!isMounted) return;
        if (devices && devices.length) setSupported(prev => ({ ...prev, camera: true }));

        html5QrcodeRef.current = new Html5Qrcode(qrRegionId, /* verbose= */ !!verbose);

        const config = {
          fps,
          qrbox: { width: 300, height: 200 },
          experimentalFeatures: { useBarCodeDetectorIfSupported: true }
        };

        // Use facingMode preference (broader support than exact)
        const cameraConfig = { facingMode: "environment" };

        await html5QrcodeRef.current.start(
          cameraConfig,
          config,
          async (decodedText) => {
            if (verbose) console.log('QR detected:', decodedText);
            // stop scanning after first detection
            try { await stopScanner(); } catch (e) {}
            onDetected && onDetected(decodedText);
          },
          (errorMessage) => {
            if (verbose) console.debug('QR scan error:', errorMessage);
          }
        );

        setScanning(true);

        // Check for torch support (optional)
        try {
          const track = html5QrcodeRef.current.getRunningTrack?.();
          if (track && typeof track.getCapabilities === 'function') {
            const caps = track.getCapabilities();
            if (caps && caps.torch) setSupported(prev => ({ ...prev, torch: true }));
          }
        } catch (e) {
          if (verbose) console.debug('Torch detection failed', e);
        }
      } catch (err) {
        if (verbose) console.error('Failed to start scanner', err);
      }
    }

    startScanner();

    return () => {
      isMounted = false;
      stopScanner().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function stopScanner() {
    if (html5QrcodeRef.current) {
      try {
        await html5QrcodeRef.current.stop(); // stops camera and scanning
      } catch (e) {
        // ignore stop errors
      }
      try {
        html5QrcodeRef.current.clear(); // remove DOM nodes and free resources
      } catch (e) {}
      html5QrcodeRef.current = null;
    }
    setScanning(false);
    setTorchOn(false);
  }

  async function toggleTorch() {
    if (!html5QrcodeRef.current) return;
    try {
      const track = html5QrcodeRef.current.getRunningTrack?.();
      if (!track) return;
      // Some devices support applyConstraints for torch
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch (e) {
      console.warn('Torch toggle failed', e);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !html5QrcodeRef.current) return;
    try {
      const result = await Html5Qrcode.scanFileV2(file, true);
      if (result && result.length) {
        const decoded = result[0].decodedText || result[0].text;
        try { await stopScanner(); } catch (e) {}
        onDetected && onDetected(decoded);
      } else {
        onDetected && onDetected(null);
      }
    } catch (err) {
      console.warn('File scan failed', err);
      onDetected && onDetected(null);
    }
  }

  return (
    <div>
      <div id={qrRegionId} style={{ width: '100%', maxWidth: '480px', margin: '0 auto' }} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center', justifyContent: 'center' }}>
        {supported.torch && (
          <button onClick={toggleTorch} style={{ padding: '8px 12px' }}>
            {torchOn ? 'Turn Torch Off' : 'Turn Torch On'}
          </button>
        )}
        <label style={{ display: 'inline-block', padding: '8px 12px', background: '#eee', cursor: 'pointer', borderRadius: 4 }}>
          Upload Image
          <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>
        <button onClick={() => stopScanner()} style={{ padding: '8px 12px' }}>
          Stop
        </button>
      </div>
    </div>
  );
}