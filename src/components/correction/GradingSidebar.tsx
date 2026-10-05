/**
 * Panell dret del corrector: nota final, alumne i progrés, propietats de la selecció, nota de l'exercici,
 * rúbrica i fluorescents predefinits. Tots els números arriben ja calculats pel motor de puntuació únic.
 */
import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PEN_PALETTE } from '../../config/constants';
import { colorToHex, hexToHighlighterRgba, opaqueColor } from '../../domain/annotations';
import { formatScaledPoints, round2 } from '../../domain/scoring';
import type { Annotation, GradableExercise, PresetHighlighter, Student } from '../../types';
import HandwrittenTitle from '../common/HandwrittenTitle';
import NumericInput from '../common/NumericInput';
import type { CorrectionTools } from './useCorrectionTools';

interface Props {
    // Nota final
    rawTotal: number;
    totalPossible: number;
    targetMaxScore: number;
    onTargetMaxScore: (v: number) => void;
    factor: number;
    // Alumne
    students: Student[];
    studentIdx: number;
    onStudentIdx: (idx: number) => void;
    correctedIds: Set<string>;
    // Selecció
    annotations: Annotation[];
    apply: (anns: Annotation[], coalesce?: string) => void;
    selectedId: string | null;
    onDeleteSelected: () => void;
    // Exercici
    exercise: GradableExercise;
    exerciseIdx: number;
    exerciseScore: number | null;
    onUpdateExercise: (ex: GradableExercise) => void;
    rubricCounts: Record<string, number>;
    onRubricDelta: (itemId: string, delta: number) => void;
    highlightPoints: number;
    commentPoints: number;
    // Fluorescents
    presets: PresetHighlighter[];
    onUpdatePresets: (presets: PresetHighlighter[]) => void;
    tools: CorrectionTools;
    onDeselect: () => void;
}

const cleanName = (s: Student) => s.name.split(' (')[0];

const addButtonStyle = { marginTop: '0.4rem', background: 'none', border: '1px dashed var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.65rem', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' } as const;

export default function GradingSidebar(p: Props) {
    const { exercise, factor, presets, tools, students, studentIdx, annotations, selectedId, rubricCounts } = p;
    const [isEditingRubric, setIsEditingRubric] = useState(false);
    const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
    const [presetForm, setPresetForm] = useState<Partial<PresetHighlighter>>({});

    const fmt = (pts: number) => formatScaledPoints(pts, factor);
    const scale = (pts: number) => round2(pts * factor);
    const student = students[studentIdx];
    const progressPct = students.length ? Math.round((p.correctedIds.size / students.length) * 100) : 0;
    const selectedAnn = annotations.find(a => a.id === selectedId);
    const selectedColor = selectedAnn && 'color' in selectedAnn ? selectedAnn.color : undefined;
    const setSelectedColor = (color: string) => p.apply(annotations.map(a => a.id === selectedId ? { ...a, color } as Annotation : a), `color_${selectedId}`);
    const rubric = exercise.rubric ?? [];
    const setRubric = (r: typeof rubric) => p.onUpdateExercise({ ...exercise, rubric: r });
    const generalPresets = presets.filter(pr => !pr.exerciseId);
    const exercisePresets = presets.filter(pr => pr.exerciseId === exercise.id);

    const addPreset = (preset: PresetHighlighter) => {
        p.onUpdatePresets([...presets, preset]);
        setEditingPresetId(preset.id);
        setPresetForm(preset);
    };

    const renderPreset = (preset: PresetHighlighter, shortcutKey: string) => {
        const isSelected = tools.tool === 'highlighter' && tools.activePresetId === preset.id;
        if (editingPresetId === preset.id) {
            return (
                <div key={preset.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--accent)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <input type="text" value={presetForm.label || ''} onChange={e => setPresetForm({ ...presetForm, label: e.target.value })} className="field-input" style={{ flex: 1 }} placeholder="Label" />
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', justifyContent: 'space-between' }}>
                        <input type="color" value={colorToHex(presetForm.color || preset.color, '#ef4444')}
                            onChange={e => setPresetForm({ ...presetForm, color: hexToHighlighterRgba(e.target.value) })}
                            style={{ width: '18px', height: '18px', padding: 0, border: 'none', cursor: 'pointer' }} />
                        <NumericInput value={presetForm.points ?? 0} onChange={val => setPresetForm({ ...presetForm, points: val ?? 0 })} style={{ width: '40px' }} />
                        <div style={{ display: 'flex', gap: '0.2rem' }}>
                            <button onClick={() => setEditingPresetId(null)} className="btn-icon" style={{ padding: '0.1rem' }}><X size={10} /></button>
                            <button onClick={() => { p.onUpdatePresets(presets.map(pr => pr.id === preset.id ? { ...pr, ...presetForm } as PresetHighlighter : pr)); setEditingPresetId(null); }}
                                className="btn-icon" style={{ padding: '0.1rem', color: 'var(--success)' }}><Check size={10} /></button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                        <input type="checkbox" id={`cap-${preset.id}`} checked={!!presetForm.capEnabled} onChange={e => setPresetForm({ ...presetForm, capEnabled: e.target.checked })} style={{ width: '10px', height: '10px', cursor: 'pointer' }} />
                        <label htmlFor={`cap-${preset.id}`} style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>Límit</label>
                        {presetForm.capEnabled && (
                            <NumericInput value={presetForm.capTotal ?? 0} onChange={val => setPresetForm({ ...presetForm, capTotal: val })} style={{ width: '40px' }} />
                        )}
                    </div>
                </div>
            );
        }
        return (
            <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                <button
                    onClick={() => { tools.setTool('highlighter'); tools.setActivePresetId(preset.id); p.onDeselect(); }}
                    title={`${preset.label} · ${fmt(preset.points)}pt${preset.capEnabled && preset.capTotal !== undefined ? ` · Límit: ${fmt(preset.capTotal)}pt` : ''}`}
                    style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0.4rem',
                        background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                        border: `1px solid ${isSelected ? opaqueColor(preset.color) : 'var(--border)'}`,
                        borderRadius: '0.3rem', cursor: 'pointer', transition: 'all 0.1s ease', textAlign: 'left', minWidth: 0,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0, flex: 1 }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: preset.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.5rem', fontFamily: 'monospace', fontWeight: 800, opacity: 0.45, flexShrink: 0, lineHeight: 1 }}>{shortcutKey}</span>
                        <span style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isSelected ? 700 : 400, fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, marginLeft: '4px' }}>
                        {preset.capEnabled && preset.capTotal !== undefined && (
                            <span title={`Límit: ${fmt(preset.capTotal)}`} style={{ fontSize: '0.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '2px', padding: '0 2px', color: 'var(--text-secondary)', fontWeight: 800, lineHeight: 1.4 }}>⌀</span>
                        )}
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: preset.points > 0 ? 'var(--success)' : (preset.points < 0 ? 'var(--danger)' : 'var(--text-secondary)') }}>{fmt(preset.points)}</span>
                    </div>
                </button>
                <div style={{ display: 'flex', gap: '0.05rem' }}>
                    <button onClick={() => { setEditingPresetId(preset.id); setPresetForm(preset); }} style={{ padding: '0.15rem', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }} title="Edit">
                        <Pencil size={10} />
                    </button>
                    <button onClick={() => { p.onUpdatePresets(presets.filter(pr => pr.id !== preset.id)); if (tools.activePresetId === preset.id) tools.setActivePresetId(null); }}
                        style={{ padding: '0.15rem', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, color: 'var(--danger)' }} title="Delete">
                        <Trash2 size={10} />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="grading-sidebar" style={{ width: '18rem', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0 }}>
            <div className="grade-top-card">
                <span className="correction-sidebar-label">Nota Final</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span data-testid="nota-final" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>{round2(p.rawTotal)}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>/ {p.totalPossible} pt</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)', marginLeft: 'auto' }}>= {scale(p.rawTotal)} / <NumericInput value={p.targetMaxScore} onChange={v => { if (v !== undefined) p.onTargetMaxScore(v); }} style={{ width: '32px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--success)', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center', padding: 0, display: 'inline' }} /></span>
                </div>
            </div>

            <div className="student-section">
                {student?.nameCropUrl && (
                    <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'white', display: 'flex', justifyContent: 'center' }}>
                        <img src={student.nameCropUrl} alt="Nom retallat OCR" style={{ height: '52px', width: 'auto', display: 'block', maxWidth: '100%', objectFit: 'contain' }} title={`OCR: ${student.originalOcrName || cleanName(student)}`} />
                        {student.originalOcrName && student.originalOcrName !== cleanName(student) && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center' }}>OCR?</div>
                        )}
                    </div>
                )}
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <button className="btn-icon" onClick={() => p.onStudentIdx(Math.max(0, studentIdx - 1))} disabled={studentIdx === 0} style={{ padding: '4px', flexShrink: 0 }}>
                        <ChevronLeft size={14} />
                    </button>
                    <select value={studentIdx} onChange={e => p.onStudentIdx(Number(e.target.value))}
                        style={{ flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.3rem 0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
                        {students.map((st, i) => (
                            <option key={st.id} value={i}>{p.correctedIds.has(st.id) ? '✓ ' : '○ '}{cleanName(st) || `Alumne ${i + 1}`}</option>
                        ))}
                    </select>
                    <button className="btn-icon" onClick={() => p.onStudentIdx(Math.min(students.length - 1, studentIdx + 1))} disabled={studentIdx === students.length - 1} style={{ padding: '4px', flexShrink: 0 }}>
                        <ChevronRight size={14} />
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progrés</span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: progressPct === 100 ? 'var(--success)' : 'var(--text-secondary)' }}>{p.correctedIds.size}/{students.length} · {progressPct}%</span>
                    </div>
                    <div style={{ height: '5px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progressPct}%`, borderRadius: '3px', background: progressPct === 100 ? 'var(--success)' : 'var(--accent)', transition: 'width 0.4s ease' }} />
                    </div>
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center' }}>Alumne {studentIdx + 1} de {students.length}</span>
            </div>

            {selectedId && (
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>Propietats</span>
                        <button className="btn-icon" style={{ color: 'var(--danger)', padding: '0.25rem' }} onClick={p.onDeleteSelected} title="Eliminar anotació">
                            <Trash2 size={16} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Color</label>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {PEN_PALETTE.map(({ color }) => {
                                const isSelectedColor = selectedColor === color;
                                return (
                                    <button key={color} onClick={() => setSelectedColor(color)}
                                        style={{
                                            width: '24px', height: '24px', borderRadius: '50%', background: color,
                                            border: isSelectedColor ? '2px solid var(--text-primary)' : '2px solid transparent',
                                            boxShadow: isSelectedColor ? '0 0 0 1px var(--bg-secondary)' : 'none',
                                            cursor: 'pointer', padding: 0, transition: 'transform 0.1s',
                                        }} />
                                );
                            })}
                            <input type="color" value={selectedColor?.startsWith('#') ? selectedColor : '#3b82f6'} onChange={e => setSelectedColor(e.target.value)}
                                style={{ width: '24px', height: '24px', padding: 0, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', borderRadius: '4px' }} />
                        </div>
                    </div>
                </div>
            )}

            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <HandwrittenTitle size="1rem" color="blue" noMargin={true}>{`Exercici ${p.exerciseIdx + 1}${exercise.name ? ` — ${exercise.name}` : ''}`}</HandwrittenTitle>
                </div>
                {p.exerciseScore !== null ? (
                    <span data-testid="nota-exercici" style={{ fontSize: '1.1rem', fontWeight: 800, color: p.exerciseScore < 0 ? 'var(--danger)' : 'var(--accent)' }}>
                        {scale(p.exerciseScore)} {exercise.scoringMode !== 'from_zero' && exercise.maxScore !== undefined && `/ ${scale(exercise.maxScore)}`}
                    </span>
                ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sense nota</span>
                )}
            </div>

            <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
                <HandwrittenTitle size="1rem" color="purple">Rúbrica</HandwrittenTitle>
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                        {rubric.length === 0 && (
                            <button onClick={() => setIsEditingRubric(true)}
                                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
                                <Plus size={10} /> DEFINIR RÚBRICA
                            </button>
                        )}
                        <button onClick={() => setIsEditingRubric(!isEditingRubric)}
                            style={{ background: 'transparent', border: 'none', color: isEditingRubric ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }} title="Editar rúbrica">
                            {isEditingRubric ? <Check size={14} /> : <Pencil size={14} />}
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {rubric.length > 0 ? rubric.map((item, idx) => {
                            const count = rubricCounts[item.id] ?? 0;
                            if (isEditingRubric) {
                                return (
                                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'var(--bg-primary)', padding: '4px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                        <input value={item.label} placeholder="Descripció..."
                                            onChange={e => setRubric(rubric.map((r, i) => i === idx ? { ...r, label: e.target.value } : r))}
                                            style={{ flex: 1, fontSize: '0.75rem', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', padding: '2px' }} />
                                        <NumericInput value={item.points}
                                            onChange={val => { if (val !== undefined) setRubric(rubric.map((r, i) => i === idx ? { ...r, points: val } : r)); }}
                                            style={{ width: '40px', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'right' }} />
                                        <button onClick={() => setRubric(rubric.filter(r => r.id !== item.id))} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><X size={12} /></button>
                                    </div>
                                );
                            }
                            return (
                                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <button onClick={() => p.onRubricDelta(item.id, -1)} disabled={count === 0}
                                        style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--border)', background: count === 0 ? 'transparent' : 'var(--bg-primary)', color: count === 0 ? 'var(--text-secondary)' : 'var(--danger)', cursor: count === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, flexShrink: 0 }}>−</button>
                                    <span style={{ minWidth: '18px', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', color: count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{count}</span>
                                    <button onClick={() => p.onRubricDelta(item.id, +1)}
                                        style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: item.points >= 0 ? 'var(--success)' : 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, flexShrink: 0 }}>+</button>
                                    <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)' }}>{item.label}</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace', color: item.points >= 0 ? 'var(--success)' : 'var(--danger)', minWidth: '40px', textAlign: 'right' }}>
                                        {fmt(item.points)}
                                        {count > 0 && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> ={fmt(item.points * count)}</span>}
                                    </span>
                                </div>
                            );
                        }) : (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem' }}>Sense criteris definits.</div>
                        )}
                        {isEditingRubric && (
                            <button onClick={() => setRubric([...rubric, { id: `rub_${Date.now()}`, label: 'Nou ítem', points: 0 }])}
                                style={{ marginTop: '0.4rem', background: 'var(--bg-primary)', border: '1px dashed var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.7rem', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <Plus size={12} /> Afegir criteri
                            </button>
                        )}
                    </div>
                    {rubric.length > 0 && Object.values(rubricCounts).some(v => v > 0) && (
                        <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: 'none', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            {rubric.filter(item => (rubricCounts[item.id] ?? 0) > 0).map(item => {
                                const contribution = item.points * rubricCounts[item.id];
                                return (
                                    <span key={item.id} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                        {rubricCounts[item.id]}× {item.label} → <strong style={{ color: contribution >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(contribution)}</strong>
                                    </span>
                                );
                            })}
                            {p.highlightPoints !== 0 && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                    Highlights → <strong style={{ color: p.highlightPoints >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(p.highlightPoints)}</strong>
                                </span>
                            )}
                            {p.commentPoints !== 0 && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                    Comentaris → <strong style={{ color: p.commentPoints >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(p.commentPoints)}</strong>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>Penalty Highlights</h4>
                        <button
                            onClick={() => tools.setHighlighterLabelMode(tools.highlighterLabelMode === 'legend' ? 'individual' : 'legend')}
                            style={{
                                background: tools.highlighterLabelMode === 'legend' ? 'var(--accent)' : 'transparent',
                                color: tools.highlighterLabelMode === 'legend' ? 'white' : 'var(--text-secondary)',
                                border: tools.highlighterLabelMode === 'legend' ? 'none' : '1px solid var(--border)',
                                borderRadius: '4px', padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s',
                            }}
                            title="Toggle Legend Mode"
                        >
                            <Plus size={10} style={{ transform: tools.highlighterLabelMode === 'legend' ? 'rotate(45deg)' : 'none' }} />
                            LLEGENDA
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                            <div style={{ marginBottom: '0.5rem' }}>
                                <HandwrittenTitle size="1.1rem" color="blue" noMargin={true}>Generals</HandwrittenTitle>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                {generalPresets.map((preset, i) => renderPreset(preset, String(i + 1)))}
                                <button onClick={() => addPreset({ id: `preset_${Date.now()}`, label: 'Nou Highlight', color: 'rgba(239, 68, 68, 0.4)', points: -0.5 })} style={addButtonStyle}>
                                    <Plus size={10} /> Afegir General
                                </button>
                            </div>
                        </div>
                        <div>
                            <div style={{ marginBottom: '0.5rem' }}>
                                <HandwrittenTitle size="1.1rem" color="yellow" noMargin={true}>{`Ex. ${p.exerciseIdx + 1}`}</HandwrittenTitle>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                {exercisePresets.map((preset, i) => renderPreset(preset, String(generalPresets.length + i + 1)))}
                                <button onClick={() => addPreset({ id: `preset_${Date.now()}`, label: 'Highlight Exercici', color: 'rgba(239, 68, 68, 0.4)', points: -0.5, exerciseId: exercise.id })} style={addButtonStyle}>
                                    <Plus size={10} /> Afegir a l'Ex. {p.exerciseIdx + 1}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
