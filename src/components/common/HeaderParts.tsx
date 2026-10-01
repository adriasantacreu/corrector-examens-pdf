/**
 * Peces de la capçalera, compartides per totes les pantalles (abans cada pantalla en tenia una còpia).
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, LogOut, Moon, Pencil, Sun } from 'lucide-react';
import type { ThemeMode } from '../../types';
import FlowGradingLogo from './FlowGradingLogo';

const GOOGLE_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg';

export function AppHeader({ left, right, leftGap = '1rem', rightGap = '1.25rem', style, children }: {
    left?: ReactNode;
    right?: ReactNode;
    leftGap?: string;
    rightGap?: string;
    style?: CSSProperties;
    children?: ReactNode;
}) {
    return (
        <header className="header" style={style}>
            {children}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: leftGap, minWidth: 0 }}>
                {left}
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <FlowGradingLogo size="2.2rem" animate={false} />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: rightGap, justifyContent: 'flex-end' }}>
                {right}
            </div>
        </header>
    );
}

export function BackButton({ onClick }: { onClick: () => void }) {
    return (
        <button className="btn-icon" onClick={onClick} title="Enrere" style={{ color: 'var(--text-primary)', padding: '0.5rem', background: 'transparent', border: 'none', flexShrink: 0 }}>
            <ChevronLeft size={28} />
        </button>
    );
}

/** Nom de la sessió a la capçalera; clicant-hi es pot canviar l'àlies. */
export function SessionTitle({ fileName, alias, onRename }: {
    fileName: string;
    alias: string | null;
    onRename: (alias: string | null) => void;
}) {
    const [editing, setEditing] = useState(false);
    const commit = (value: string) => {
        const v = value.trim();
        onRename(v === fileName ? null : (v || null));
        setEditing(false);
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
            {editing ? (
                <input
                    autoFocus
                    defaultValue={alias || fileName}
                    onKeyDown={e => {
                        if (e.key === 'Enter') commit(e.currentTarget.value);
                        else if (e.key === 'Escape') setEditing(false);
                    }}
                    onBlur={e => { if (editing) commit(e.target.value); }}
                    style={{
                        background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--accent)',
                        borderRadius: '0.4rem', padding: '0.2rem 0.6rem', fontSize: '1rem', fontWeight: 800, width: '100%', maxWidth: '300px',
                    }}
                />
            ) : (
                <div
                    onClick={() => setEditing(true)}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, padding: '0.2rem 0.5rem', borderRadius: '0.4rem', transition: 'background 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)50'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    title="Clic per canviar el nom de la sessió"
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {alias || fileName}
                        </span>
                        <Pencil size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                    </div>
                    {alias && alias !== fileName && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '-2px' }}>
                            {fileName}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export function ThemeToggle({ theme, onToggle, title }: { theme: ThemeMode; onToggle: () => void; title?: string }) {
    return (
        <button className="btn-icon" onClick={onToggle} title={title}>
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
    );
}

export interface AccountProps {
    accessToken: string | null;
    userEmail: string | null;
    userPicture: string | null;
    onAuthorize?: () => void;
    onLogout?: () => void;
}

/** Avatar i botó de sortir, o el botó "Connecta" si no hi ha sessió de Google. */
export function AccountBadge({ accessToken, userEmail, userPicture, onAuthorize, onLogout, variant = 'header', connectLabel = 'Connecta', connectStyle }: AccountProps & {
    variant?: 'header' | 'home';
    connectLabel?: string;
    connectStyle?: CSSProperties;
}) {
    if (accessToken) {
        const initial = userEmail?.[0].toUpperCase();
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 1rem', background: 'var(--bg-tertiary)', borderRadius: '2rem', border: '1px solid var(--border)', height: '42px' }}>
                {userPicture ? (
                    <img src={userPicture} alt="User" style={variant === 'home'
                        ? { width: '28px', height: '28px', borderRadius: '50%' }
                        : { width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--accent)', objectFit: 'cover' }} />
                ) : (
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>{initial}</div>
                )}
                <span style={variant === 'home' ? { fontSize: '0.85rem', fontWeight: 700 } : { fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{userEmail?.split('@')[0]}</span>
                {onLogout && <button onClick={onLogout} className="btn-icon" style={{ padding: '2px' }}><LogOut size={14} color="var(--danger)" /></button>}
            </div>
        );
    }
    if (!onAuthorize) return null;
    return (
        <button className="btn-google" onClick={onAuthorize} style={connectStyle}>
            <img src={GOOGLE_LOGO} alt="G" style={{ width: '18px' }} />
            <span style={{ fontWeight: 700 }}>{connectLabel}</span>
        </button>
    );
}
