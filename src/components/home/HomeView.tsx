import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ArrowDown, RefreshCw, Upload } from 'lucide-react';
import type { SessionSummary } from '../../domain/session';
import type { PendingSession } from '../../app/useRecentSessions';
import type { ThemeMode } from '../../types';
import CloudToggle from '../common/CloudToggle';
import FlowGradingLogo from '../common/FlowGradingLogo';
import HandwrittenTitle from '../common/HandwrittenTitle';
import { AccountBadge, ThemeToggle, type AccountProps } from '../common/HeaderParts';
import SessionCard from './SessionCard';

interface Props extends AccountProps {
    theme: ThemeMode;
    onToggleTheme: () => void;
    sessions: SessionSummary[];
    pending: PendingSession | null;
    onUploadFile: (file: File) => void;
    onInvalidFile: () => void;
    onResume: (session: SessionSummary, file?: File) => void;
    onDelete: (session: SessionSummary) => void;
    onRename: (session: SessionSummary, alias: string | null) => void;
    onToggleCloud: (session: SessionSummary, isPending: boolean) => void;
}

/** Distància de scroll en què el subratllat del logo desapareix. */
const LOGO_FADE_DISTANCE = 350;

export default function HomeView(props: Props) {
    const { theme, onToggleTheme, sessions, pending, onUploadFile, onInvalidFile, onResume, onDelete, onRename, onToggleCloud, accessToken } = props;
    const recentRef = useRef<HTMLDivElement>(null);
    const [isAtTop, setIsAtTop] = useState(true);
    const [scrollPos, setScrollPos] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const others = sessions.filter(s => s.fileName !== pending?.summary.fileName);

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (file.type === 'application/pdf') onUploadFile(file);
        else onInvalidFile();
    };

    const onPick = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file && file.type === 'application/pdf') onUploadFile(file);
    };

    return (
        <>
            <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '1.25rem', alignItems: 'center', zIndex: 10 }}>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                <AccountBadge {...props} variant="home" connectLabel="Connecta amb Google" />
            </div>

            <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div
                    onScroll={e => { setIsAtTop(e.currentTarget.scrollTop < 10); setScrollPos(e.currentTarget.scrollTop); }}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    style={{
                        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'flex-start', overflowY: 'auto', position: 'relative',
                        background: isDragging ? 'var(--accent-light)' : 'transparent',
                        transition: 'background 0.3s ease',
                    }}
                >
                    {isDragging && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59, 130, 246, 0.1)', backdropFilter: 'blur(4px)', pointerEvents: 'none' }}>
                            <div style={{ padding: '3rem 5rem', border: '4px dashed var(--accent)', borderRadius: '3rem', background: 'var(--bg-secondary)', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', transform: 'scale(1.1)', transition: 'transform 0.2s' }}>
                                <div style={{ width: '80px', height: '80px', background: 'var(--accent-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Upload size={40} color="var(--accent)" />
                                </div>
                                <HandwrittenTitle size="3rem" color="blue">Deixa anar el PDF</HandwrittenTitle>
                            </div>
                        </div>
                    )}

                    {others.length > 0 && (
                        <button
                            onClick={() => recentRef.current?.scrollIntoView({ behavior: 'smooth' })}
                            style={{
                                position: 'fixed', left: '2rem', bottom: '2rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-secondary)',
                                border: '1px solid var(--border)', borderRadius: '2rem', padding: '0.6rem 1.2rem',
                                color: 'var(--text-secondary)', opacity: isAtTop ? 0.7 : 0, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
                                transition: 'all 0.3s', zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                pointerEvents: isAtTop ? 'auto' : 'none',
                                transform: isAtTop ? 'none' : 'translateY(10px)',
                            }}
                            onMouseEnter={e => { if (isAtTop) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                            onMouseLeave={e => { if (isAtTop) { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.transform = 'none'; } }}
                        >
                            <span>Darreres sessions</span>
                            <ArrowDown size={16} />
                        </button>
                    )}

                    <div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '25vh 2rem 4rem', flexShrink: 0 }}>
                        <div style={{ marginBottom: '14rem', transform: 'rotate(-4.5deg)', flexShrink: 0 }}>
                            <FlowGradingLogo size="13rem" rotation={-7} extraThick={true} scrollProgress={Math.min(1, Math.max(0, scrollPos / LOGO_FADE_DISTANCE))} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', alignItems: 'center', marginBottom: '6rem', flexShrink: 0, width: '100%', maxWidth: '900px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: 'center', width: '100%' }}>
                                <div style={{ flex: '1', minWidth: '20rem', maxWidth: '26rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <label className="btn btn-primary" style={{ padding: '1.2rem 2rem', fontSize: '1.2rem', height: '5.2rem', borderRadius: '1.5rem', boxShadow: '0 10px 25px var(--accent-light)', width: '100%', cursor: 'pointer' }}>
                                        <input type="file" accept="application/pdf" onChange={onPick} style={{ display: 'none' }} />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '2.8rem', height: '2.8rem', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Upload size={24} />
                                            </div>
                                            <div style={{ textAlign: 'left' }}>
                                                <div style={{ fontWeight: 800 }}>Nou PDF</div>
                                                <div style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 600 }}>Comença de zero</div>
                                            </div>
                                        </div>
                                    </label>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', padding: '0 1rem' }}>
                                        Puja el fitxer combinat amb tots els exàmens per començar la configuració.
                                    </p>
                                </div>

                                {pending && (
                                    <div style={{ flex: '1', minWidth: '20rem', maxWidth: '26rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => onResume(pending.summary, pending.file)}
                                            style={{ padding: '1.2rem 2rem', fontSize: '1.2rem', height: '5.2rem', borderRadius: '1.5rem', width: '100%', border: '2px solid var(--accent)', background: 'var(--bg-secondary)', cursor: 'pointer' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                                                <div style={{ width: '2.8rem', height: '2.8rem', background: 'var(--accent-light)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <RefreshCw size={24} color="var(--accent)" />
                                                </div>
                                                <div style={{ textAlign: 'left', flex: 1, overflow: 'hidden' }}>
                                                    <div style={{ fontWeight: 800, color: 'var(--accent)' }}>Continuar PDF</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {pending.summary.fileName}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--success)' }}>{pending.summary.progress || 0}%</div>
                                            </div>
                                        </button>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{pending.summary.studentCount || 0} alumnes detectats</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                {accessToken && (
                                                    <CloudToggle
                                                        on={pending.summary.cloudSyncPDF}
                                                        onToggle={e => { e.stopPropagation(); onToggleCloud(pending.summary, true); }}
                                                        label={`Núvol ${pending.summary.cloudSyncPDF ? 'Sí' : 'No'}`}
                                                        style={{ gap: '0.5rem', padding: '0.2rem 0.6rem', background: 'var(--bg-tertiary)70' }}
                                                    />
                                                )}
                                                <button
                                                    onClick={e => { e.stopPropagation(); onDelete(pending.summary); }}
                                                    style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                                                >
                                                    Descarta sessió
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {others.length > 0 && (
                        <div ref={recentRef} style={{ width: '100%', maxWidth: '1000px', flexShrink: 0, paddingBottom: '8rem' }}>
                            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                                <HandwrittenTitle size="2.4rem" color="purple">Darreres sessions</HandwrittenTitle>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {others.map(s => (
                                    <SessionCard
                                        key={s.fileName}
                                        session={s}
                                        showCloudToggle={!!accessToken}
                                        onOpen={() => onResume(s)}
                                        onDelete={() => onDelete(s)}
                                        onRename={alias => onRename(s, alias)}
                                        onToggleCloud={() => onToggleCloud(s, false)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </>
    );
}
