import type { CSSProperties, MouseEvent } from 'react';

/** Interruptor "Núvol Sí/No". Hi ha dues mides, les mateixes que a les pantalles originals. */
export default function CloudToggle({ on, onToggle, label, size = 'sm', style, labelSize = '0.65rem' }: {
    on: boolean;
    onToggle: (e: MouseEvent) => void;
    label: string;
    size?: 'sm' | 'md';
    style?: CSSProperties;
    labelSize?: string;
}) {
    const track = size === 'md' ? { w: 28, h: 14, knob: 10, on: 16 } : { w: 24, h: 12, knob: 8, on: 14 };
    return (
        <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '1rem', border: '1px solid var(--border)', ...style }}>
            <div style={{ width: `${track.w}px`, height: `${track.h}px`, background: on ? 'var(--success)' : 'var(--text-secondary)', borderRadius: `${track.h / 2}px`, position: 'relative', transition: 'all 0.3s ease' }}>
                <div style={{ width: `${track.knob}px`, height: `${track.knob}px`, background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: on ? `${track.on}px` : '2px', transition: 'all 0.3s ease' }} />
            </div>
            <span style={{ fontSize: labelSize, fontWeight: 800 }}>{label}</span>
        </div>
    );
}
