import type { ManaCurveBucket } from '@/lib/types';

export function ManaCurve({ curve }: { curve: ManaCurveBucket[] }) {
  const max = Math.max(1, ...curve.map((b) => b.count));
  return (
    <div>
      <div className="curve">
        {curve.map((b) => (
          <div key={b.cmc} className="bar" style={{ height: `${(b.count / max) * 100}%` }}>
            {b.count > 0 && <span>{b.count}</span>}
          </div>
        ))}
      </div>
      <div className="curve-labels">
        {curve.map((b) => (
          <div key={b.cmc}>{b.cmc === 7 ? '7+' : b.cmc}</div>
        ))}
      </div>
    </div>
  );
}
