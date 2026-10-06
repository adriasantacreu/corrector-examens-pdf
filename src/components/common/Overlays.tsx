/** Diàleg global, notificació flotant i pantalla de "processant" (l'estètica de targeta de l'app). */
import { Check, CheckCircle, RefreshCw, X, XCircle } from 'lucide-react';
import type { DialogState, ToastState } from '../../state/useDialogs';
import HandwrittenTitle from './HandwrittenTitle';

export function ProcessingOverlay({ message }: { message: string }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
            <div className="card" style={{ textAlign: 'center', padding: '3.5rem', maxWidth: '400px', width: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', boxShadow: '0 30px 60px rgba(0,0,0,0.4)' }}>
                <div className="loader" style={{ width: '50px', height: '50px', border: '4px solid var(--accent-light)', borderTop: '4px solid var(--accent)' }}></div>
                <div style={{ transform: 'rotate(-1deg)' }}>
                    <HandwrittenTitle size="2.2rem" color="blue" noMargin={true}>{message}</HandwrittenTitle>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Això pot trigar uns segons...</p>
            </div>
        </div>
    );
}

/** Notificació a la cantonada inferior dreta. També la fa servir la pantalla de resultats. */
export function ToastCard({ title, text, type, zIndex = 10001, side = 'right', testId }: { title: string; text: string; type?: ToastState['type']; zIndex?: number; side?: 'left' | 'right'; testId?: string }) {
    return (
        <div className="card" role={type === 'error' ? 'alert' : undefined} data-testid={testId} style={{
            position: 'fixed', bottom: '2rem', [side]: '2rem', zIndex,
            width: '320px', padding: '1.25rem 1.5rem',
            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border)',
            textAlign: 'center',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            overflow: 'hidden',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
        }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: type === 'success' ? 'var(--hl-green)' : type === 'error' ? 'var(--hl-red)' : 'var(--hl-purple)' }} />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ transform: 'rotate(-2deg)' }}>
                    <HandwrittenTitle size="1.8rem" color={type === 'success' ? 'green' : type === 'error' ? 'red' : 'purple'} noMargin={true}>
                        {title}
                    </HandwrittenTitle>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
                {type === 'success' ? <CheckCircle size={16} color="var(--success)" /> : type === 'error' ? <XCircle size={16} color="var(--danger)" /> : <RefreshCw size={16} className="spin" color="var(--accent)" />}
                {text}
            </div>
        </div>
    );
}

export function GlobalDialog({ dialog, onConfirm, onCancel, onCheckbox }: {
    dialog: DialogState;
    onConfirm: () => void;
    onCancel: () => void;
    onCheckbox: (checked: boolean) => void;
}) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
            <div className="card" style={{ maxWidth: '480px', width: '90%', padding: '3.5rem 3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '2.5rem', border: '1px solid var(--border)', boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.3)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8px', background: dialog.type === 'alert' ? 'var(--hl-yellow)' : 'var(--hl-blue)' }} />
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '-0.5rem' }}>
                    <div style={{ transform: 'rotate(-2deg)' }}>
                        <HandwrittenTitle size="3rem" color={dialog.type === 'alert' ? 'yellow' : 'blue'} noMargin={true}>
                            {dialog.title}
                        </HandwrittenTitle>
                    </div>
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.15rem', lineHeight: '1.6', fontWeight: 600 }}>
                    {dialog.message}
                </div>
                {dialog.checkboxLabel && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', cursor: 'pointer', marginTop: '-1rem' }}>
                        <input type="checkbox" checked={dialog.checkboxChecked} onChange={e => onCheckbox(e.target.checked)} />
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{dialog.checkboxLabel}</span>
                    </label>
                )}
                <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', width: '100%' }}>
                    {dialog.type === 'confirm' && (
                        <button className="btn btn-secondary" style={{ flex: 1, fontWeight: 800, padding: '0.8rem' }} onClick={onCancel}>
                            <X size={18} /> {dialog.cancelLabel ?? 'Cancel·lar'}
                        </button>
                    )}
                    <button className="btn btn-primary" style={{ flex: 1, fontWeight: 800, padding: '0.8rem' }} onClick={onConfirm}>
                        <Check size={20} /> {dialog.confirmLabel ?? "D'acord"}
                    </button>
                </div>
            </div>
        </div>
    );
}
