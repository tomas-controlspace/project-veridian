'use client';

import { useState } from 'react';
import ComparisonPanel from './ComparisonPanel';
import RankingTable from './RankingTable';
import { useStore } from '@/lib/store';

type Tab = 'comparison' | 'ranking';

export default function BottomPanel() {
  const [tab, setTab] = useState<Tab>('comparison');
  const { selectedIds } = useStore();

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    borderBottom: active ? '2px solid #2EC4A0' : '2px solid transparent',
    color: active ? '#2D6B55' : '#5A5D56',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <div className="flex flex-col h-full" style={{ background: '#fff', borderTop: '0.5px solid var(--neutral-200)' }}>
      <div className="flex items-center px-4 shrink-0" style={{ borderBottom: '0.5px solid var(--neutral-200)' }}>
        <button onClick={() => setTab('comparison')} style={tabStyle(tab === 'comparison')}>
          Comparison
          {selectedIds.length > 0 && (
            <span
              className="ml-1.5 text-xs px-1.5 py-0.5"
              style={{
                background: 'var(--accent-light)',
                color: 'var(--veridian-400)',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 500,
              }}
            >
              {selectedIds.length}
            </span>
          )}
        </button>
        <button onClick={() => setTab('ranking')} style={tabStyle(tab === 'ranking')}>
          Ranking
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'comparison' ? <ComparisonPanel /> : <RankingTable />}
      </div>
    </div>
  );
}
