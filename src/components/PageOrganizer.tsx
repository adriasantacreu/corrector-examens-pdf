import { useState, useEffect } from 'react';
import { Trash2, Plus, ChevronDown, ChevronUp, GripVertical, Check, ChevronLeft, ChevronRight, Sun, Moon, ArrowDown, ArrowUp, LogOut, ChevronsUp, ChevronsDown, RotateCcw, X, FileCheck, Pencil } from 'lucide-react';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas } from '../utils/pdfUtils';
import HandwrittenTitle from './HandwrittenTitle';
import FlowGradingLogo from './FlowGradingLogo';

interface StudentGroup {
    id: string;
    name: string;
    pageIndexes: number[]; // 1-indexed absolute PDF pages
    ignoredPageIndexes?: number[]; // 1-indexed absolute PDF pages
}

interface Props {
    pdfDoc: PDFDocumentProxy;
    solutionPdfDoc?: PDFDocumentProxy | null;
    initialGroups: StudentGroup[];
    initialSolutionPages?: number[];
    pagesPerExam: number;
    currentFileName: string | null;
    sessionAlias: string | null;
    onUpdateSessionAlias: (alias: string | null) => void;
    onConfirm: (groups: StudentGroup[], solutionPages: number[]) => void;
    onBack: () => void;
    theme?: 'light' | 'dark';
    onToggleTheme?: () => void;
    accessToken: string | null;
    userEmail: string | null;
    userPicture: string | null;
    onAuthorize: () => void;
    onLogout: () => void;
    showAlert: (title: string, message: string) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export default function PageOrganizer({
    pdfDoc, solutionPdfDoc, initialGroups, initialSolutionPages = [], pagesPerExam,
    currentFileName, sessionAlias, onUpdateSessionAlias,
    onConfirm, onBack, theme, onToggleTheme,
    accessToken, userEmail, userPicture, onAuthorize, onLogout,
    showConfirm
}: Props) {
    const [groups, setGroups] = useState<StudentGroup[]>(() => initialGroups.map(g => ({ ...g, ignoredPageIndexes: g.ignoredPageIndexes || [] })));
    const [solutionPageIndexes, setSolutionPageIndexes] = useState<number[]>(initialSolutionPages);
    const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
    const [solutionThumbnails, setSolutionThumbnails] = useState<Record<number, string>>({});
    const [dragState, setDragState] = useState<{ fromGroup: number | 'solution'; fromPage: number } | null>(null);
    const [hoveredThumb, setHoveredThumb] = useState<string | null>(null);
    const [isEditingHeaderAlias, setIsEditingHeaderAlias] = useState(false);

    useEffect(() => {
        if (solutionPdfDoc && solutionPageIndexes.length === 0) {
            setSolutionPageIndexes(Array.from({ length: solutionPdfDoc.numPages }, (_, i) => i + 1));
        }
    }, [solutionPdfDoc]);

    useEffect(() => {
        let cancelled = false;

        const loadSolutionThumbs = async () => {
            if (!solutionPdfDoc) return;
            for (let i = 1; i <= solutionPdfDoc.numPages; i++) {
                if (cancelled) return;
                try {
                    const canvas = document.createElement('canvas');
                    await renderPDFPageToCanvas(solutionPdfDoc, i, canvas, 0.5, false);
                    const url = canvas.toDataURL('image/jpeg', 0.7);
                    if (!cancelled) setSolutionThumbnails(prev => ({ ...prev, [i]: url }));
                } catch { }
            }
        };

        loadSolutionThumbs();
        return () => { cancelled = true; };
    }, [solutionPdfDoc]);

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
        showConfirm("Restablir distribució", "Vols restablir la distribució original de pàgines? Es perdran tots els canvis manuals.", () => {
            setGroups(prevGroups => prevGroups.map((g, i) => ({
                ...g,
                pageIndexes: Array.from({ length: pagesPerExam }, (_, p) => i * pagesPerExam + p + 1),
                ignoredPageIndexes: []
            })));
            if (solutionPdfDoc) {
                setSolutionPageIndexes(Array.from({ length: solutionPdfDoc.numPages }, (_, i) => i + 1));
            }
        });
    };

    const toggleIgnore = (gi: number, pageNum: number) => {
        setGroups(prev => prev.map((g, i) => {
            if (i !== gi) return g;
            const ignored = g.ignoredPageIndexes || [];
            const isIgnored = ignored.includes(pageNum);
            return {
                ...g,
                ignoredPageIndexes: isIgnored
                    ? ignored.filter(p => p !== pageNum)
                    : [...ignored, pageNum]
            };
        }));
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

    const addGroup = () => setGroups([...groups, { id: `s_${Date.now()}`, name: `Alumne ${groups.length + 1}`, pageIndexes: [], ignoredPageIndexes: [] }]);

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

    const handleDragStart = (groupIdx: number | 'solution', pageIdx: number) => setDragState({ fromGroup: groupIdx, fromPage: pageIdx });

    const handleDrop = (toGroupIdx: number | 'solution') => {
        if (!dragState) return;
        if (dragState.fromGroup === toGroupIdx) { setDragState(null); return; }

        let movedPage: number | null = null;

        if (dragState.fromGroup === 'solution') {
            setSolutionPageIndexes(prev => {
                const next = [...prev];
                [movedPage] = next.splice(dragState.fromPage, 1);
                return next;
            });
        } else {
            setGroups(prev => {
                const next = prev.map(g => ({ ...g, pageIndexes: [...g.pageIndexes] }));
                [movedPage] = next[dragState.fromGroup as number].pageIndexes.splice(dragState.fromPage, 1);
                return next;
            });
        }

        // We use a small timeout to let the first state update finish before adding the page to the new home
        // This is a safe way to handle cross-state drag and drop
        setTimeout(() => {
            if (movedPage === null) return;
            if (toGroupIdx === 'solution') {
                setSolutionPageIndexes(prev => [...prev, movedPage!]);
            } else {
                setGroups(prev => {
                    const next = prev.map((g, i) => i === toGroupIdx ? { ...g, pageIndexes: [...g.pageIndexes, movedPage!] } : g);
                    return next;
                });
            }
        }, 0);

        setDragState(null);
    };

    const swapPages = (groupIdx: number, idxA: number, idxB: number) => {
        setGroups(prev => {
            const next = prev.map((g, i) => {
                if (i !== groupIdx) return g;
                const newPages = [...g.pageIndexes];
                [newPages[idxA], newPages[idxB]] = [newPages[idxB], newPages[idxA]];
                return { ...g, pageIndexes: newPages };
            });
            return next;
        });
    };

    const inconsistentCount = groups.filter(g => g.pageIndexes.length !== pagesPerExam).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)', overflowY: 'auto' }}>
            <header className="header">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                    <button className="btn-icon" onClick={onBack} title="Enrere" style={{ color: 'var(--text-primary)', padding: '0.5rem', background: 'transparent', border: 'none', flexShrink: 0 }}>
                        <ChevronLeft size={28} />
                    </button>
                    {currentFileName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                            {isEditingHeaderAlias ? (
                                <input
                                    autoFocus
                                    defaultValue={sessionAlias || currentFileName}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = e.currentTarget.value.trim();
                                            onUpdateSessionAlias(val === currentFileName ? null : (val || null));
                                            setIsEditingHeaderAlias(false);
                                        } else if (e.key === 'Escape') {
                                            setIsEditingHeaderAlias(false);
                                        }
                                    }}
                                    onBlur={(e) => {
                                        const val = e.target.value.trim();
                                        onUpdateSessionAlias(val === currentFileName ? null : (val || null));
                                        setIsEditingHeaderAlias(false);
                                    }}
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--accent)',
                                        borderRadius: '0.4rem',
                                        padding: '0.2rem 0.6rem',
                                        fontSize: '1rem',
                                        fontWeight: 800,
                                        width: '100%',
                                        maxWidth: '300px'
                                    }}
                                />
                            ) : (
                                <div
                                    onClick={() => setIsEditingHeaderAlias(true)}
                                    style={{
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        minWidth: 0,
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '0.4rem',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)50'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    title="Clic per canviar el nom de la sessió"
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                        <span style={{
                                            fontSize: '1.1rem',
                                            fontWeight: 800,
                                            color: 'var(--text-primary)',
                                            opacity: 0.8,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {sessionAlias || currentFileName}
                                        </span>
                                        <Pencil size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                                    </div>
                                    {sessionAlias && sessionAlias !== currentFileName && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '-2px' }}>
                                            {currentFileName}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><FlowGradingLogo size="2.2rem" animate={false} /></div>
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

                    <button className="btn btn-primary" onClick={() => onConfirm(groups.filter(g => g.pageIndexes.length > 0), solutionPageIndexes)}><Check size={18} /> Confirmar</button>
                </div>
            </header>

            <main style={{ flex: 1, padding: '2.5rem' }}>
                <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <HandwrittenTitle size="3rem" color="purple" noMargin={true}>Organitzador de pàgines</HandwrittenTitle>
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
                        {solutionPdfDoc && (
                            <div className="card" style={{ padding: '1.5rem', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'var(--accent-light)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '220px', flexShrink: 0 }}>
                                    <FileCheck size={16} color="var(--accent)" />
                                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--accent)' }}>SOLUCIONARI</span>
                                </div>

                                <div style={{ width: '40px' }} />

                                <div style={{ flex: 1, display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1rem', background: 'var(--bg-tertiary)20', borderRadius: '1rem', minHeight: '240px' }}>
                                    {solutionPageIndexes.map((p, pi) => {
                                        const isHovered = hoveredThumb === `solution-${pi}`;
                                        return (
                                            <div
                                                key={`sol-${p}-${pi}`}
                                                draggable
                                                onDragStart={() => handleDragStart('solution', pi)}
                                                onMouseEnter={() => setHoveredThumb(`solution-${pi}`)}
                                                onMouseLeave={() => setHoveredThumb(null)}
                                                style={{ position: 'relative', cursor: 'grab', background: 'white', borderRadius: '0.6rem', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden', flexShrink: 0 }}
                                            >
                                                {solutionThumbnails[p] ? <img src={solutionThumbnails[p]} alt={p.toString()} style={{ height: '220px', width: 'auto', display: 'block' }} /> : <div style={{ height: '220px', width: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>Carregant...</div>}

                                                {/* Swap controls overlay */}
                                                <div style={{
                                                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '0 8px', zIndex: 10, background: 'rgba(0,0,0,0.1)',
                                                    opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: isHovered ? 'auto' : 'none'
                                                }}>
                                                    {pi > 0 ? (
                                                        <button onClick={(e) => { e.stopPropagation(); const next = [...solutionPageIndexes];[next[pi], next[pi - 1]] = [next[pi - 1], next[pi]]; setSolutionPageIndexes(next); }} className="btn-icon" style={{ background: 'white', opacity: 0.9, width: '32px', height: '32px', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                                                            <ChevronLeft size={20} />
                                                        </button>
                                                    ) : <div />}
                                                    {pi < solutionPageIndexes.length - 1 ? (
                                                        <button onClick={(e) => { e.stopPropagation(); const next = [...solutionPageIndexes];[next[pi], next[pi + 1]] = [next[pi + 1], next[pi]]; setSolutionPageIndexes(next); }} className="btn-icon" style={{ background: 'white', opacity: 0.9, width: '32px', height: '32px', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                                                            <ChevronRight size={20} />
                                                        </button>
                                                    ) : <div />}
                                                </div>

                                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)', color: 'white', fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', padding: '4px 0', zIndex: 5 }}>p.{p}</div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div style={{ width: '120px', textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent)' }}>{solutionPageIndexes.length} pàg.</span>
                                </div>
                            </div>
                        )}
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
                                        {group.pageIndexes.map((p, pi) => {
                                            const isHovered = hoveredThumb === `${gi}-${pi}`;
                                            return (
                                                <div
                                                    key={`${p}-${pi}`}
                                                    onMouseEnter={() => setHoveredThumb(`${gi}-${pi}`)}
                                                    onMouseLeave={() => setHoveredThumb(null)}
                                                    style={{
                                                        position: 'relative',
                                                        background: 'white',
                                                        borderRadius: '0.6rem',
                                                        border: groups[gi].ignoredPageIndexes?.includes(p) ? '2px solid var(--accent)' : '1px solid var(--border)',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                                        overflow: 'hidden',
                                                        flexShrink: 0,
                                                        transition: 'all 0.2s',
                                                        transform: isHovered ? 'translateY(-4px)' : 'none'
                                                    }}
                                                >
                                                    <div style={{
                                                        position: 'relative',
                                                        filter: groups[gi].ignoredPageIndexes?.includes(p) ? 'grayscale(1) opacity(0.5)' : 'none',
                                                        transition: 'filter 0.3s, opacity 0.3s'
                                                    }}>
                                                        {thumbnails[p] ? <img src={thumbnails[p]} alt={p.toString()} style={{ height: '220px', width: 'auto', display: 'block' }} /> : <div style={{ height: '220px', width: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>Carregant...</div>}
                                                    </div>

                                                    {/* Central Click Target for Ignoring */}
                                                    <div
                                                        onClick={(e) => { e.stopPropagation(); toggleIgnore(gi, p); }}
                                                        style={{
                                                            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            zIndex: 20, cursor: 'pointer',
                                                            background: (isHovered && !groups[gi].ignoredPageIndexes?.includes(p)) ? 'rgba(0,0,0,0.05)' : 'transparent',
                                                            transition: 'background 0.2s',
                                                            pointerEvents: 'auto'
                                                        }}
                                                        title={groups[gi].ignoredPageIndexes?.includes(p) ? "Marca com a NO buida" : "Marca com a PÀGINA BUIDA"}
                                                    >
                                                        {groups[gi].ignoredPageIndexes?.includes(p) ? (
                                                            <div style={{
                                                                background: 'rgba(0,0,0,0.7)', borderRadius: '50%', padding: '1.2rem',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                                                backdropFilter: 'blur(8px)',
                                                                border: '2px solid rgba(255,255,255,0.2)'
                                                            }}>
                                                                <X size={48} color="white" strokeWidth={3} />
                                                            </div>
                                                        ) : isHovered ? (
                                                            <div style={{
                                                                background: 'rgba(255,255,255,0.9)', borderRadius: '50%', padding: '0.8rem',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: 'var(--text-secondary)',
                                                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                                opacity: 0.8
                                                            }}>
                                                                <X size={32} />
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    {/* Swap controls overlay */}
                                                    <div style={{
                                                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '0 8px', zIndex: 16, pointerEvents: 'none',
                                                        opacity: (isHovered && !groups[gi].ignoredPageIndexes?.includes(p)) ? 1 : 0, transition: 'opacity 0.2s'
                                                    }}>
                                                        {pi > 0 ? (
                                                            <button onClick={(e) => { e.stopPropagation(); swapPages(gi, pi, pi - 1); }} className="btn-icon" style={{ background: 'white', opacity: 0.9, width: '32px', height: '32px', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', pointerEvents: 'auto' }}>
                                                                <ChevronLeft size={20} />
                                                            </button>
                                                        ) : <div />}
                                                        {pi < group.pageIndexes.length - 1 ? (
                                                            <button onClick={(e) => { e.stopPropagation(); swapPages(gi, pi, pi + 1); }} className="btn-icon" style={{ background: 'white', opacity: 0.9, width: '32px', height: '32px', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', pointerEvents: 'auto' }}>
                                                                <ChevronRight size={20} />
                                                            </button>
                                                        ) : <div />}
                                                    </div>

                                                    <div
                                                        draggable
                                                        onDragStart={() => handleDragStart(gi, pi)}
                                                        style={{
                                                            position: 'absolute', bottom: 0, left: 0, right: 0,
                                                            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
                                                            color: 'white', fontSize: '0.8rem', fontWeight: 800,
                                                            textAlign: 'center', padding: '4px 0', zIndex: 25,
                                                            cursor: 'grab'
                                                        }}
                                                        title="Arrossega per moure la pàgina"
                                                    >
                                                        p.{p}
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removePage(gi, pi); }}
                                                        className="btn-icon"
                                                        style={{
                                                            position: 'absolute', top: '6px', right: '6px',
                                                            background: 'rgba(255,255,255,0.8)', color: 'var(--text-secondary)',
                                                            width: '24px', height: '24px', borderRadius: '50%',
                                                            padding: 0, cursor: 'pointer', zIndex: 30,
                                                            border: '1px solid var(--border)',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = 'white'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.8)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            );
                                        })}
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
                        <button onClick={addGroup} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', border: '2px dashed var(--border)', background: 'transparent', color: 'var(--text-secondary)', padding: '2rem', cursor: 'pointer', borderRadius: '1.5rem' }}>
                            <Plus size={24} /> <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Afegir nou alumne</span>
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
