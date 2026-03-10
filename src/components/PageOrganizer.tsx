import { useState, useEffect } from 'react';
import { Trash2, Plus, ChevronDown, ChevronUp, GripVertical, Check, ChevronLeft, Sun, Moon, ArrowDown, ArrowUp, LogOut, ChevronsUp, ChevronsDown, RotateCcw } from 'lucide-react';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas } from '../utils/pdfUtils';
import HandwrittenTitle from './HandwrittenTitle';
import FlowGradingLogo from './FlowGradingLogo';

interface StudentGroup {
    id: string;
    name: string;
    pageIndexes: number[]; // 1-indexed absolute PDF pages
}

interface Props {
    pdfDoc: PDFDocumentProxy;
    initialGroups: StudentGroup[];
    pagesPerExam: number;
    onConfirm: (groups: StudentGroup[]) => void;
    onBack: () => void;
    theme?: 'light' | 'dark';
    onToggleTheme?: () => void;
    accessToken: string | null;
    userEmail: string | null;
    userPicture: string | null;
    onAuthorize: () => void;
    onLogout: () => void;
}

export default function PageOrganizer({ 
    pdfDoc, initialGroups, pagesPerExam, onConfirm, onBack, theme, onToggleTheme,
    accessToken, userEmail, userPicture, onAuthorize, onLogout
}: Props) {
    const [groups, setGroups] = useState<StudentGroup[]>(initialGroups);
    const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
    const [dragState, setDragState] = useState<{ fromGroup: number; fromPage: number } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const totalPages = pdfDoc.numPages;
        
        const generateOrder = () => {
            const order: number[] = [];
            const processed = new Set<number>();
            
            for (let p = 0; p < pagesPerExam; p++) {
                for (let i = 0; i < initialGroups.length; i++) {
                    const page = initialGroups[i].pageIndexes[p];
                    if (page && !processed.has(page)) {
                        order.push(page);
                        processed.add(page);
                    }
                }
                const lastP = pagesPerExam - 1 - p;
                if (lastP > p) {
                    for (let i = 0; i < initialGroups.length; i++) {
                        const page = initialGroups[i].pageIndexes[lastP];
                        if (page && !processed.has(page)) {
                            order.push(page);
                            processed.add(page);
                        }
                    }
                }
            }
            
            for (let i = 1; i <= totalPages; i++) {
                if (!processed.has(i)) order.push(i);
            }
            return order;
        };

        const loadOrdered = async () => {
            const order = generateOrder();
            for (const pageNum of order) {
                if (cancelled) return;
                try {
                    const canvas = document.createElement('canvas');
                    await renderPDFPageToCanvas(pdfDoc, pageNum, canvas, 0.5, false);
                    const url = canvas.toDataURL('image/jpeg', 0.7);
                    if (!cancelled) {
                        setThumbnails(prev => ({ ...prev, [pageNum]: url }));
                    }
                } catch { }
            }
        };
        
        loadOrdered();
        return () => { cancelled = true; };
    }, [pdfDoc, initialGroups, pagesPerExam]);

    const handleReset = () => {
        if (window.confirm("Vols restablir la distribució original de pàgines? Es perdran tots els canvis manuals.")) {
            setGroups(initialGroups);
        }
    };

    const ripplePushForward = (groupIdx: number) => {
        setGroups(prev => {
            const next = prev.map(g => ({ ...g, pageIndexes: [...g.pageIndexes] }));
            for (let i = groupIdx; i < next.length - 1; i++) {
                if (next[i].pageIndexes.length === 0) continue;
                const lastPage = next[i].pageIndexes.pop()!;
                next[i + 1].pageIndexes.unshift(lastPage);
            }
            return next;
        });
    };

    const ripplePullBackward = (groupIdx: number) => {
        setGroups(prev => {
            const next = prev.map(g => ({ ...g, pageIndexes: [...g.pageIndexes] }));
            for (let i = groupIdx; i < next.length - 1; i++) {
                if (next[i + 1].pageIndexes.length === 0) break;
                const firstPageOfNext = next[i + 1].pageIndexes.shift()!;
                next[i].pageIndexes.push(firstPageOfNext);
            }
            return next;
        });
    };

    const shiftOneDown = (gi: number) => {
        if (gi >= groups.length - 1) return;
        setGroups(prev => {
            const next = prev.map(g => ({ ...g, pageIndexes: [...g.pageIndexes] }));
            if (next[gi].pageIndexes.length > 0) {
                const page = next[gi].pageIndexes.pop()!;
                next[gi + 1].pageIndexes.unshift(page);
            }
            return next;
        });
    };

    const shiftOneUp = (gi: number) => {
        if (gi <= 0) return;
        setGroups(prev => {
            const next = prev.map(g => ({ ...g, pageIndexes: [...g.pageIndexes] }));
            if (next[gi].pageIndexes.length > 0) {
                const page = next[gi].pageIndexes.shift()!;
                next[gi - 1].pageIndexes.push(page);
            }
            return next;
        });
    };

    const removePage = (gi: number, pi: number) => {
        setGroups(prev => {
            const next = prev.map(g => ({ ...g, pageIndexes: [...g.pageIndexes] }));
            next[gi].pageIndexes.splice(pi, 1);
            return next;
        });
    };

    const removeGroup = (idx: number) => setGroups(prev => prev.filter((_, i) => i !== idx));
    
    const moveGroupUp = (idx: number) => {
        if (idx === 0) return;
        setGroups(prev => {
            const copy = [...prev];
            [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
            return copy;
        });
    };

    const moveGroupDown = (idx: number) => {
        if (idx === groups.length - 1) return;
        setGroups(prev => {
            const copy = [...prev];
            [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
            return copy;
        });
    };

    const handleDragStart = (groupIdx: number, pageIdx: number) => setDragState({ fromGroup: groupIdx, fromPage: pageIdx });
    
    const handleDrop = (toGroupIdx: number) => {
        if (!dragState) return;
        if (dragState.fromGroup === toGroupIdx) { setDragState(null); return; }
        setGroups(prev => {
            const copy = prev.map(g => ({ ...g, pageIndexes: [...g.pageIndexes] }));
            const [page] = copy[dragState.fromGroup].pageIndexes.splice(dragState.fromPage, 1);
            copy[toGroupIdx].pageIndexes.push(page);
            return copy;
        });
        setDragState(null);
    };

    const inconsistentCount = groups.filter(g => g.pageIndexes.length !== pagesPerExam).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)' }}>
            <header className="header">
                <div style={{ flex: 1 }}><button className="btn-icon" onClick={onBack} title="Enrere"><ChevronLeft size={28} /></button></div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><FlowGradingLogo size="2.2rem" /></div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '1.25rem', alignItems: 'center' }}>
                    <button className="btn-icon" onClick={onToggleTheme}>{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</button>
                    
                    {accessToken ? (
                        <div style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 1rem', 
                            background: 'var(--bg-tertiary)', borderRadius: '2rem', border: '1px solid var(--border)',
                            height: '42px'
                        }}>
                            {userPicture ? (
                                <img src={userPicture} alt="User" style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--accent)', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>{userEmail?.[0].toUpperCase()}</div>
                            )}
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{userEmail?.split('@')[0]}</span>
                            <button onClick={onLogout} className="btn-icon" style={{ padding: '2px' }}><LogOut size={14} color="var(--danger)" /></button>
                        </div>
                    ) : (
                        <button className="btn-google" onClick={onAuthorize} style={{ height: '42px', padding: '0 1.25rem' }}>
                            <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" style={{ width: '18px' }} />
                            <span style={{ fontWeight: 700 }}>Connecta</span>
                        </button>
                    )}

                    <button className="btn btn-primary" onClick={() => onConfirm(groups.filter(g => g.pageIndexes.length > 0))}><Check size={18} /> Confirmar</button>
                </div>
            </header>

            <main style={{ flex: 1, overflow: 'auto', padding: '2.5rem' }}>
                <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <HandwrittenTitle size="3rem" color="purple">Organitzador de pàgines</HandwrittenTitle>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '1.1rem' }}>
                                Ajusta l'ordre dels exàmens. Utilitza les fletxes per desplaçar pàgines. Les fletxes dobles mouen en cascada.
                                {inconsistentCount > 0 && <span style={{ color: 'var(--danger)', marginLeft: '1rem', fontWeight: 700 }}>⚠️ {inconsistentCount} alumnes amb error</span>}
                            </p>
                        </div>
                        <button className="btn btn-secondary" onClick={handleReset} style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                            <RotateCcw size={18} /> Restablir original
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {groups.map((group, gi) => {
                            const isErr = group.pageIndexes.length !== pagesPerExam;
                            return (
                                <div key={group.id} onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(gi)} className="card" style={{ padding: '1.5rem', border: isErr ? '1px solid var(--danger)' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1.5rem', background: isErr ? 'rgba(239, 68, 68, 0.01)' : 'var(--bg-secondary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '220px', flexShrink: 0 }}>
                                        <GripVertical size={16} color="var(--text-secondary)" />
                                        <input value={group.name} onChange={e => setGroups(prev => prev.map((g, i) => i === gi ? { ...g, name: e.target.value } : g))} style={{ fontWeight: 800, fontSize: '0.9rem', border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', width: '100%' }} />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '40px' }}>
                                        {gi > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <button className="btn btn-secondary" onClick={() => ripplePullBackward(gi - 1)} title="Moure EN CASCADA amunt" style={{ padding: '0.2rem', borderRadius: '0.4rem', height: '28px', border: '1px solid var(--accent)' }}>
                                                    <ChevronsUp size={16} color="var(--accent)" />
                                                </button>
                                                <button className="btn btn-secondary" onClick={() => shiftOneUp(gi)} title="Moure només 1 pàgina amunt" style={{ padding: '0.2rem', borderRadius: '0.4rem', height: '28px' }}>
                                                    <ArrowUp size={14} />
                                                </button>
                                            </div>
                                        )}
                                        {gi < groups.length - 1 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <button className="btn btn-secondary" onClick={() => shiftOneDown(gi)} title="Moure només 1 pàgina avall" style={{ padding: '0.2rem', borderRadius: '0.4rem', height: '28px' }}>
                                                    <ArrowDown size={14} />
                                                </button>
                                                <button className="btn btn-secondary" onClick={() => ripplePushForward(gi)} title="Moure EN CASCADA avall" style={{ padding: '0.2rem', borderRadius: '0.4rem', height: '28px', border: '1px solid var(--accent)' }}>
                                                    <ChevronsDown size={16} color="var(--accent)" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ flex: 1, display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1rem', background: 'var(--bg-tertiary)20', borderRadius: '1rem', minHeight: '240px' }}>
                                        {group.pageIndexes.map((p, pi) => (
                                            <div key={`${p}-${pi}`} draggable onDragStart={() => handleDragStart(gi, pi)} style={{ position: 'relative', cursor: 'grab', background: 'white', borderRadius: '0.6rem', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                                                {thumbnails[p] ? <img src={thumbnails[p]} alt={p.toString()} style={{ height: '220px', width: 'auto', display: 'block' }} /> : <div style={{ height: '220px', width: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>Carregant...</div>}
                                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)', color: 'white', fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', padding: '4px 0' }}>p.{p}</div>
                                                <button onClick={() => removePage(gi, pi)} style={{ position: 'absolute', top: 0, right: 0, background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '0 0 0 8px', padding: '6px', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                            </div>
                                        ))}
                                        {group.pageIndexes.length === 0 && (
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Sense pàgines</div>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '120px', justifyContent: 'flex-end' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isErr ? 'var(--danger)' : 'var(--success)' }}>{group.pageIndexes.length}/{pagesPerExam}</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <button onClick={() => moveGroupUp(gi)} className="btn-icon" style={{ padding: '2px', height: '24px' }}><ChevronUp size={16} /></button>
                                            <button onClick={() => moveGroupDown(gi)} className="btn-icon" style={{ padding: '2px', height: '24px' }}><ChevronDown size={16} /></button>
                                        </div>
                                        <button onClick={() => removeGroup(gi)} className="btn-icon" style={{ padding: '4px', color: 'var(--danger)' }}><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            );
                        })}
                        <button onClick={() => setGroups([...groups, { id: `s_${Date.now()}`, name: `Alumne ${groups.length + 1}`, pageIndexes: [] }])} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', border: '2px dashed var(--border)', background: 'transparent', color: 'var(--text-secondary)', padding: '2rem', cursor: 'pointer', borderRadius: '1.5rem' }}>
                            <Plus size={24} /> <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Afegir nou alumne</span>
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
