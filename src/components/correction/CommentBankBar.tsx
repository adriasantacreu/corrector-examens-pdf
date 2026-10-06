/**
 * Banc de comentaris (barra inferior plegable): comentaris generals i de l'exercici, formulari per crear-ne
 * o editar-ne, i edició ràpida de l'anotació de text o fluorescent seleccionada.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { commentColors, detachFromPreset } from '../../domain/annotations';
import type { Annotation, AnnotationComment } from '../../types';
import HandwrittenTitle from '../common/HandwrittenTitle';
import NumericInput from '../common/NumericInput';

type ColorMode = NonNullable<AnnotationComment['colorMode']>;

interface Props {
    expanded: boolean;
    exerciseId: string;
    exerciseNumber: number;
    commentBank: AnnotationComment[];
    onUpdateCommentBank: (bank: AnnotationComment[]) => void;
    isDarkMode: boolean;
    pendingStampComment: AnnotationComment | null;
    onTogglePendingStamp: (comment: AnnotationComment) => void;
    annotations: Annotation[];
    apply: (anns: Annotation[], coalesce?: string) => void;
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
}

const MIN_HEIGHT = 60;
const MAX_HEIGHT = 600;

const EDITING_COLORS = (dark: boolean) => ({ background: dark ? '#451a03' : '#fef3c7', border: '#f59e0b', text: dark ? '#fbbf24' : '#92400e' });
const STAMP_COLORS = (dark: boolean) => ({ background: 'rgba(99, 102, 241, 0.25)', border: 'rgba(99, 102, 241, 0.8)', text: dark ? '#818cf8' : '#4f46e5' });

export default function CommentBankBar(p: Props) {
    const { expanded, commentBank, onUpdateCommentBank, isDarkMode, annotations, apply, selectedId, setSelectedId } = p;
    const [height, setHeight] = useState(160);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [text, setText] = useState('');
    const [score, setScore] = useState('');
    const [colorMode, setColorMode] = useState<ColorMode>('neutral');
    const [customColor, setCustomColor] = useState('#3b82f6');
    const [capEnabled, setCapEnabled] = useState(false);
    const [capTotal, setCapTotal] = useState('');

    // Redimensionar arrossegant la vora superior
    const [resizing, setResizing] = useState(false);
    useEffect(() => {
        if (!resizing) return;
        const move = (e: MouseEvent) => setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, window.innerHeight - e.clientY)));
        const up = () => setResizing(false);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [resizing]);

    const resetForm = useCallback(() => {
        setEditingId(null); setText(''); setScore(''); setCapEnabled(false); setCapTotal('');
    }, []);

    // Si el comentari que s'editava desapareix (p. ex. s'ha esborrat), es tanca l'edició
    useEffect(() => {
        if (editingId && !commentBank.some(c => c.id === editingId)) resetForm();
    }, [commentBank, editingId, resetForm]);

    const startEditing = (c: AnnotationComment) => {
        setEditingId(c.id);
        setText(c.text);
        setScore(c.score?.toString() ?? '');
        setColorMode(c.colorMode || 'neutral');
        if (c.customColor) setCustomColor(c.customColor);
        setCapEnabled(c.capEnabled || false);
        setCapTotal(c.capTotal?.toString() ?? '');
    };

    const save = () => {
        if (!text.trim()) return;
        const fields = {
            text: text.trim(),
            score: score !== '' ? Number(score) : undefined,
            colorMode,
            customColor: colorMode === 'custom' ? customColor : undefined,
            capEnabled: capEnabled || undefined,
            capTotal: capEnabled && capTotal !== '' ? Number(capTotal) : undefined,
        };
        if (editingId) onUpdateCommentBank(commentBank.map(c => c.id === editingId ? { ...c, ...fields } : c));
        else onUpdateCommentBank([...commentBank, { id: `cb_${Math.random().toString(36).slice(2, 9)}`, exerciseId: p.exerciseId, ...fields }]);
        resetForm();
    };

    const renderChip = (comment: AnnotationComment, forExercise: boolean) => {
        const isEditing = editingId === comment.id;
        const isSelectedStamp = forExercise && p.pendingStampComment?.id === comment.id;
        const base = commentColors(comment, isDarkMode);
        const isNeutral = base.background === 'var(--bg-secondary)';
        const colors = isEditing ? EDITING_COLORS(isDarkMode)
            : isSelectedStamp ? STAMP_COLORS(isDarkMode)
                : { ...base, background: isNeutral && draggingId === comment.id ? 'rgba(99, 102, 241, 0.15)' : base.background };
        return (
            <div key={comment.id} draggable
                onDragStart={e => { e.dataTransfer.setData('text/comment', JSON.stringify(comment)); setDraggingId(comment.id); }}
                onDragEnd={() => setDraggingId(null)}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.6rem', borderRadius: '2rem',
                    background: colors.background, border: `1px solid ${colors.border}`,
                    cursor: forExercise ? 'pointer' : 'grab', fontSize: '0.7rem', fontWeight: 600, color: colors.text,
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isSelectedStamp ? '0 0 0 2px rgba(99,102,241,0.3)' : '0 1px 2px rgba(0,0,0,0.02)', userSelect: 'none',
                    transform: (isEditing || isSelectedStamp) ? 'scale(1.05)' : 'none',
                }}
                onClick={forExercise ? () => p.onTogglePendingStamp(comment) : undefined}
                onDoubleClick={() => startEditing(comment)}
            >
                <span>{comment.text}</span>
                {comment.score !== undefined && <span style={{ fontWeight: 800, opacity: 0.8, background: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)', padding: '0.05rem 0.25rem', borderRadius: '3px', fontSize: '0.65rem' }}>{comment.score > 0 ? '+' : ''}{comment.score}</span>}
                {comment.capEnabled && comment.capTotal !== undefined && (
                    <span title={`Límit: ${comment.capTotal > 0 ? '+' : ''}${comment.capTotal}pt`} style={{ fontSize: '0.5rem', opacity: 0.6, fontWeight: 800 }}>⌀</span>
                )}
                <button onClick={e => { e.stopPropagation(); onUpdateCommentBank(commentBank.filter(c => c.id !== comment.id)); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.4, fontSize: '1rem', marginLeft: '4px' }}>×</button>
            </div>
        );
    };

    const selectedAnn = annotations.find(a => a.id === selectedId);
    const editingAnn = selectedAnn && (selectedAnn.type === 'text' || selectedAnn.type === 'highlighter') ? selectedAnn : null;
    const updateSelected = (fn: (a: Annotation) => Annotation, coalesce?: string) =>
        apply(annotations.map(a => a.id === selectedId ? fn(a) : a), coalesce);

    const boxTint = editingAnn
        ? { background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.3)' }
        : editingId ? { background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)' }
            : { background: 'var(--bg-secondary)', border: '1px solid var(--border)' };

    return (
        <div className="bottom-comment-bank" style={{
            height: expanded ? `${height}px` : '0px',
            background: 'var(--bg-secondary)',
            padding: expanded ? '0.4rem 0.75rem' : '0',
            display: 'flex', gap: '0.75rem', flexShrink: 0, position: 'relative', zIndex: 200,
            transition: resizing ? 'none' : 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: expanded ? 'visible' : 'hidden',
            borderTop: expanded ? '1px solid var(--border)' : 'none',
        }}>
            {expanded && (
                <div onMouseDown={e => { e.preventDefault(); setResizing(true); }}
                    style={{ position: 'absolute', top: '-3px', left: 0, right: 0, height: '6px', cursor: 'ns-resize', zIndex: 30, display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '32px', height: '3px', background: 'var(--border)', borderRadius: '2px', marginTop: '2px', opacity: 0.5 }} />
                </div>
            )}

            <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: '1rem', overflowY: 'hidden', paddingRight: '0.5rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
                    <div style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5, paddingBottom: '2px' }}>
                        <HandwrittenTitle size="1.1rem" color="blue" noMargin={true}>Generals</HandwrittenTitle>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', paddingBottom: '0.5rem' }}>
                        {commentBank.filter(c => !c.exerciseId).map(c => renderChip(c, false))}
                    </div>
                </div>

                <div style={{ width: '1px', background: 'var(--border)', height: '80%', alignSelf: 'center', opacity: 0.5 }} />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
                    <div style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5, paddingBottom: '2px' }}>
                        <HandwrittenTitle size="1.1rem" color="yellow" noMargin={true}>{`Ex. ${p.exerciseNumber}`}</HandwrittenTitle>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', paddingBottom: '0.5rem' }}>
                        {commentBank.filter(c => c.exerciseId === p.exerciseId).map(c => renderChip(c, true))}
                    </div>
                </div>
            </div>

            <div style={{ width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.4rem', ...boxTint, borderRadius: '8px', transition: 'all 0.3s ease' }}>
                {editingAnn ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Pencil size={10} style={{ color: 'var(--accent)' }} />
                                <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Editant anotació</span>
                            </div>
                            <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, display: 'flex' }}><X size={12} /></button>
                        </div>
                        <input
                            placeholder="Text..."
                            autoFocus
                            value={editingAnn.type === 'text' ? editingAnn.text : editingAnn.label || ''}
                            onKeyDown={e => { if (e.key === 'Enter') setSelectedId(null); }}
                            onChange={e => {
                                const v = e.target.value;
                                updateSelected(a => a.type === 'text' ? { ...a, text: v } : a.type === 'highlighter' ? { ...a, label: v } : a, `label_${selectedId}`);
                            }}
                            className="field-input"
                        />
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <NumericInput
                                placeholder="Pts"
                                value={editingAnn.type === 'text' ? editingAnn.score : editingAnn.points}
                                onChange={val => updateSelected(a => a.type === 'text' ? { ...a, score: val } : a.type === 'highlighter' ? detachFromPreset(a, val) : a, `pts_${selectedId}`)}
                                style={{ width: '50px' }}
                            />
                            <input
                                type="color"
                                value={editingAnn.color?.startsWith('#') ? editingAnn.color : '#ef4444'}
                                onChange={e => { const c = e.target.value; updateSelected(a => ({ ...a, color: c }) as Annotation, `color_${selectedId}`); }}
                                style={{ width: '24px', height: '24px', padding: 0, border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}
                                title="Canviar color d'anotació"
                            />
                            <div style={{ flex: 1 }}></div>
                            <button
                                onClick={() => { apply(annotations.filter(a => a.id !== selectedId)); setSelectedId(null); }}
                                style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: 'none', borderRadius: '4px', padding: '0.2rem 0.4rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.65rem' }}
                            >
                                <Trash2 size={12} />
                            </button>
                            <button onClick={() => setSelectedId(null)}
                                style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem' }}>
                                <Check size={14} />
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                {editingId ? <Pencil size={10} style={{ color: '#d97706' }} /> : <Plus size={8} style={{ color: 'var(--accent)' }} />}
                                <span style={{ fontSize: '0.55rem', color: editingId ? '#92400e' : 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {editingId ? 'Editar comentari' : 'Nou comentari'}
                                </span>
                            </div>
                            {editingId && (
                                <button onClick={resetForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', padding: 0, display: 'flex' }}><X size={12} /></button>
                            )}
                        </div>
                        <input placeholder="Text..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} className="field-input" />
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <input type="number" step="0.1" placeholder="Pts" value={score} onChange={e => setScore(e.target.value)} className="field-input" style={{ width: '40px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <input type="checkbox" id="comment-cap-toggle" checked={capEnabled} onChange={e => setCapEnabled(e.target.checked)} style={{ width: '10px', height: '10px', cursor: 'pointer' }} />
                                <label htmlFor="comment-cap-toggle" style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>Límit</label>
                                {capEnabled && (
                                    <input type="number" step="0.1" placeholder="Cap" value={capTotal} onChange={e => setCapTotal(e.target.value)} className="field-input" style={{ width: '40px' }} />
                                )}
                            </div>
                            <select value={colorMode} onChange={e => setColorMode(e.target.value as ColorMode)} className="field-input" style={{ flex: 1 }}>
                                <option value="neutral">Neutral</option>
                                <option value="score">Nota</option>
                                <option value="custom">Color</option>
                            </select>
                            {colorMode === 'custom' && (
                                <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)}
                                    style={{ width: '30px', height: '24px', padding: 0, border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }} />
                            )}
                            <button data-testid="comment-add" onClick={save} disabled={!text.trim()} title={text.trim() ? undefined : 'Escriu el text del comentari'}
                                style={{ background: editingId ? '#f59e0b' : 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', padding: '0.2rem 0.4rem', cursor: text.trim() ? 'pointer' : 'not-allowed', opacity: text.trim() ? 1 : 0.5, fontWeight: 700, fontSize: '0.7rem' }}>
                                {editingId ? <Check size={14} /> : '+'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
