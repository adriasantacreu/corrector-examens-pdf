import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Plus, ChevronDown, ChevronUp, GripVertical, AlertTriangle, Check } from 'lucide-react';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas } from '../utils/pdfUtils';

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
    debugLogs?: string[];
}

// Helper for natural number input (handles commas, dots, negative signs, etc)
function NumericInput({ value, onChange, style, placeholder = "" }: {
    value: number | undefined,
    onChange: (val: number | undefined) => void,
    style?: React.CSSProperties,
    placeholder?: string
}) {
    const [tempValue, setTempValue] = useState<string>(value !== undefined ? value.toString().replace('.', ',') : "");

    useEffect(() => {
        if (value !== undefined) {
            const currentStr = value.toString().replace('.', ',');
            if (parseFloat(tempValue.replace(',', '.')) !== value) {
                setTempValue(currentStr);
            }
        } else if (tempValue !== "") {
            setTempValue("");
        }
    }, [value]);

    return (
        <input
            type="text"
            inputMode="decimal"
            placeholder={placeholder}
            value={tempValue}
            onChange={(e) => {
                const val = e.target.value.replace('.', ',');
                if (val === "" || val === "-" || /^-?\d*,?\d*$/.test(val)) {
                    setTempValue(val);
                    const parsed = parseFloat(val.replace(',', '.'));
                    if (!isNaN(parsed)) {
                        onChange(parsed);
                    } else if (val === "" || val === "-") {
                        onChange(undefined);
                    }
                }
            }}
            onBlur={() => {
                const parsed = parseFloat(tempValue.replace(',', '.'));
                if (isNaN(parsed)) {
                    setTempValue(value !== undefined ? value.toString().replace('.', ',') : "");
                    onChange(value);
                } else {
                    setTempValue(parsed.toString().replace('.', ','));
                    onChange(parsed);
                }
            }}
            style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                padding: '0.2rem 0.3rem',
                fontSize: '0.75rem',
                ...style
            }}
        />
    );
}

export default function PageOrganizer({ pdfDoc, initialGroups, pagesPerExam, onConfirm, onBack, debugLogs = [] }: Props) {
    const [groups, setGroups] = useState<StudentGroup[]>(initialGroups);

    const propagateOrder = (groupIdx: number) => {
        if (!window.confirm("Vols aplicar aquest ordre de pàgines a TOTS els alumnes següents?")) return;
        const templateOrder = groups[groupIdx].pageIndexes;
        setGroups(prev => prev.map((g, i) => i > groupIdx ? { ...g, pageIndexes: [...templateOrder] } : g));
    };

    const shiftPages = (groupIdx: number, delta: number) => {
        if (!window.confirm(`Vols desplaçar ${delta > 0 ? '+' : ''}${delta} totes les pàgines de TOTS els alumnes a partir d'aquest?`)) return;
        const totalPdfPages = pdfDoc.numPages;
        setGroups(prev => prev.map((g, i) => {
            if (i >= groupIdx) {
                return { ...g, pageIndexes: g.pageIndexes.map(p => Math.min(totalPdfPages, Math.max(1, p + delta))) };
            }
            return g;
        }));
    };
    const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
    const [dragState, setDragState] = useState<{ fromGroup: number; fromPage: number } | null>(null);
    const [showLogs, setShowLogs] = useState(false);
    const logsRef = useRef<HTMLDivElement>(null);

    // Load thumbnails progressively - show UI first, stream results
    useEffect(() => {
        const allPages = new Set<number>();
        initialGroups.forEach(g => g.pageIndexes.forEach(p => allPages.add(p)));
        const pages = Array.from(allPages).sort((a, b) => a - b);

        setThumbnails({}); // reset on doc change

        let cancelled = false;
        const BATCH = 3; // render N pages concurrently

        const loadBatch = async () => {
            for (let i = 0; i < pages.length; i += BATCH) {
                if (cancelled) return;
                const batch = pages.slice(i, i + BATCH);
                const results = await Promise.all(
                    batch.map(async page => {
                        try {
                            const canvas = document.createElement('canvas');
                            await renderPDFPageToCanvas(pdfDoc, page, canvas, 0.3);
                            return { page, url: canvas.toDataURL('image/jpeg', 0.65) };
                        } catch { return null; }
                    })
                );
                if (cancelled) return;
                setThumbnails(prev => {
                    const next = { ...prev };
                    results.forEach(r => { if (r) next[r.page] = r.url; });
                    return next;
                });
            }
        };
        loadBatch();
        return () => { cancelled = true; };
    }, [pdfDoc, initialGroups]);

    useEffect(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }, [debugLogs]);

    const removePage = useCallback((groupIdx: number, pageIdx: number) => {
        setGroups(prev => prev.map((g, gi) => {
            if (gi !== groupIdx) return g;
            const newPages = g.pageIndexes.filter((_, pi) => pi !== pageIdx);
            return { ...g, pageIndexes: newPages };
        }));
    }, []);

    const removeGroup = useCallback((groupIdx: number) => {
        setGroups(prev => prev.filter((_, gi) => gi !== groupIdx));
    }, []);

    const addGroupAfter = useCallback((groupIdx: number) => {
        const newGroup: StudentGroup = {
            id: `student_custom_${Date.now()}`,
            name: `Alumne nou`,
            pageIndexes: []
        };
        setGroups(prev => {
            const copy = [...prev];
            copy.splice(groupIdx + 1, 0, newGroup);
            return copy;
        });
    }, []);

    const movePageToGroup = useCallback((fromGroupIdx: number, fromPageIdx: number, toGroupIdx: number) => {
        setGroups(prev => {
            const copy = prev.map(g => ({ ...g, pageIndexes: [...g.pageIndexes] }));
            const [page] = copy[fromGroupIdx].pageIndexes.splice(fromPageIdx, 1);
            copy[toGroupIdx].pageIndexes.push(page);
            return copy;
        });
    }, []);

    // Set the slot of the page at array position `fromIdx` to `newSlot` (both 0-based),
    // and cascade all subsequent pages sequentially: newSlot, newSlot+1, newSlot+2...
    // Pages before fromIdx are kept unchanged. -1 gaps are inserted if newSlot > fromIdx.
    const rebaseFromPage = useCallback((groupIdx: number, fromIdx: number, newSlot: number) => {
        if (newSlot === fromIdx) return;
        setGroups(prev => {
            const group = prev[groupIdx];
            const arr = group.pageIndexes;

            // Pages before the edited position (keep as-is)
            const before = arr.slice(0, fromIdx);

            // Real pages from the edited position onwards (skip any existing -1 gaps)
            const tail = arr.slice(fromIdx).filter(p => p !== -1);

            // Build the new array segment: pad with -1 if newSlot > fromIdx, then tail sequentially
            const gap = Math.max(0, newSlot - fromIdx);
            const newTail = [...Array(gap).fill(-1), ...tail];

            // Merge with before pages
            let merged = [...before, ...newTail];

            // Trim trailing -1s
            while (merged.length > 1 && merged[merged.length - 1] === -1) merged.pop();

            return prev.map((g, gi) => gi === groupIdx ? { ...g, pageIndexes: merged } : g);
        });
    }, []);

    // When user sets a custom page count for student at `groupIdx`,
    // pool all pages from that row onwards and redistribute:
    // that student gets `newCount` pages, each following student gets `pagesPerExam`.
    const recascadeFromGroup = useCallback((groupIdx: number, newCount: number) => {
        if (newCount < 1) return;
        setGroups(prev => {
            // Collect all remaining pages (flat, in order) from groupIdx onwards
            const allRemainingPages: number[] = [];
            for (let i = groupIdx; i < prev.length; i++) {
                allRemainingPages.push(...prev[i].pageIndexes);
            }

            const updated = [...prev];
            let cursor = 0;

            for (let i = groupIdx; i < updated.length; i++) {
                const count = i === groupIdx ? newCount : pagesPerExam;
                updated[i] = {
                    ...updated[i],
                    pageIndexes: allRemainingPages.slice(cursor, cursor + count)
                };
                cursor += count;
                if (cursor >= allRemainingPages.length) {
                    // No more pages — clear the rest
                    for (let j = i + 1; j < updated.length; j++) {
                        updated[j] = { ...updated[j], pageIndexes: [] };
                    }
                    break;
                }
            }
            return updated;
        });
    }, [pagesPerExam]);

    const handleDragStart = (groupIdx: number, pageIdx: number) => {
        setDragState({ fromGroup: groupIdx, fromPage: pageIdx });
    };

    const handleDrop = (toGroupIdx: number) => {
        if (!dragState) return;
        if (dragState.fromGroup === toGroupIdx) { setDragState(null); return; }
        movePageToGroup(dragState.fromGroup, dragState.fromPage, toGroupIdx);
        setDragState(null);
    };

    const moveGroupUp = (idx: number) => {
        if (idx === 0) return;
        setGroups(prev => {
            const copy = [...prev];
            [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
            return copy;
        });
    };

    const moveGroupDown = (idx: number) => {
        setGroups(prev => {
            if (idx >= prev.length - 1) return prev;
            const copy = [...prev];
            [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
            return copy;
        });
    };

    const inconsistentGroups = groups.filter(g => g.pageIndexes.length !== pagesPerExam);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                <button className="btn-icon" onClick={onBack} title="Tornar">&#8592;</button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Organitzador de pàgines</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Cada fila és un alumne. Arrossega pàgines entre alumnes, elimina les sobrants, o afegeix files noves.
                        {inconsistentGroups.length > 0 && (
                            <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>
                                <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> {inconsistentGroups.length} alumne(s) amb pàgines incorrectes
                            </span>
                        )}
                    </p>
                </div>
                {debugLogs.length > 0 && (
                    <button
                        className="btn"
                        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                        onClick={() => setShowLogs(v => !v)}
                    >
                        🪲 Debug {showLogs ? '▲' : '▼'}
                    </button>
                )}
                <button
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => onConfirm(groups.filter(g => g.pageIndexes.length > 0))}
                >
                    <Check size={16} /> Confirmar i continuar
                </button>
            </div>

            {/* Debug log panel */}
            {showLogs && (
                <div ref={logsRef} style={{
                    background: '#0d1117', color: '#39d353', fontFamily: 'monospace', fontSize: '0.75rem',
                    padding: '0.75rem', maxHeight: '180px', overflowY: 'auto', flexShrink: 0,
                    borderBottom: '1px solid var(--border)'
                }}>
                    {debugLogs.map((log, i) => <div key={i}>&gt; {log}</div>)}
                    {debugLogs.length === 0 && <div style={{ color: '#555' }}>(cap log enregistrat)</div>}
                </div>
            )}

            {/* Main grid */}
            <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                {groups.map((group, gi) => {
                    const isInconsistent = group.pageIndexes.length !== pagesPerExam;
                    return (
                        <div
                            key={group.id}
                            onDragOver={e => e.preventDefault()}
                            onDrop={() => handleDrop(gi)}
                            style={{
                                marginBottom: '0.75rem',
                                borderRadius: '0.75rem',
                                border: isInconsistent ? '1px solid #f59e0b' : '1px solid var(--border)',
                                background: 'var(--bg-secondary)',
                                overflow: 'hidden',
                                transition: 'border-color 0.2s'
                            }}
                        >
                            {/* Row header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
                                <GripVertical size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                                <input
                                    value={group.name}
                                    onChange={e => setGroups(prev => prev.map((g, i) => i === gi ? { ...g, name: e.target.value } : g))}
                                    style={{
                                        flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                        color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem'
                                    }}
                                />

                                <div style={{ display: 'flex', gap: '0.3rem', marginRight: '1rem' }}>
                                    <button
                                        onClick={() => propagateOrder(gi)}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
                                        title="Copia aquest ordre de pàgines a tots els següents"
                                    >
                                        Propagar ordre 📋
                                    </button>
                                    <button
                                        onClick={() => shiftPages(gi, -1)}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
                                        title="Resta 1 a totes les pàgines de PDF d'aquest alumne i següents"
                                    >
                                        Shift -1 ⬅️
                                    </button>
                                    <button
                                        onClick={() => shiftPages(gi, 1)}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
                                        title="Suma 1 a totes les pàgines de PDF d'aquest alumne i següents"
                                    >
                                        Shift +1 ➡️
                                    </button>
                                </div>

                                {/* Editable page count with cascade */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>pàg:</span>
                                    <NumericInput
                                        value={group.pageIndexes.length}
                                        onChange={val => {
                                            if (val !== undefined && val > 0 && val !== group.pageIndexes.length) {
                                                recascadeFromGroup(gi, val);
                                            }
                                        }}
                                        style={{
                                            width: '48px', padding: '0.15rem 0.25rem', fontSize: '0.75rem',
                                            background: isInconsistent ? 'rgba(245,158,11,0.1)' : 'var(--bg-primary)',
                                            border: `1px solid ${isInconsistent ? '#f59e0b' : 'var(--border)'}`,
                                            borderRadius: '0.25rem', color: isInconsistent ? '#f59e0b' : 'var(--text-secondary)',
                                            textAlign: 'center'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/{pagesPerExam}</span>
                                </div>
                                <button className="btn-icon" style={{ padding: '0.2rem' }} onClick={() => moveGroupUp(gi)} title="Pujar"><ChevronUp size={14} /></button>
                                <button className="btn-icon" style={{ padding: '0.2rem' }} onClick={() => moveGroupDown(gi)} title="Baixar"><ChevronDown size={14} /></button>
                                <button className="btn-icon" style={{ padding: '0.2rem' }} onClick={() => addGroupAfter(gi)} title="Afegir alumne nou"><Plus size={14} /></button>
                                <button className="btn-icon" style={{ padding: '0.2rem', color: 'var(--danger)' }} onClick={() => removeGroup(gi)} title="Eliminar alumne"><Trash2 size={14} /></button>
                            </div>

                            {/* Thumbnails */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.75rem', minHeight: '80px' }}>
                                {group.pageIndexes.length === 0 && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', alignSelf: 'center', padding: '0.5rem' }}>
                                        Arrossega pàgines aquí  ·  o elimina aquest alumne
                                    </div>
                                )}
                                {group.pageIndexes.map((absPage, pi) => {
                                    const isMissing = absPage === -1;
                                    return (
                                        <div
                                            key={`${absPage}-${pi}`}
                                            draggable={!isMissing}
                                            onDragStart={() => !isMissing && handleDragStart(gi, pi)}
                                            style={{
                                                position: 'relative', cursor: isMissing ? 'default' : 'grab', userSelect: 'none',
                                                border: `2px solid ${isMissing ? '#6b7280' : 'var(--border)'}`,
                                                borderRadius: '0.375rem', overflow: 'visible',
                                                opacity: isMissing ? 0.45 : 1,
                                                transition: 'transform 0.1s, box-shadow 0.1s',
                                                boxShadow: isMissing ? 'none' : '0 1px 4px rgba(0,0,0,0.3)'
                                            }}
                                            onMouseEnter={e => { if (!isMissing) e.currentTarget.style.transform = 'scale(1.05)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                                        >
                                            {/* Editable exam slot label (top) */}
                                            <div style={{
                                                background: isMissing ? '#4b5563' : 'var(--accent)',
                                                fontSize: '0.6rem', color: 'white', textAlign: 'center',
                                                padding: '1px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px'
                                            }}>
                                                <span>ex.</span>
                                                <NumericInput
                                                    value={pi + 1}
                                                    onChange={val => {
                                                        if (val !== undefined && val >= 1 && val !== pi + 1) {
                                                            rebaseFromPage(gi, pi, val - 1);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '28px', background: 'transparent',
                                                        border: 'none', color: 'white', textAlign: 'center',
                                                        fontSize: '0.6rem', padding: 0, outline: 'none'
                                                    }}
                                                />
                                            </div>

                                            {/* Page thumbnail or missing placeholder */}
                                            {isMissing ? (
                                                <div style={{
                                                    width: '70px', height: '100px', background: 'var(--bg-tertiary)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.65rem', color: 'var(--text-secondary)'
                                                }}>
                                                    ——<br />absent
                                                </div>
                                            ) : (
                                                thumbnails[absPage]
                                                    ? <img src={thumbnails[absPage]} alt={`P${absPage}`} style={{ display: 'block', height: '100px', width: 'auto' }} />
                                                    : <div style={{ width: '70px', height: '100px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>⏳</div>
                                            )}

                                            {/* Absolute PDF page label (bottom) */}
                                            {!isMissing && (
                                                <div style={{
                                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                                    background: 'rgba(0,0,0,0.6)', fontSize: '0.6rem', color: '#ccc',
                                                    textAlign: 'center', padding: '0.1rem'
                                                }}>pdf p.{absPage}</div>
                                            )}

                                            {/* Delete button */}
                                            <button
                                                onClick={() => removePage(gi, pi)}
                                                title="Eliminar pàgina"
                                                style={{
                                                    position: 'absolute', top: -6, right: -6,
                                                    background: 'rgba(239,68,68,0.9)', border: 'none', borderRadius: '50%',
                                                    width: '18px', height: '18px', cursor: 'pointer', color: 'white',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                                                    zIndex: 10
                                                }}
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
