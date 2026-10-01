import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsDown, ChevronsUp, ChevronUp, FileCheck, GripVertical, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import {
    moveGroup, movePage, removePage, ripplePullBackward, ripplePushForward, shiftOneDown, shiftOneUp,
    swapPages, thumbnailOrder, toggleIgnoredPage, type PageSource,
} from '../../domain/pageMoves';
import { buildStudentsFromPages } from '../../domain/students';
import type { PDFDocumentProxy } from '../../services/pdf/pdfDocument';
import type { ShowConfirm } from '../../state/useDialogs';
import type { Student, ThemeMode } from '../../types';
import HandwrittenTitle from '../common/HandwrittenTitle';
import { AccountBadge, AppHeader, BackButton, SessionTitle, ThemeToggle, type AccountProps } from '../common/HeaderParts';
import { usePageThumbnails } from './usePageThumbnails';

interface Props extends AccountProps {
    pdfDoc: PDFDocumentProxy;
    solutionPdfDoc?: PDFDocumentProxy | null;
    groups: Student[];
    solutionPages: number[];
    pagesPerExam: number;
    fileName: string;
    sessionAlias: string | null;
    onRename: (alias: string | null) => void;
    /** Els canvis es desen a l'instant (ja no es perden en tornar enrere). */
    onChange: (groups: Student[], solutionPages: number[]) => void;
    onConfirm: () => void;
    onBack: () => void;
    theme: ThemeMode;
    onToggleTheme: () => void;
    showConfirm: ShowConfirm;
}

const roundBtn = { background: 'white', opacity: 0.9, width: '32px', height: '32px', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' };

export default function PageOrganizer(props: Props) {
    const { pdfDoc, solutionPdfDoc, groups, pagesPerExam, fileName, sessionAlias, onRename, onChange, onConfirm, onBack, theme, onToggleTheme, showConfirm } = props;
    // Si hi ha solucionari però encara no s'ha organitzat, es mostren totes les seves pàgines en ordre
    const solutionPages = useMemo(
        () => (solutionPdfDoc && props.solutionPages.length === 0 ? Array.from({ length: solutionPdfDoc.numPages }, (_, i) => i + 1) : props.solutionPages),
        [solutionPdfDoc, props.solutionPages],
    );
    const [dragFrom, setDragFrom] = useState<{ source: PageSource; index: number } | null>(null);
    const [hovered, setHovered] = useState<string | null>(null);

    const order = useMemo(() => thumbnailOrder(groups, pagesPerExam, pdfDoc.numPages), [groups, pagesPerExam, pdfDoc.numPages]);
    const thumbs = usePageThumbnails(pdfDoc, order);
    const solutionOrder = useMemo(() => (solutionPdfDoc ? Array.from({ length: solutionPdfDoc.numPages }, (_, i) => i + 1) : []), [solutionPdfDoc]);
    const solutionThumbs = usePageThumbnails(solutionPdfDoc, solutionOrder);

    const setGroups = (next: Student[]) => onChange(next, solutionPages);
    const setSolution = (next: number[]) => onChange(groups, next);

    const handleReset = () => {
        showConfirm('Restablir distribució', 'Vols restablir la distribució original de pàgines? Es perdran tots els canvis manuals.', () => {
            const fresh = buildStudentsFromPages(pdfDoc.numPages, pagesPerExam);
            onChange(
                groups.map((g, i) => ({ ...g, pageIndexes: fresh[i]?.pageIndexes ?? Array.from({ length: pagesPerExam }, (_, p) => i * pagesPerExam + p + 1), ignoredPageIndexes: [] })),
                solutionPdfDoc ? Array.from({ length: solutionPdfDoc.numPages }, (_, i) => i + 1) : [],
            );
        });
    };

    const drop = (to: PageSource) => {
        if (!dragFrom) return;
        const res = movePage(groups, solutionPages, dragFrom.source, dragFrom.index, to);
        setDragFrom(null);
        onChange(res.groups, res.solution);
    };

    const addGroup = () => setGroups([...groups, { id: `s_${Date.now()}`, name: `Alumne ${groups.length + 1}`, pageIndexes: [], ignoredPageIndexes: [] }]);
    const inconsistentCount = groups.filter(g => g.pageIndexes.length !== pagesPerExam).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)', overflowY: 'auto' }}>
            <AppHeader
                left={<>
                    <BackButton onClick={onBack} />
                    <SessionTitle fileName={fileName} alias={sessionAlias} onRename={onRename} />
                </>}
                right={<>
                    <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                    <AccountBadge {...props} connectStyle={{ height: '42px', padding: '0 1.25rem' }} />
                    <button className="btn btn-primary" onClick={onConfirm}><Check size={18} /> Confirmar</button>
                </>}
            />

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
                            <div className="card" onDragOver={e => e.preventDefault()} onDrop={() => drop('solution')} style={{ padding: '1.5rem', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'var(--accent-light)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '220px', flexShrink: 0 }}>
                                    <FileCheck size={16} color="var(--accent)" />
                                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--accent)' }}>SOLUCIONARI</span>
                                </div>
                                <div style={{ width: '40px' }} />
                                <div style={{ flex: 1, display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1rem', background: 'var(--bg-tertiary)20', borderRadius: '1rem', minHeight: '240px' }}>
                                    {solutionPages.map((p, pi) => {
                                        const isHovered = hovered === `solution-${pi}`;
                                        const swap = (a: number, b: number) => { const next = [...solutionPages]; [next[a], next[b]] = [next[b], next[a]]; setSolution(next); };
                                        return (
                                            <div
                                                key={`sol-${p}-${pi}`}
                                                draggable
                                                onDragStart={() => setDragFrom({ source: 'solution', index: pi })}
                                                onMouseEnter={() => setHovered(`solution-${pi}`)}
                                                onMouseLeave={() => setHovered(null)}
                                                style={{ position: 'relative', cursor: 'grab', background: 'white', borderRadius: '0.6rem', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden', flexShrink: 0 }}
                                            >
                                                {solutionThumbs[p] ? <img src={solutionThumbs[p]} alt={p.toString()} style={{ height: '220px', width: 'auto', display: 'block' }} /> : <div style={{ height: '220px', width: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>Carregant...</div>}
                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', zIndex: 10, background: 'rgba(0,0,0,0.1)', opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: isHovered ? 'auto' : 'none' }}>
                                                    {pi > 0 ? (
                                                        <button onClick={e => { e.stopPropagation(); swap(pi, pi - 1); }} className="btn-icon" style={roundBtn}><ChevronLeft size={20} /></button>
                                                    ) : <div />}
                                                    {pi < solutionPages.length - 1 ? (
                                                        <button onClick={e => { e.stopPropagation(); swap(pi, pi + 1); }} className="btn-icon" style={roundBtn}><ChevronRight size={20} /></button>
                                                    ) : <div />}
                                                </div>
                                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)', color: 'white', fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', padding: '4px 0', zIndex: 5 }}>p.{p}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ width: '120px', textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent)' }}>{solutionPages.length} pàg.</span>
                                </div>
                            </div>
                        )}

                        {groups.map((group, gi) => {
                            const isErr = group.pageIndexes.length !== pagesPerExam;
                            return (
                                <div key={group.id} onDragOver={e => e.preventDefault()} onDrop={() => drop(gi)} className="card" style={{ padding: '1.5rem', border: isErr ? '1px solid var(--danger)' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1.5rem', background: isErr ? 'rgba(239, 68, 68, 0.01)' : 'var(--bg-secondary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '220px', flexShrink: 0 }}>
                                        <GripVertical size={16} color="var(--text-secondary)" />
                                        <input value={group.name} onChange={e => setGroups(groups.map((g, i) => (i === gi ? { ...g, name: e.target.value } : g)))} style={{ fontWeight: 800, fontSize: '0.9rem', border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', width: '100%' }} />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '40px' }}>
                                        {gi > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <button className="btn btn-secondary" onClick={() => setGroups(ripplePullBackward(groups, gi - 1))} title="Moure EN CASCADA amunt" style={{ padding: '0.2rem', borderRadius: '0.4rem', height: '28px', border: '1px solid var(--accent)' }}>
                                                    <ChevronsUp size={16} color="var(--accent)" />
                                                </button>
                                                <button className="btn btn-secondary" onClick={() => setGroups(shiftOneUp(groups, gi))} title="Moure només 1 pàgina amunt" style={{ padding: '0.2rem', borderRadius: '0.4rem', height: '28px' }}>
                                                    <ArrowUp size={14} />
                                                </button>
                                            </div>
                                        )}
                                        {gi < groups.length - 1 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <button className="btn btn-secondary" onClick={() => setGroups(shiftOneDown(groups, gi))} title="Moure només 1 pàgina avall" style={{ padding: '0.2rem', borderRadius: '0.4rem', height: '28px' }}>
                                                    <ArrowDown size={14} />
                                                </button>
                                                <button className="btn btn-secondary" onClick={() => setGroups(ripplePushForward(groups, gi))} title="Moure EN CASCADA avall" style={{ padding: '0.2rem', borderRadius: '0.4rem', height: '28px', border: '1px solid var(--accent)' }}>
                                                    <ChevronsDown size={16} color="var(--accent)" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ flex: 1, display: 'flex', gap: '1rem', overflowX: 'auto', padding: '1rem', background: 'var(--bg-tertiary)20', borderRadius: '1rem', minHeight: '240px' }}>
                                        {group.pageIndexes.map((p, pi) => {
                                            const isHovered = hovered === `${gi}-${pi}`;
                                            const isIgnored = group.ignoredPageIndexes?.includes(p) ?? false;
                                            return (
                                                <div
                                                    key={`${p}-${pi}`}
                                                    onMouseEnter={() => setHovered(`${gi}-${pi}`)}
                                                    onMouseLeave={() => setHovered(null)}
                                                    style={{ position: 'relative', background: 'white', borderRadius: '0.6rem', border: isIgnored ? '2px solid var(--accent)' : '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden', flexShrink: 0, transition: 'all 0.2s', transform: isHovered ? 'translateY(-4px)' : 'none' }}
                                                >
                                                    <div style={{ position: 'relative', filter: isIgnored ? 'grayscale(1) opacity(0.5)' : 'none', transition: 'filter 0.3s, opacity 0.3s' }}>
                                                        {thumbs[p] ? <img src={thumbs[p]} alt={p.toString()} style={{ height: '220px', width: 'auto', display: 'block' }} /> : <div style={{ height: '220px', width: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>Carregant...</div>}
                                                    </div>

                                                    <div
                                                        onClick={e => { e.stopPropagation(); setGroups(toggleIgnoredPage(groups, gi, p)); }}
                                                        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, cursor: 'pointer', background: (isHovered && !isIgnored) ? 'rgba(0,0,0,0.05)' : 'transparent', transition: 'background 0.2s', pointerEvents: 'auto' }}
                                                        title={isIgnored ? 'Marca com a NO buida' : 'Marca com a PÀGINA BUIDA'}
                                                    >
                                                        {isIgnored ? (
                                                            <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: '50%', padding: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', border: '2px solid rgba(255,255,255,0.2)' }}>
                                                                <X size={48} color="white" strokeWidth={3} />
                                                            </div>
                                                        ) : isHovered ? (
                                                            <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: '50%', padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', opacity: 0.8 }}>
                                                                <X size={32} />
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', zIndex: 16, pointerEvents: 'none', opacity: (isHovered && !isIgnored) ? 1 : 0, transition: 'opacity 0.2s' }}>
                                                        {pi > 0 ? (
                                                            <button onClick={e => { e.stopPropagation(); setGroups(swapPages(groups, gi, pi, pi - 1)); }} className="btn-icon" style={{ ...roundBtn, pointerEvents: 'auto' }}><ChevronLeft size={20} /></button>
                                                        ) : <div />}
                                                        {pi < group.pageIndexes.length - 1 ? (
                                                            <button onClick={e => { e.stopPropagation(); setGroups(swapPages(groups, gi, pi, pi + 1)); }} className="btn-icon" style={{ ...roundBtn, pointerEvents: 'auto' }}><ChevronRight size={20} /></button>
                                                        ) : <div />}
                                                    </div>

                                                    <div
                                                        draggable
                                                        onDragStart={() => setDragFrom({ source: gi, index: pi })}
                                                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)', color: 'white', fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', padding: '4px 0', zIndex: 25, cursor: 'grab' }}
                                                        title="Arrossega per moure la pàgina"
                                                    >
                                                        p.{p}
                                                    </div>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); setGroups(removePage(groups, gi, pi)); }}
                                                        className="btn-icon"
                                                        style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(255,255,255,0.8)', color: 'var(--text-secondary)', width: '24px', height: '24px', borderRadius: '50%', padding: 0, cursor: 'pointer', zIndex: 30, border: '1px solid var(--border)', transition: 'all 0.2s' }}
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
                                            <button onClick={() => setGroups(moveGroup(groups, gi, -1))} className="btn-icon" style={{ padding: '2px', height: '24px' }}><ChevronUp size={16} /></button>
                                            <button onClick={() => setGroups(moveGroup(groups, gi, 1))} className="btn-icon" style={{ padding: '2px', height: '24px' }}><ChevronDown size={16} /></button>
                                        </div>
                                        <button onClick={() => setGroups(groups.filter((_, i) => i !== gi))} className="btn-icon" style={{ padding: '4px', color: 'var(--danger)' }}><Trash2 size={18} /></button>
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
