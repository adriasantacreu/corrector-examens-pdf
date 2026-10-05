/**
 * Barra lateral d'eines del corrector (esquerra): eines, colors, gruix, opacitat, mides, netejar, desfer i esborrar.
 */
import type { ReactNode } from 'react';
import { Highlighter, MousePointer2, PenTool, Trash2, Type, Undo } from 'lucide-react';
import { PEN_PALETTE } from '../../config/constants';
import { colorToHex, hexToHighlighterRgba } from '../../domain/annotations';
import type { ToolType } from '../../types';
import type { CorrectionTools } from './useCorrectionTools';

interface Props {
    tools: CorrectionTools;
    stampSize: number;
    onStampSize: (size: number) => void;
    onClearAll: () => void;
    onUndo: () => void;
    canUndo: boolean;
    onDeleteSelected: () => void;
    hasSelection: boolean;
    onDeselect: () => void;
}

const Divider = () => <div style={{ gridColumn: 'span 2', width: '24px', height: '1px', background: 'var(--border)' }}></div>;

const toolButtonStyle = { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '6px 4px', width: '100%' } as const;
const shortcutStyle = { fontSize: '0.55rem', opacity: 0.5, fontFamily: 'monospace' } as const;
const sizeInputStyle = { width: '40px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 4px', fontSize: '0.75rem', textAlign: 'center' } as const;
const sizeLabelStyle = { fontSize: '0.5rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'center' } as const;

export default function ToolSidebar({ tools, stampSize, onStampSize, onClearAll, onUndo, canUndo, onDeleteSelected, hasSelection, onDeselect }: Props) {
    const { tool, setTool, penColor, setPenColor, highlighterColor, setHighlighterColor, penWidth, setPenWidth, penOpacity, setPenOpacity, setActivePresetId, commentDefaultSize, setCommentDefaultSize } = tools;
    const highlighterHex = colorToHex(highlighterColor);

    const toolButtons: { id: ToolType; icon: ReactNode; label: string; title: string; onClick: () => void }[] = [
        { id: 'pen', icon: <PenTool size={18} />, label: 'P', title: 'Boli (P)', onClick: () => { setTool('pen'); onDeselect(); } },
        { id: 'eraser', icon: <Trash2 size={18} />, label: 'X', title: 'Goma (X)', onClick: () => { setTool('eraser'); onDeselect(); } },
        { id: 'text', icon: <Type size={18} />, label: 'T', title: 'Text (T)', onClick: () => { setTool('text'); onDeselect(); } },
        { id: 'highlighter', icon: <Highlighter size={18} />, label: 'H', title: 'Destacador (H)', onClick: () => { setTool('highlighter'); setActivePresetId(null); onDeselect(); } },
    ];

    return (
        <div className="tool-sidebar" style={{ width: '6rem', background: 'var(--bg-secondary)', borderRight: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', alignContent: 'start', justifyItems: 'center', padding: '1rem 0.5rem', gap: '0.5rem', flexShrink: 0, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'center', width: '100%' }}>
                <button className={`btn-icon ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')} title="Seleccionar (V)" style={toolButtonStyle}>
                    <MousePointer2 size={18} />
                    <span style={shortcutStyle}>V</span>
                </button>
            </div>

            <Divider />

            {toolButtons.map(btn => (
                <button key={btn.id} className={`btn-icon ${tool === btn.id ? 'active' : ''}`} onClick={btn.onClick} title={btn.title} style={toolButtonStyle}>
                    {btn.icon}
                    <span style={shortcutStyle}>{btn.label}</span>
                </button>
            ))}

            <Divider />

            {PEN_PALETTE.map(({ color, key }) => {
                const active = (tool === 'pen' && penColor === color) || (tool === 'highlighter' && highlighterHex === color);
                return (
                    <div key={color} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                        <button
                            onClick={() => {
                                if (tool === 'highlighter') setHighlighterColor(hexToHighlighterRgba(color));
                                else { setPenColor(color); setTool('pen'); }
                            }}
                            style={{
                                width: '24px', height: '24px', borderRadius: '50%', background: color,
                                border: active ? '2px solid var(--text-primary)' : '2px solid transparent',
                                cursor: 'pointer', transition: 'transform 0.1s',
                                transform: (penColor === color && tool === 'pen') ? 'scale(1.15)' : 'scale(1)',
                                flexShrink: 0,
                            }}
                            title={`Color (${key})`}
                        />
                        <span style={{ fontSize: '0.55rem', opacity: 0.45, fontFamily: 'monospace' }}>{key}</span>
                    </div>
                );
            })}

            <Divider />

            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%', padding: '0 0.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Mida</span>
                        <span style={{ fontSize: '0.6rem', opacity: 0.6, fontWeight: 700 }}>{penWidth}px</span>
                    </div>
                    <input type="range" min="1" max="40" step="1" value={penWidth} onChange={e => setPenWidth(Number(e.target.value))} className="custom-slider" title={`Pen Width: ${penWidth}px`} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Opacitat</span>
                        <span style={{ fontSize: '0.6rem', opacity: 0.6, fontWeight: 700 }}>{Math.round(penOpacity * 100)}%</span>
                    </div>
                    <input type="range" min="0.1" max="1" step="0.05" value={penOpacity} onChange={e => setPenOpacity(Number(e.target.value))} className="custom-slider" title={`Opacity: ${Math.round(penOpacity * 100)}%`} />
                </div>
            </div>

            <Divider />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pen</span>
                <label style={{ position: 'relative', cursor: 'pointer' }} title="Custom pen color">
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: penColor, border: '2px solid var(--border)', cursor: 'pointer' }} />
                    <input type="color" value={colorToHex(penColor, '#000000')} onChange={e => { setPenColor(e.target.value); setTool('pen'); }}
                        style={{ opacity: 0, position: 'absolute', top: 0, left: 0, width: '22px', height: '22px', cursor: 'pointer' }} />
                </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Hl</span>
                <label style={{ position: 'relative', cursor: 'pointer' }} title="Custom highlight color">
                    <div style={{ width: '22px', height: '22px', borderRadius: '4px', background: highlighterColor, border: '2px solid var(--border)', cursor: 'pointer' }} />
                    <input type="color" value={highlighterHex}
                        onChange={e => { setHighlighterColor(hexToHighlighterRgba(e.target.value)); setTool('highlighter'); setActivePresetId(null); }}
                        style={{ opacity: 0, position: 'absolute', top: 0, left: 0, width: '22px', height: '22px', cursor: 'pointer' }} />
                </label>
            </div>

            <div style={{ gridColumn: 'span 2', flex: 1 }}></div>

            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: 'none', paddingTop: '0.8rem', marginTop: '0.5rem', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0' }}>
                    <span style={sizeLabelStyle}>Mida Text</span>
                    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                        <input type="number" value={commentDefaultSize} onChange={e => setCommentDefaultSize(Number(e.target.value))} style={sizeInputStyle} />
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0' }}>
                    <span style={sizeLabelStyle}>Mida Nota</span>
                    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                        <input type="number" value={stampSize} onChange={e => onStampSize(Number(e.target.value))} style={sizeInputStyle} />
                    </div>
                </div>
                <button
                    onClick={onClearAll}
                    style={{
                        width: '100%', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.15)',
                        borderRadius: '4px', padding: '4px 2px', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                    }}
                >
                    <Trash2 size={10} />
                    Netejar Tot
                </button>
            </div>

            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '0.25rem', paddingBottom: '0.5rem', paddingTop: '0.5rem', position: 'relative', zIndex: 1 }}>
                <button className="btn-icon" onClick={onUndo} title="Undo (Ctrl+Z)" disabled={!canUndo}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '6px 4px' }}>
                    <Undo size={18} />
                    <span style={{ fontSize: '0.5rem', opacity: 0.45, fontFamily: 'monospace' }}>^Z</span>
                </button>
                <button className="btn-icon" onClick={onDeleteSelected} title="Delete Selected (Del)" disabled={!hasSelection}
                    style={{ color: hasSelection ? 'var(--danger)' : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '6px 4px' }}>
                    <Trash2 size={18} />
                    <span style={{ fontSize: '0.5rem', opacity: 0.45, fontFamily: 'monospace' }}>DEL</span>
                </button>
            </div>
        </div>
    );
}
