import { Minus, Plus, RefreshCw } from 'lucide-react';

/** Barra flotant de zoom (definidor de plantilla i corrector). */
export default function ZoomControls({ scale, onZoom, onFit, variant }: {
    scale: number;
    onZoom: (scale: number) => void;
    onFit: () => void;
    variant: 'template' | 'correction';
}) {
    const isCorrection = variant === 'correction';
    return (
        <div className="glass-zoom" style={{
            position: 'absolute', bottom: '1.5rem', zIndex: isCorrection ? 100 : 10,
            ...(isCorrection ? { left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' as const } : {}),
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.4rem 1.25rem', borderRadius: '2.5rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}>
            <button className="btn-icon" style={{ padding: '4px', opacity: 0.8 }} onClick={() => onZoom(scale / 1.2)} title="Allunyar (-)">
                <Minus size={18} />
            </button>
            <input
                type="range" min="0.1" max="5" step="0.1" value={scale}
                onChange={e => onZoom(parseFloat(e.target.value))}
                className={isCorrection ? 'custom-slider' : undefined}
                style={isCorrection ? { width: '140px' } : { width: '140px', height: '4px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <button className="btn-icon" style={{ padding: '4px', opacity: 0.8 }} onClick={() => onZoom(scale * 1.2)} title="Apropar (+)">
                <Plus size={18} />
            </button>
            <div style={{ borderLeft: '1px solid var(--border)', height: '24px', marginLeft: '0.5rem', paddingLeft: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, minWidth: '45px', textAlign: 'center' }}>
                    {Math.round(scale * 100)}%
                </span>
                <button className="btn-icon" style={{ opacity: 0.7 }} title="Ajustar a la pàgina" onClick={onFit}>
                    <RefreshCw size={16} />
                </button>
            </div>
        </div>
    );
}
