/**
 * Capçalera del corrector: tornar, navegació d'exercicis, mode scroll/complet, tema, compte i «Finalitzar».
 */
import { AlignJustify, ChevronLeft, ChevronRight, Maximize2, Send } from 'lucide-react';
import type { GradableExercise, ThemeMode } from '../../types';
import { AccountBadge, AppHeader, ThemeToggle, type AccountProps } from '../common/HeaderParts';

interface Props extends AccountProps {
    exercises: GradableExercise[];
    exerciseIdx: number;
    onExerciseIdx: (idx: number) => void;
    spansTwoPages: boolean;
    onToggleSpans: () => void;
    theme: ThemeMode;
    onToggleTheme: () => void;
    onBack: () => void;
    onFinish: () => void;
}

const pagesInfo = (ex: GradableExercise) =>
    ex.type === 'pages' ? ex.pageIndexes.map(p => p + 1).join(', ') : String(ex.pageIndex + 1);

export default function CorrectionHeader(p: Props) {
    const { exercises, exerciseIdx, onExerciseIdx, spansTwoPages, theme } = p;
    return (
        <AppHeader
            style={{ height: '70px', padding: '0 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10, flexShrink: 0 }}
            leftGap="0.75rem"
            left={<>
                <button className="btn-icon" onClick={p.onBack} title="Tornar a Configuració">
                    <ChevronLeft />
                </button>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="correction-sidebar-label" style={{ marginBottom: 0 }}>Exercici</span>
                    <span style={{ fontSize: '1rem', fontWeight: 700 }}>{exerciseIdx + 1} / {exercises.length}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn-icon" onClick={() => onExerciseIdx(Math.max(0, exerciseIdx - 1))} disabled={exerciseIdx === 0}>
                        <ChevronLeft />
                    </button>
                    <select
                        value={exerciseIdx}
                        onChange={e => onExerciseIdx(Number(e.target.value))}
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                    >
                        {exercises.map((ex, i) => (
                            <option key={ex.id} value={i}>
                                {i === exerciseIdx ? '👉 ' : ''}
                                {ex.name || `Exercici ${i + 1}`}
                                {` (Pàg${ex.type === 'pages' ? 's' : ''}: ${pagesInfo(ex)})`}
                            </option>
                        ))}
                    </select>
                    <button className="btn-icon" onClick={() => onExerciseIdx(Math.min(exercises.length - 1, exerciseIdx + 1))} disabled={exerciseIdx === exercises.length - 1}>
                        <ChevronRight />
                    </button>
                </div>
                <button
                    className={`btn-icon ${spansTwoPages ? 'active' : ''}`}
                    title={spansTwoPages ? 'Vista completa — clic per a mode scroll' : 'Mode scroll — clic per a vista completa'}
                    style={{ gap: '0.3rem', paddingLeft: '0.6rem', paddingRight: '0.6rem', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.04em' }}
                    onClick={p.onToggleSpans}
                >
                    {spansTwoPages ? <Maximize2 size={14} /> : <AlignJustify size={14} />}
                    {spansTwoPages ? 'COMPLET' : 'SCROLL'}
                </button>
            </>}
            right={<>
                <ThemeToggle theme={theme} onToggle={p.onToggleTheme} title={theme === 'dark' ? 'Canviar a Mode Clar' : 'Canviar a Mode Fosc'} />
                <AccountBadge accessToken={p.accessToken} userEmail={p.userEmail} userPicture={p.userPicture} onAuthorize={p.onAuthorize} onLogout={p.onLogout} />
                <button onClick={p.onFinish} className="btn btn-primary" title="Finalitzar i enviar notes per correu">
                    <Send size={14} />
                    Finalitzar
                </button>
            </>}
        />
    );
}
