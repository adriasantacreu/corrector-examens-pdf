/**
 * Definidor de plantilla: sobre la primera còpia de l'examen es marquen els retalls d'exercici,
 * les pàgines senceres, l'àrea del nom i l'àrea de la nota final.
 * Els canvis es desen a la sessió a l'instant (abans es perdien en tornar enrere o recarregar).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image as KonvaImage, Layer, Rect, Stage } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Award, Check, ChevronLeft, ChevronRight, FileText, MousePointer2, RefreshCw, Square, TextSelect, Trash2 } from 'lucide-react';
import {
    addRegion, createPagesExercise, createRegion, distributeRubric, hasGradableExercises,
    newRubricItem, rubricExceedsMax, withAutoDistribution, type RegionKind,
} from '../../domain/exercises';
import { clipRectToBounds, normalizeRect } from '../../domain/geometry';
import { isGradable } from '../../domain/scoring';
import { useStageViewport } from '../../hooks/useStageViewport';
import type { PDFDocumentProxy } from '../../services/pdf/pdfDocument';
import { renderPage } from '../../services/pdf/pageRenderer';
import type { ShowConfirm, ShowToast } from '../../state/useDialogs';
import type { ExerciseDef, OcrNameRegion, Rect as RectShape, RegionExercise, RubricItem, ThemeMode } from '../../types';
import HandwrittenTitle from '../common/HandwrittenTitle';
import { AccountBadge, AppHeader, BackButton, SessionTitle, ThemeToggle, type AccountProps } from '../common/HeaderParts';
import ZoomControls from '../common/ZoomControls';
import ExerciseCard from './ExerciseCard';
import RegionItem from './RegionItem';

type Mode = 'select' | 'draw' | 'draw_ocr' | 'draw_total_score';

const MODE_KIND: Record<Exclude<Mode, 'select'>, RegionKind> = { draw: 'crop', draw_ocr: 'ocr_name', draw_total_score: 'total_score' };

const REGION_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
    qr_code: { fill: 'rgba(16, 185, 129, 0.2)', stroke: '#10b981', label: 'Àrea QR' },
    ocr_name: { fill: 'rgba(234, 179, 8, 0.2)', stroke: '#eab308', label: 'Nom OCR' },
    total_score: { fill: 'rgba(239, 68, 68, 0.2)', stroke: '#ef4444', label: 'Nota final' },
    crop: { fill: 'rgba(96, 165, 250, 0.2)', stroke: '#60a5fa', label: 'Retall ex' },
};

const MIN_REGION_SIZE = 20;

interface Props extends AccountProps {
    pdfDoc: PDFDocumentProxy;
    pagesPerExam: number;
    /** Pàgina absoluta del PDF que es fa servir com a plantilla per a cada pàgina lògica de l'examen. */
    templatePage: (logicalPage: number) => number;
    exercises: ExerciseDef[];
    onChange: (exercises: ExerciseDef[]) => void;
    fileName: string;
    sessionAlias: string | null;
    onRename: (alias: string | null) => void;
    onComplete: () => void;
    onBack: () => void;
    theme: ThemeMode;
    onToggleTheme: () => void;
    onRunOCR: () => void;
    onResetOCR: () => void;
    ocrCompleted: boolean;
    showConfirm: ShowConfirm;
    showToast: ShowToast;
}

export default function TemplateDefiner(props: Props) {
    const { pdfDoc, pagesPerExam, templatePage, exercises, onChange, fileName, sessionAlias, onRename, onComplete, onBack, theme, onToggleTheme, onRunOCR, onResetOCR, ocrCompleted, showConfirm, showToast } = props;
    const isDarkMode = theme === 'dark';
    const vp = useStageViewport();
    const { fitContent } = vp;

    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [pageImage, setPageImage] = useState<HTMLCanvasElement | null>(null);
    const [mode, setMode] = useState<Mode>('draw');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformingId, setTransformingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<RectShape | null>(null);
    const [lastAddedId, setLastAddedId] = useState<string | null>(null);
    const warnedExceeded = useRef<Record<string, boolean>>({});
    const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const maxRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const fittedPage = useRef<number>(-1);

    // Les actualitzacions sempre parteixen de la llista més recent (evita perdre canvis seguits)
    const exercisesRef = useRef(exercises);
    useEffect(() => { exercisesRef.current = exercises; }, [exercises]);
    const setExercises = useCallback((recipe: (prev: ExerciseDef[]) => ExerciseDef[]) => {
        const next = recipe(exercisesRef.current);
        exercisesRef.current = next;
        onChange(next);
    }, [onChange]);

    // Carrega la pàgina de plantilla (cancel·lant càrregues antigues si es canvia de pàgina ràpid)
    const absolutePage = templatePage(currentPageIndex);
    useEffect(() => {
        let cancelled = false;
        renderPage(pdfDoc, absolutePage, { invert: isDarkMode }).then(canvas => {
            if (cancelled) return;
            setPageImage(canvas);
            if (fittedPage.current !== currentPageIndex) {
                fittedPage.current = currentPageIndex;
                fitContent({ width: canvas.width, height: canvas.height });
            }
        }).catch(err => console.error('[template] Error carregant la pàgina', err));
        return () => { cancelled = true; };
    }, [pdfDoc, absolutePage, currentPageIndex, isDarkMode, fitContent]);

    // En crear un exercici, el focus va al nom amb el text seleccionat per sobreescriure'l
    useEffect(() => {
        if (!lastAddedId) return;
        const el = nameRefs.current[lastAddedId];
        if (el) { el.focus(); el.select(); }
        setLastAddedId(null);
    }, [lastAddedId, exercises]);

    const addFullPageExercise = useCallback(() => {
        const ex = createPagesExercise(currentPageIndex, exercisesRef.current);
        setExercises(prev => [...prev, ex]);
        setLastAddedId(ex.id);
    }, [currentPageIndex, setExercises]);

    const removeExercise = useCallback((id: string) => {
        setExercises(prev => prev.filter(e => e.id !== id));
        setSelectedId(s => (s === id ? null : s));
        setTransformingId(t => (t === id ? null : t));
    }, [setExercises]);

    // Dreceres de teclat
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
            if (e.key === 'Enter' || e.key === 'Escape') {
                setTransformingId(null);
                setSelectedId(null);
                if (isInput) (e.target as HTMLElement).blur();
                return;
            }
            if (isInput) return;
            const key = e.key.toLowerCase();
            if (key === 'v') setMode('select');
            else if (key === 'r') setMode('draw');
            else if (key === 'p') { e.preventDefault(); addFullPageExercise(); }
            else if (key === 'n') setMode('draw_ocr');
            else if (key === 's') setMode('draw_total_score');
            else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
                const id = selectedId;
                showConfirm('Eliminar exercici', 'Vols eliminar aquest exercici?', () => removeExercise(id));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedId, showConfirm, addFullPageExercise, removeExercise]);

    const updateExercise = (id: string, updates: Partial<ExerciseDef>) => {
        setExercises(prev => prev.map(ex => {
            if (ex.id !== id) return ex;
            const updated = { ...ex, ...updates } as ExerciseDef;
            const redistribute = updates.maxScore !== undefined || updates.scoringMode !== undefined;
            return redistribute ? withAutoDistribution(updated) : updated;
        }));
    };

    const addRubricItem = (id: string) => {
        setExercises(prev => prev.map(ex => (ex.id === id ? withAutoDistribution({ ...ex, rubric: [...(ex.rubric ?? []), newRubricItem()] }) : ex)));
    };

    const updateRubricItem = (exId: string, itemId: string, updates: Partial<RubricItem>) => {
        const ex = exercisesRef.current.find(e => e.id === exId);
        if (!ex) return;
        const updated: ExerciseDef = {
            ...ex,
            // Tocar uns punts a mà desactiva l'auto-repartiment per no desfer la configuració manual
            ...(updates.points !== undefined ? { autoDistribute: false } : {}),
            rubric: (ex.rubric ?? []).map(item => (item.id === itemId ? { ...item, ...updates } : item)),
        };
        setExercises(prev => prev.map(e => (e.id === exId ? updated : e)));
        // Avís (una sola vegada per exercici) si la suma de criteris supera la nota màxima
        const exceeded = rubricExceedsMax(updated);
        if (exceeded && !warnedExceeded.current[exId]) {
            warnedExceeded.current[exId] = true;
            showToast('Atenció rúbrica', "La suma de criteris supera la nota màxima de l'exercici.", 'error');
        } else if (!exceeded) {
            warnedExceeded.current[exId] = false;
        }
    };

    const removeRubricItem = (exId: string, itemId: string) => {
        setExercises(prev => prev.map(ex => (ex.id === exId ? withAutoDistribution({ ...ex, rubric: (ex.rubric ?? []).filter(i => i.id !== itemId) }) : ex)));
    };

    const toggleAutoDistribute = (exId: string, value: boolean) => {
        setExercises(prev => prev.map(ex => {
            if (ex.id !== exId) return ex;
            const updated = { ...ex, autoDistribute: value };
            return value ? { ...updated, rubric: distributeRubric(updated) } : updated;
        }));
    };

    const updateRegionRect = (id: string, rect: RectShape) => {
        setExercises(prev => prev.map(ex => (ex.id === id ? { ...ex, ...rect } as ExerciseDef : ex)));
    };

    // Dibuix d'una regió nova
    const startDraft = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        const clickedOnEmpty = e.target === vp.stageRef.current || e.target.name() === 'bgImage';
        if (clickedOnEmpty) { setTransformingId(null); setSelectedId(null); }
        if (mode === 'select') return;
        const pos = vp.pointerToDocument();
        if (pos) setDraft({ x: pos.x, y: pos.y, width: 0, height: 0 });
    };

    const moveDraft = () => {
        if (!draft || mode === 'select') return;
        const pos = vp.pointerToDocument();
        if (pos) setDraft(d => (d ? { ...d, width: pos.x - d.x, height: pos.y - d.y } : d));
    };

    const finishDraft = () => {
        if (draft && mode !== 'select' && pageImage) {
            const rect = clipRectToBounds(normalizeRect(draft), { width: pageImage.width, height: pageImage.height });
            if (rect.width > MIN_REGION_SIZE && rect.height > MIN_REGION_SIZE) {
                const region = createRegion(MODE_KIND[mode], currentPageIndex, rect, exercisesRef.current);
                setExercises(prev => addRegion(prev, region));
                setLastAddedId(region.id);
            }
        }
        setDraft(null);
    };

    const regions = exercises.filter((e): e is RegionExercise => e.type !== 'pages' && e.pageIndex === currentPageIndex);
    const gradable = exercises.filter(isGradable);
    const canFinish = hasGradableExercises(exercises);
    const draftStyle = mode !== 'select' ? REGION_STYLE[MODE_KIND[mode]] : null;

    const toolButton = (active: boolean, onClick: () => void, title: string, key: string, icon: ReactNode, color?: string) => (
        <button className={`btn-icon ${active ? 'active' : ''}`} onClick={onClick} title={title} style={{ width: '100%', height: '40px', borderRadius: '0.5rem', position: 'relative', ...(color !== undefined ? { color: active ? color : undefined } : {}) }}>
            {icon}
            <span style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '0.5rem', fontWeight: 900, opacity: 0.5 }}>{key}</span>
        </button>
    );

    return (
        <div style={{ display: 'flex', width: '100%', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            <AppHeader
                style={{ flexShrink: 0 }}
                left={<>
                    <BackButton onClick={onBack} />
                    <SessionTitle fileName={fileName} alias={sessionAlias} onRename={onRename} />
                </>}
                right={<>
                    <ThemeToggle theme={theme} onToggle={onToggleTheme} title="Tema" />
                    <AccountBadge {...props} />
                    <button
                        className="btn btn-primary"
                        onClick={() => canFinish && onComplete()}
                        disabled={!canFinish}
                        style={{ opacity: canFinish ? 1 : 0.5, cursor: canFinish ? 'pointer' : 'not-allowed' }}
                    >
                        <Check size={18} /> Finalitzar
                    </button>
                </>}
            />

            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <div className="sidebar" style={{ width: '24rem', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: '1.25rem' }}>
                    <div style={{ paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <HandwrittenTitle size="2rem" color="purple" noMargin={true}>Definir plantilla</HandwrittenTitle>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>
                            Pàgina {currentPageIndex + 1} de {pagesPerExam}
                        </p>
                    </div>

                    <div style={{ padding: '1rem 0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                        {toolButton(mode === 'draw', () => setMode('draw'), 'Dibuixar zona (R)', 'R', <Square size={20} />)}
                        <button className="btn-icon" onClick={addFullPageExercise} title="Afegir pàgina completa (P)" style={{ width: '100%', height: '40px', borderRadius: '0.5rem', position: 'relative' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={20} />
                                <div style={{ position: 'absolute', top: '-2px', right: '-2px', background: 'var(--accent)', color: 'white', borderRadius: '50%', width: '12px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 900, border: '1px solid currentColor' }}>+</div>
                            </div>
                            <span style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '0.5rem', fontWeight: 900, opacity: 0.5 }}>P</span>
                        </button>
                        {toolButton(mode === 'draw_ocr', () => setMode('draw_ocr'), 'Àrea de Nom OCR (N)', 'N', <TextSelect size={20} />, '#eab308')}
                        {toolButton(mode === 'draw_total_score', () => setMode('draw_total_score'), 'Àrea de Nota Final (S)', 'S', <Award size={20} />, '#ef4444')}
                        {toolButton(mode === 'select', () => setMode('select'), 'Seleccionar / Moure (V)', 'V', <MousePointer2 size={20} />)}
                    </div>

                    <div style={{ padding: '1rem 0', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <section>
                            <HandwrittenTitle size="1.8rem" color="yellow" noMargin={true} style={{ marginBottom: '0.5rem' }}>Regions de control</HandwrittenTitle>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {(['ocr_name', 'total_score'] as const).map(type => {
                                    const reg = exercises.find(ex => ex.type === type) as RegionExercise | undefined;
                                    const label = type === 'ocr_name' ? '👤 Àrea del nom' : '📊 Àrea de la nota';
                                    const color = type === 'ocr_name' ? '#eab308' : '#ef4444';
                                    const ocrReg = type === 'ocr_name' ? reg as OcrNameRegion | undefined : undefined;
                                    return (
                                        <div key={type} style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: reg ? `${color}10` : 'var(--bg-tertiary)', border: reg ? `1px solid ${color}` : '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: reg ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
                                                    {ocrReg && (
                                                        <label style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!ocrReg.skipOcr}
                                                                onChange={e => {
                                                                    updateExercise(ocrReg.id, { skipOcr: e.target.checked } as Partial<ExerciseDef>);
                                                                    if (e.target.checked) onResetOCR();
                                                                }}
                                                            />
                                                            No fer OCR
                                                        </label>
                                                    )}
                                                </div>
                                                {reg && <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>Pàg. {reg.pageIndex + 1}</span>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                {ocrReg && !ocrReg.skipOcr && (
                                                    <button onClick={onRunOCR} className="btn-icon" style={{ color: ocrCompleted ? 'var(--success)' : 'var(--accent)', padding: '4px' }} title="Tornar a executar OCR">
                                                        <RefreshCw size={14} className={!ocrCompleted ? 'spin' : ''} />
                                                    </button>
                                                )}
                                                {reg ? (
                                                    <button onClick={() => removeExercise(reg.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}><Trash2 size={14} /></button>
                                                ) : (
                                                    <button onClick={() => setMode(type === 'ocr_name' ? 'draw_ocr' : 'draw_total_score')} className="btn btn-secondary" style={{ fontSize: '0.6rem', height: '24px', padding: '0 0.5rem' }}>Definir</button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section>
                            <HandwrittenTitle size="1.8rem" color="green" noMargin={true} style={{ marginBottom: '0.5rem' }}>Exercicis corregibles</HandwrittenTitle>
                            {gradable.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>Cap exercici definit.</p>
                                    {exercises.length > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700, background: 'var(--danger-light)', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--danger)', lineHeight: '1.2', animation: 'pulse 2s infinite' }}>
                                            Has de marcar com a mínim un exercici (retall o pàgines) per poder continuar.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {gradable.map((ex, idx) => (
                                        <ExerciseCard
                                            key={ex.id}
                                            exercise={ex}
                                            index={idx}
                                            currentPageIndex={currentPageIndex}
                                            isSelected={ex.id === selectedId}
                                            nameRef={el => { nameRefs.current[ex.id] = el; }}
                                            maxRef={el => { maxRefs.current[ex.id] = el; }}
                                            onSelect={() => { if (ex.type === 'crop') setCurrentPageIndex(ex.pageIndex); setSelectedId(ex.id); }}
                                            onRemove={() => removeExercise(ex.id)}
                                            onUpdate={u => updateExercise(ex.id, u)}
                                            onFocusMax={() => { maxRefs.current[ex.id]?.focus(); maxRefs.current[ex.id]?.select(); }}
                                            onDoneEditing={() => setTransformingId(null)}
                                            onToggleAutoDistribute={v => toggleAutoDistribute(ex.id, v)}
                                            onAddRubricItem={() => addRubricItem(ex.id)}
                                            onUpdateRubricItem={(itemId, u) => updateRubricItem(ex.id, itemId, u)}
                                            onRemoveRubricItem={itemId => removeRubricItem(ex.id, itemId)}
                                            onPageError={msg => showToast('Error', msg, 'error')}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>

                <div className="workspace" ref={vp.containerRef} style={{ background: 'var(--bg-tertiary)', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minHeight: 0, position: 'relative', margin: 0, padding: 0 }}>
                    <div className="glass-zoom" style={{ position: 'absolute', top: '1rem', zIndex: 10, display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', borderRadius: '2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
                        <button className="btn-icon" disabled={currentPageIndex === 0} onClick={() => setCurrentPageIndex(p => Math.max(0, p - 1))}><ChevronLeft size={20} /></button>
                        <span style={{ fontWeight: 700 }}>Pàgina {currentPageIndex + 1} / {pagesPerExam}</span>
                        <button className="btn-icon" disabled={currentPageIndex === pagesPerExam - 1} onClick={() => setCurrentPageIndex(p => Math.min(pagesPerExam - 1, p + 1))}><ChevronRight size={20} /></button>
                    </div>

                    <ZoomControls
                        variant="template"
                        scale={vp.stageScale}
                        onZoom={vp.applyZoom}
                        onFit={() => pageImage && fitContent({ width: pageImage.width, height: pageImage.height })}
                    />

                    {pageImage ? (
                        <div className="canvas-container" style={{ width: '100%', height: '100%', cursor: mode !== 'select' ? 'crosshair' : 'grab' }}>
                            <Stage
                                ref={vp.stageRef}
                                width={vp.containerSize.width || 800}
                                height={vp.containerSize.height || 600}
                                scaleX={vp.stageScale}
                                scaleY={vp.stageScale}
                                x={vp.stagePos.x}
                                y={vp.stagePos.y}
                                onMouseDown={startDraft}
                                onMouseMove={moveDraft}
                                onMouseUp={finishDraft}
                                onWheel={vp.handleWheel}
                                onTouchStart={startDraft}
                                onTouchMove={e => { if (!vp.handlePinch(e)) moveDraft(); }}
                                onTouchEnd={() => { vp.endPinch(); finishDraft(); }}
                                draggable={mode === 'select' && !transformingId}
                                onDragEnd={e => { if (e.target === vp.stageRef.current) vp.setStagePos({ x: e.target.x(), y: e.target.y() }); }}
                            >
                                <Layer>
                                    <KonvaImage name="bgImage" image={pageImage} x={0} y={0} width={pageImage.width} height={pageImage.height} />
                                    {regions.map(region => {
                                        const style = REGION_STYLE[region.type] ?? REGION_STYLE.crop;
                                        return (
                                            <RegionItem
                                                key={region.id}
                                                region={region}
                                                fill={style.fill}
                                                stroke={style.stroke}
                                                label={style.label}
                                                selectable={mode === 'select'}
                                                isTransforming={region.id === transformingId}
                                                baseScale={vp.baseScale}
                                                pageSize={{ width: pageImage.width, height: pageImage.height }}
                                                onSelect={() => setSelectedId(region.id)}
                                                onStartTransform={() => { setTransformingId(region.id); setSelectedId(region.id); }}
                                                onChange={rect => updateRegionRect(region.id, rect)}
                                            />
                                        );
                                    })}
                                    {draft && draftStyle && (
                                        <Rect x={draft.x} y={draft.y} width={draft.width} height={draft.height} fill={draftStyle.fill} stroke={draftStyle.stroke} strokeWidth={2 / vp.baseScale} strokeScaleEnabled={true} dash={[5 / vp.baseScale, 5 / vp.baseScale]} />
                                    )}
                                </Layer>
                            </Stage>
                        </div>
                    ) : <div className="loader" />}
                </div>
            </div>
        </div>
    );
}

