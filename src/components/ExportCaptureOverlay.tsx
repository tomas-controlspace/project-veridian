'use client';

import type { ExportStep } from '@/lib/export/exportToPptx';

const STEP_LABEL: Record<ExportStep, string> = {
  data: 'Preparing data…',
  map: 'Capturing map…',
  render: 'Building presentation…',
  save: 'Downloading…',
};

export default function ExportCaptureOverlay({ step }: { step: ExportStep | null }) {
  if (!step) return null;
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      style={{ background: 'rgba(42, 45, 38, 0.55)', backdropFilter: 'blur(4px)' }}
      aria-live="polite"
    >
      <div
        className="px-6 py-5 flex items-center gap-3"
        style={{
          background: '#fff',
          borderRadius: 10,
          border: '0.5px solid #D5D7D0',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          minWidth: 260,
        }}
      >
        <span
          className="inline-block rounded-full animate-spin"
          style={{
            width: 18,
            height: 18,
            border: '2px solid #EDEEE9',
            borderTopColor: '#2EC4A0',
          }}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#2A2D26' }}>
            Exporting case study
          </div>
          <div style={{ fontSize: 12, color: '#5A5D56', marginTop: 2 }}>
            {STEP_LABEL[step]}
          </div>
        </div>
      </div>
    </div>
  );
}
