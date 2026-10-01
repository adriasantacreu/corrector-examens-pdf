/** Targeta d'un exercici corregible a la barra lateral del definidor de plantilla. */
import { Check, Plus, Trash2, X } from 'lucide-react';
import { isAutoDistribute } from '../../domain/exercises';
import { getScoringMode } from '../../domain/scoring';
import type { ExerciseDef, GradableExercise, RubricItem } from '../../types';
import NumericInput from '../common/NumericInput';

const numericStyle = {
    background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '4px',
    color: 'var(--text-primary)', padding: '0.2rem 0.3rem', fontSize: '0.75rem',
};

interface Props {
    exercise: GradableExercise;
    index: number;
    currentPageIndex: number;
    isSelected: boolean;
    nameRef: (el: HTMLInputElement | null) => void;
    maxRef: (el: HTMLInputElement | null) => void;
    onSelect: () => void;
    onRemove: () => void;
    onUpdate: (updates: Partial<ExerciseDef>) => void;
    onFocusMax: () => void;
    onDoneEditing: () => void;
    onToggleAutoDistribute: (value: boolean) => void;
    onAddRubricItem: () => void;
    onUpdateRubricItem: (itemId: string, updates: Partial<RubricItem>) => void;
    onRemoveRubricItem: (itemId: string) => void;
    onPageError: (message: string) => void;
}

export default function ExerciseCard(p: Props) {
    const ex = p.exercise;
    const mode = getScoringMode(ex);
    const involvesPage = ex.type === 'pages' ? ex.pageIndexes.includes(p.currentPageIndex) : ex.pageIndex === p.currentPageIndex;
    const modeButton = (value: 'from_zero' | 'from_max', text: string) => (
        <button
            onClick={e => { e.stopPropagation(); p.onUpdate({ scoringMode: value }); }}
            style={{
                flex: 1, padding: 0, fontSize: '0.6rem', fontWeight: 800, borderRadius: '0.35rem', border: 'none', cursor: 'pointer',
                background: mode === value ? 'var(--accent)' : 'transparent',
                color: mode === value ? 'white' : 'var(--text-secondary)',
                transition: 'all 0.2s ease',
            }}
        >{text}</button>
    );

    return (
        <div onClick={p.onSelect} style={{ padding: '0.75rem', background: p.isSelected ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-tertiary)', borderRadius: '0.75rem', border: p.isSelected ? '2px solid var(--accent)' : (involvesPage ? '1px solid var(--accent)' : '1px solid var(--border)'), display: 'flex', flexDirection: 'column', gap: '0.75rem', transition: 'all 0.2s ease', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: ex.type === 'pages' ? 'var(--accent)' : '#6366f1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>{p.index + 1}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '2px' }}>
                        <input
                            ref={p.nameRef}
                            type="text"
                            value={ex.name || ''}
                            placeholder="Nom exercici"
                            onChange={e => p.onUpdate({ name: e.target.value })}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === 'Tab') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    p.onFocusMax();
                                }
                            }}
                            style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', padding: '2px 0', fontSize: '0.85rem', fontWeight: 700 }}
                            onClick={e => e.stopPropagation()}
                        />
                    </div>
                </div>
                <button onClick={e => { e.stopPropagation(); p.onRemove(); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)' }}>MÀX:</span>
                    <NumericInput
                        ref={p.maxRef}
                        value={ex.maxScore}
                        onChange={val => p.onUpdate({ maxScore: val })}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                p.onDoneEditing();
                                e.currentTarget.blur();
                            }
                        }}
                        style={{ ...numericStyle, width: '45px', textAlign: 'center', fontWeight: 800 }}
                    />
                </div>
                <div style={{ flex: 1 }}></div>
                <div style={{ display: 'flex', background: 'var(--bg-primary)', borderRadius: '0.5rem', padding: '2px', border: '1px solid var(--border)', height: '28px', width: '90px' }}>
                    {modeButton('from_zero', '0 ↑')}
                    {modeButton('from_max', 'MAX ↓')}
                </div>
            </div>

            {ex.type === 'pages' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)' }}>PÀGINES ASSIGNADES</span>
                        {!ex.pageIndexes.includes(p.currentPageIndex) && (
                            <button
                                onClick={e => { e.stopPropagation(); p.onUpdate({ pageIndexes: [...ex.pageIndexes, p.currentPageIndex].sort((a, b) => a - b) }); }}
                                className="btn btn-secondary"
                                style={{ fontSize: '0.6rem', height: '20px', padding: '0 0.4rem' }}
                            >
                                + Afegir pàg. {p.currentPageIndex + 1}
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {ex.pageIndexes.map(pIdx => (
                            <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>P{pIdx + 1}</span>
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        if (ex.pageIndexes.length > 1) p.onUpdate({ pageIndexes: ex.pageIndexes.filter(x => x !== pIdx) });
                                        else p.onPageError('Un exercici de pàgina ha de tenir almenys una pàgina.');
                                    }}
                                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div onClick={e => { e.stopPropagation(); p.onUpdate({ spansTwoPages: !ex.spansTwoPages }); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.2rem' }}>
                        <div style={{ width: '14px', height: '14px', border: '1px solid var(--border)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ex.spansTwoPages ? 'var(--accent)' : 'transparent' }}>
                            {ex.spansTwoPages && <Check size={10} color="white" />}
                        </div>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Dues pàgines en paral·lel</span>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Criteris de rúbrica</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={isAutoDistribute(ex)} onChange={e => p.onToggleAutoDistribute(e.target.checked)} />
                            Auto-repartir
                        </label>
                        <button onClick={e => { e.stopPropagation(); p.onAddRubricItem(); }} className="btn btn-icon" style={{ padding: '2px', height: '20px', width: '20px', color: 'var(--accent)' }}>
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
                {(ex.rubric || []).map(item => (
                    <div key={item.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={item.label}
                            placeholder="Concepte..."
                            onChange={e => p.onUpdateRubricItem(item.id, { label: e.target.value })}
                            style={{ flex: 1, fontSize: '0.7rem', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                            onClick={e => e.stopPropagation()}
                        />
                        <NumericInput
                            value={item.points}
                            onChange={val => p.onUpdateRubricItem(item.id, { points: val || 0 })}
                            style={{ ...numericStyle, width: '40px', textAlign: 'center' }}
                        />
                        <button onClick={e => { e.stopPropagation(); p.onRemoveRubricItem(item.id); }} style={{ padding: '4px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <X size={14} />
                        </button>
                    </div>
                ))}
                {(ex.rubric || []).length === 0 && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Clica + per afegir criteris</span>
                )}
            </div>
        </div>
    );
}
