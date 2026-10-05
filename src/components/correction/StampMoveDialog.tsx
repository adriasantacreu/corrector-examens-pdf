/**
 * Diàleg en moure el segell de nota: aplicar la posició a tots els alumnes, només a aquest, o cancel·lar.
 */
import { AlertTriangle } from 'lucide-react';

interface Props {
    onAll: () => void;
    onThisStudent: () => void;
    onCancel: () => void;
}

export default function StampMoveDialog({ onAll, onThisStudent, onCancel }: Props) {
    return (
        <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            zIndex: 2000, display: 'flex', flexDirection: 'column', gap: '1rem', width: '320px',
            animation: 'slideUp 0.3s ease-out',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle style={{ color: 'var(--accent)' }} size={24} />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Guardar Posició</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Vols que aquesta posició s'apliqui a tots els alumnes per defecte en aquest exercici?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={onAll} className="btn-primary" style={{ padding: '0.6rem', fontSize: '0.85rem' }}>
                    Per a TOTS els alumnes
                </button>
                <button onClick={onThisStudent}
                    style={{ padding: '0.6rem', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}>
                    Només per a aquest alumne
                </button>
                <button onClick={onCancel}
                    style={{ padding: '0.4rem', fontSize: '0.75rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}>
                    Cancel·lar
                </button>
            </div>
        </div>
    );
}
