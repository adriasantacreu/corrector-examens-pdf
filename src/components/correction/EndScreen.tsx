/**
 * Pantalla final del corrector: «HAS ACABAT!» amb confeti, o avís si no hi ha cap exercici definit.
 */
import { useMemo } from 'react';
import { ChevronLeft, RefreshCw } from 'lucide-react';

const CONFETTI_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

interface Props {
    hasNoExercises: boolean;
    onBack: () => void;
    onRestart: () => void;
}

export default function EndScreen({ hasNoExercises, onBack, onRestart }: Props) {
    // Posicions fixes per a tota la vida del component (abans es recalculaven a cada render)
    const confetti = useMemo(() => Array.from({ length: 50 }, () => ({
        left: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 3}s`,
        background: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    })), []);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', position: 'relative', overflow: 'hidden' }}>
            {!hasNoExercises && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {confetti.map((style, i) => <div key={i} className="confetti" style={style} />)}
                </div>
            )}

            <div style={{ textAlign: 'center', zIndex: 10, padding: '2rem', background: 'var(--bg-secondary)', borderRadius: '2rem', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'float 6s ease-in-out infinite' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{hasNoExercises ? '📝' : '🏆'}</div>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.5rem', background: 'linear-gradient(to right, #6366f1, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    {hasNoExercises ? 'No hi ha exercicis' : 'HAS ACABAT!'}
                </h1>
                <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', maxWidth: '400px' }}>
                    {hasNoExercises
                        ? "Sembla que no has definit cap zona de l'examen per corregir."
                        : 'Has completat tota la correcció. Tots els alumnes tenen els seus exercicis revisats!'}
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
                    {hasNoExercises ? (
                        <button onClick={onBack} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem' }}>
                            <ChevronLeft size={18} /> Definir zones
                        </button>
                    ) : (
                        <>
                            <button onClick={onRestart} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem' }}>
                                <RefreshCw size={18} /> Tornar a començar
                            </button>
                            <button onClick={onBack} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer' }}>
                                Sortir
                            </button>
                        </>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-20px); }
                    100% { transform: translateY(0px); }
                }
                .confetti {
                    position: absolute;
                    top: -10px;
                    width: 10px;
                    height: 10px;
                    opacity: 0.7;
                    border-radius: 2px;
                    animation: confettiFall 4s linear infinite;
                }
                @keyframes confettiFall {
                    0% { transform: rotate(0) translateY(0); }
                    100% { transform: rotate(720deg) translateY(100vh); }
                }
            `}</style>
        </div>
    );
}
