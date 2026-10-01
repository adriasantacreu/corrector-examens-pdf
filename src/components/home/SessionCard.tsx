import { useState } from 'react';
import { Clock, Cloud, Pencil, Trash2 } from 'lucide-react';
import type { SessionSummary } from '../../domain/session';
import CloudToggle from '../common/CloudToggle';

/** Targeta d'una sessió recent a la pantalla d'inici. */
export default function SessionCard({ session, showCloudToggle, onOpen, onDelete, onRename, onToggleCloud }: {
    session: SessionSummary;
    showCloudToggle: boolean;
    onOpen: () => void;
    onDelete: () => void;
    onRename: (alias: string | null) => void;
    onToggleCloud: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const s = session;

    return (
        <div
            className="card"
            style={{ padding: '1.5rem', cursor: editing ? 'default' : 'pointer', transition: 'all 0.2s ease', position: 'relative', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}
            onMouseEnter={e => { if (!editing) { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px -10px rgba(0,0,0,0.1)'; } }}
            onMouseLeave={e => { if (!editing) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; } }}
            onClick={() => !editing && onOpen()}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', overflow: 'hidden', flex: 1, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                        {editing ? (
                            <input
                                autoFocus
                                defaultValue={s.sessionAlias || s.fileName}
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.stopPropagation();
                                        onRename(e.currentTarget.value.trim() || null);
                                        setEditing(false);
                                    } else if (e.key === 'Escape') {
                                        e.stopPropagation();
                                        setEditing(false);
                                    }
                                }}
                                onBlur={() => setEditing(false)}
                                style={{ width: '100%', padding: '0.2rem 0.5rem', border: '1px solid var(--accent)', borderRadius: '0.25rem', fontSize: '1rem', fontWeight: 800 }}
                            />
                        ) : (
                            <>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {s.sessionAlias || s.fileName}
                                    {s.isCloud && <Cloud size={14} color="var(--accent)" />}
                                </span>
                                <button
                                    onClick={e => { e.stopPropagation(); setEditing(true); }}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center', opacity: 0.5 }}
                                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
                                    title="Canviar nom"
                                >
                                    <Pencil size={12} />
                                </button>
                            </>
                        )}
                    </div>
                    {s.sessionAlias && !editing && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.fileName}
                        </span>
                    )}
                </div>
                <button
                    onClick={e => { e.stopPropagation(); onDelete(); }}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px', opacity: 0.6 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; }}
                ><Trash2 size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}><Clock size={14} /> {new Date(s.lastModified).toLocaleDateString()}</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.2rem' }}>
                <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progrés</span>
                <span style={{ color: 'var(--success)' }}>{s.progress || 0}%</span>
            </div>
            <div className="progress-bar-container" style={{ marginTop: 0 }}><div className="progress-bar-fill" style={{ width: `${s.progress || 0}%` }}></div></div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{s.studentCount || 0} alumnes detectats</div>
                {showCloudToggle && (
                    <CloudToggle
                        on={s.cloudSyncPDF}
                        onToggle={e => { e.stopPropagation(); onToggleCloud(); }}
                        label={`Núvol ${s.cloudSyncPDF ? 'Sí' : 'No'}`}
                        labelSize="0.6rem"
                        style={{ background: 'var(--bg-tertiary)70' }}
                    />
                )}
            </div>
        </div>
    );
}
