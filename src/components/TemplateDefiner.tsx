import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group, Text, Transformer } from 'react-konva';
import { ChevronLeft, ChevronRight, Check, Trash2, MousePointer2, Square, Plus, File, Award, TextSelect, Settings, FileText } from 'lucide-react';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas } from '../utils/pdfUtils';
import type { ExerciseDef, CropExercise, PagesExercise } from '../types';

interface Props {
    pdfDoc: PDFDocumentProxy;
    pagesPerExam: number;
    initialExercises: ExerciseDef[];
    onComplete: (crops: ExerciseDef[]) => void;
    onBack?: () => void;
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

export default function TemplateDefiner({ pdfDoc, pagesPerExam, initialExercises, onComplete, onBack }: Props) {
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [exercises, setExercises] = useState<ExerciseDef[]>(initialExercises);
    const [lastAddedId, setLastAddedId] = useState<string | null>(null);

    // Drawing state
    const [isDrawing, setIsDrawing] = useState(false);
    const [newCropRef, setNewCropRef] = useState<Partial<CropExercise> | null>(null);
    const [mode, setMode] = useState<'select' | 'draw' | 'draw_qr' | 'draw_ocr' | 'draw_total_score'>('select');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const stageRef = useRef<any>(null);
    const lastDistRef = useRef<number>(0);

    useEffect(() => {
        if (lastAddedId && inputRefs.current[lastAddedId]) {
            inputRefs.current[lastAddedId]?.focus();
            setLastAddedId(null);
        }
    }, [lastAddedId, exercises]);

    useEffect(() => {
        const loadPage = async () => {
            setBgImage(null);
            const canvas = document.createElement('canvas');
            const dimensions = await renderPDFPageToCanvas(pdfDoc, currentPageIndex + 1, canvas, 2.5);

            if (dimensions) {
                const img = new Image();
                img.src = canvas.toDataURL('image/png');
                img.onload = () => {
                    setBgImage(img);

                    if (containerRef.current) {
                        const containerWidth = containerRef.current.clientWidth;
                        const containerHeight = containerRef.current.clientHeight;

                        const padding = 40;
                        const targetScaleX = (containerWidth - padding) / img.width;
                        const targetScaleY = (containerHeight - padding) / img.height;
                        const targetScale = Math.min(targetScaleX, targetScaleY, 1.2);

                        setStageScale(targetScale);
                        setStagePos({
                            x: (containerWidth - (img.width * targetScale)) / 2,
                            y: Math.max(20, (containerHeight - (img.height * targetScale)) / 2)
                        });
                    }
                };
            }
        };
        // Small delay to ensure container is measured correctly
        setTimeout(loadPage, 100);
    }, [currentPageIndex, pdfDoc]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
                setExercises(prev => prev.filter(ex => ex.id !== selectedId));
                setSelectedId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId]);

    const handleMouseDown = (e: any) => {
        if (mode === 'select') return;
        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const x = (pos.x - stage.x()) / stageScale;
        const y = (pos.y - stage.y()) / stageScale;

        setIsDrawing(true);
        setNewCropRef({
            x,
            y,
            width: 0,
            height: 0,
            pageIndex: currentPageIndex
        });
    };

    const handleMouseMove = (e: any) => {
        if (!isDrawing || !newCropRef || mode === 'select') return;
        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        // Calculate actual position factoring in stage scale and pan
        const currentX = (pos.x - stage.x()) / stageScale;
        const currentY = (pos.y - stage.y()) / stageScale;

        setNewCropRef(prev => ({
            ...prev,
            width: currentX - (prev?.x || 0),
            height: currentY - (prev?.y || 0)
        }));
    };

    const handleWheel = (e: any) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        if (e.evt.ctrlKey) {
            // Zoom
            const scaleBy = 1.1;
            const oldScale = stage.scaleX();
            const pointer = stage.getPointerPosition();

            if (!pointer) return;

            const mousePointTo = {
                x: (pointer.x - stage.x()) / oldScale,
                y: (pointer.y - stage.y()) / oldScale,
            };

            const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

            // Limit zoom
            if (newScale < 0.1 || newScale > 10) return;

            setStageScale(newScale);
            setStagePos({
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
            });
        } else {
            // Pan
            setStagePos({
                x: stage.x() - e.evt.deltaX,
                y: stage.y() - e.evt.deltaY
            });
        }
    };

    const handleTouchMove = (e: any) => {
        const touch1 = e.evt.touches[0];
        const touch2 = e.evt.touches[1];

        if (touch1 && touch2) {
            // Pinch to zoom
            const dist = Math.sqrt(
                Math.pow(touch1.clientX - touch2.clientX, 2) +
                Math.pow(touch1.clientY - touch2.clientY, 2)
            );

            if (!lastDistRef.current) {
                lastDistRef.current = dist;
                return;
            }

            const stage = stageRef.current;
            if (!stage) return;

            const scaleBy = dist / lastDistRef.current;
            const oldScale = stage.scaleX();
            const newScale = oldScale * scaleBy;

            if (newScale < 0.1 || newScale > 10) return;

            const center = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2,
            };

            // Get pointer position relative to stage
            const stageBox = containerRef.current?.getBoundingClientRect();
            if (!stageBox) return;

            const pointer = {
                x: center.x - stageBox.left,
                y: center.y - stageBox.top,
            };

            const mousePointTo = {
                x: (pointer.x - stage.x()) / oldScale,
                y: (pointer.y - stage.y()) / oldScale,
            };

            setStageScale(newScale);
            setStagePos({
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
            });

            lastDistRef.current = dist;
        } else {
            handleMouseMove(e);
        }
    };

    const handleTouchEnd = () => {
        lastDistRef.current = 0;
        handleMouseUp();
    };

    const handleMouseUp = () => {
        if (isDrawing && newCropRef && mode !== 'select') {
            let { x, y, width, height } = newCropRef as any;
            if (width < 0) {
                x += width;
                width = Math.abs(width);
            }
            if (height < 0) {
                y += height;
                height = Math.abs(height);
            }

            if (bgImage) {
                if (x < 0) { width += x; x = 0; }
                if (y < 0) { height += y; y = 0; }
                if (x + width > bgImage.width) width = bgImage.width - x;
                if (y + height > bgImage.height) height = bgImage.height - y;
            }

            if (width > 20 && height > 20) {
                const finalType = mode === 'draw' ? 'crop' : mode === 'draw_qr' ? 'qr_code' : mode === 'draw_ocr' ? 'ocr_name' : 'total_score';
                const newId = `ex_${Date.now()}`;
                const finalCrop: any = {
                    id: newId,
                    type: finalType,
                    pageIndex: currentPageIndex,
                    x, y, width, height
                };
                setExercises(prev => [...prev, finalCrop]);
                setLastAddedId(newId);
            }
        }
        setIsDrawing(false);
        setNewCropRef(null);
    };

    const removeExercise = (id: string) => {
        setExercises(prev => prev.filter(c => c.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    const addFullPageExercise = () => {
        const newId = `ex_${Date.now()}`;
        const newEx: PagesExercise = {
            id: newId,
            type: 'pages',
            pageIndexes: [currentPageIndex]
        };
        setExercises(prev => [...prev, newEx]);
        setLastAddedId(newId);
    };

    const addPageToExistingExercise = (id: string) => {
        setExercises(prev => prev.map(ex => {
            if (ex.id === id && ex.type === 'pages') {
                if (!ex.pageIndexes.includes(currentPageIndex)) {
                    return { ...ex, pageIndexes: [...ex.pageIndexes, currentPageIndex].sort((a, b) => a - b) };
                }
            }
            return ex;
        }));
    };

    const updateExerciseMeta = (id: string, updates: Partial<ExerciseDef>) => {
        setExercises(prev => prev.map(ex => {
            if (ex.id === id) {
                return { ...ex, ...updates } as ExerciseDef;
            }
            return ex;
        }));
    };

    const currentPageRegions = exercises.filter(c => c.type !== 'pages' && c.pageIndex === currentPageIndex) as any[];

    const getRegionStyle = (type: string) => {
        switch (type) {
            case 'qr_code': return { fill: 'rgba(16, 185, 129, 0.2)', stroke: '#10b981', label: 'QR Area' };
            case 'ocr_name': return { fill: 'rgba(234, 179, 8, 0.2)', stroke: '#eab308', label: 'Nom OCR' };
            case 'total_score': return { fill: 'rgba(239, 68, 68, 0.2)', stroke: '#ef4444', label: 'Nota Final' };
            default: return { fill: 'rgba(59, 130, 246, 0.2)', stroke: 'var(--accent)', label: 'Crop EX' };
        }
    };

    return (
        <div style={{ display: 'flex', width: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* Sidebar Configuration */}
            <div className="sidebar" style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {onBack && (
                        <button className="btn-icon" onClick={onBack} title="Back">
                            <ChevronLeft />
                        </button>
                    )}
                    <div>
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem', fontWeight: 600 }}>Definir Plantilla</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Pàgina {currentPageIndex + 1} de {pagesPerExam}.
                        </p>
                    </div>
                </div>

                <div style={{ padding: '0.75rem', display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button className={`btn-icon ${mode === 'select' ? 'active' : ''}`} onClick={() => setMode('select')} title="Seleccionar/Moure"><MousePointer2 size={18} /></button>
                    <button className={`btn-icon ${mode === 'draw' ? 'active' : ''}`} onClick={() => setMode('draw')} title="Dibuixar Exercici"><Square size={18} /></button>
                    {/* QR icon hidden */}
                    <button className={`btn-icon ${mode === 'draw_ocr' ? 'active' : ''}`} onClick={() => setMode('draw_ocr')} title="Definir Nom (OCR)" style={{ color: mode === 'draw_ocr' ? '#eab308' : undefined }}><TextSelect size={18} /></button>
                    <button className={`btn-icon ${mode === 'draw_total_score' ? 'active' : ''}`} onClick={() => setMode('draw_total_score')} title="Definir Nota Final" style={{ color: mode === 'draw_total_score' ? '#ef4444' : undefined }}><Award size={18} /></button>
                    <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={addFullPageExercise} title="Afegir pàgina sencera com exercici"><File size={14} /> + Pàgina</button>
                </div>

                <div style={{ padding: '1rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                    {/* Control Regions Section */}
                    <section>
                        <h4 style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Settings size={12} /> Regions de Control
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {['ocr_name', 'total_score'].map(type => {
                                const reg = exercises.find(ex => ex.type === type);
                                const label = type === 'ocr_name' ? '👤 Àrea del Nom' : '📊 Àrea de la Nota';
                                const color = type === 'ocr_name' ? '#eab308' : '#ef4444';

                                return (
                                    <div key={type} style={{
                                        padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                                        background: reg ? `${color}10` : 'var(--bg-tertiary)',
                                        border: reg ? `1px solid ${color}` : '1px dashed var(--border)',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: reg ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
                                            {reg && <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>Pàg. {(reg as any).pageIndex + 1}</span>}
                                        </div>
                                        {reg ? (
                                            <button onClick={() => removeExercise(reg.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                        ) : (
                                            <button
                                                onClick={() => setMode(type === 'ocr_name' ? 'draw_ocr' : type === 'total_score' ? 'draw_total_score' : 'draw_qr')}
                                                className="btn btn-secondary" style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem' }}
                                            >Definir</button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Gradable Exercises Section */}
                    <section>
                        <h4 style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <FileText size={12} /> Exercicis Corregibles
                        </h4>
                        {exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages').length === 0 ? (
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Cap exercici definit.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages').map((ex, idx) => {
                                    const isCurrentPageInvolved = ex.type === 'pages'
                                        ? (ex as PagesExercise).pageIndexes.includes(currentPageIndex)
                                        : (ex as any).pageIndex === currentPageIndex;

                                    const isSelectedInList = ex.id === selectedId;

                                    return (
                                        <div
                                            key={ex.id}
                                            onClick={() => {
                                                if (ex.type === 'crop') {
                                                    setCurrentPageIndex((ex as any).pageIndex);
                                                }
                                                setSelectedId(ex.id);
                                            }}
                                            style={{
                                                padding: '0.75rem', background: isSelectedInList ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)', borderRadius: '0.5rem',
                                                border: isSelectedInList ? '2px solid var(--accent)' : (isCurrentPageInvolved ? '1px solid var(--accent)' : '1px solid var(--border)'),
                                                display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                                transition: 'all 0.2s ease',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                                                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: ex.type === 'pages' ? 'var(--accent)' : '#6366f1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800 }}>{idx + 1}</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '2px' }}>
                                                        <span style={{ fontSize: '0.55rem', fontWeight: 800, color: ex.type === 'pages' ? 'var(--accent)' : '#6366f1', textTransform: 'uppercase' }}>
                                                            {ex.type === 'pages' ? '📄 Exercici de Pàgina' : '✂️ Exercici de Retall'}
                                                        </span>
                                                        <input
                                                            ref={(el) => { inputRefs.current[ex.id] = el; }}
                                                            type="text" value={ex.name || ''} placeholder="Nom exercici"
                                                            onChange={e => updateExerciseMeta(ex.id, { name: e.target.value })}
                                                            style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem' }}
                                                        />
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.2rem', marginLeft: '0.4rem' }}>
                                                    <button onClick={() => removeExercise(ex.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }} title="Eliminar exercici"><Trash2 size={14} /></button>
                                                </div>
                                            </div>

                                            {ex.type === 'pages' && (
                                                <div style={{ marginLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>PÀGINES:</span>
                                                        {(ex as PagesExercise).pageIndexes.map(pIdx => (
                                                            <div key={pIdx} style={{
                                                                display: 'flex', alignItems: 'center', gap: '2px',
                                                                background: pIdx === currentPageIndex ? 'var(--accent)' : 'var(--bg-primary)',
                                                                color: pIdx === currentPageIndex ? 'white' : 'var(--text-primary)',
                                                                padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem', border: '1px solid var(--border)'
                                                            }}>
                                                                {pIdx + 1}
                                                                <button
                                                                    onClick={() => {
                                                                        const newPages = (ex as PagesExercise).pageIndexes.filter(p => p !== pIdx);
                                                                        if (newPages.length > 0) {
                                                                            updateExerciseMeta(ex.id, { pageIndexes: newPages });
                                                                        } else {
                                                                            removeExercise(ex.id);
                                                                        }
                                                                    }}
                                                                    style={{ background: 'none', border: 'none', color: pIdx === currentPageIndex ? 'white' : 'var(--danger)', padding: 0, cursor: 'pointer', fontSize: '0.6rem', marginLeft: '2px', display: 'flex' }}
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ))}

                                                        {!(ex as PagesExercise).pageIndexes.includes(currentPageIndex) && (
                                                            <button
                                                                onClick={() => addPageToExistingExercise(ex.id)}
                                                                style={{
                                                                    background: 'var(--bg-secondary)', border: '1px dashed var(--accent)',
                                                                    borderRadius: '3px', fontSize: '0.65rem', padding: '1px 5px',
                                                                    cursor: 'pointer', color: 'var(--accent)', fontWeight: 600,
                                                                    display: 'flex', alignItems: 'center', gap: '2px'
                                                                }}
                                                                title={`Afegir la pàgina ${currentPageIndex + 1} actual`}
                                                            >
                                                                <Plus size={10} /> Afegir pàg. {currentPageIndex + 1}
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => {
                                                                const pStr = window.prompt("Número de pàgina a afegir (1 a " + pagesPerExam + "):");
                                                                if (pStr) {
                                                                    const pNum = parseInt(pStr);
                                                                    if (!isNaN(pNum) && pNum >= 1 && pNum <= pagesPerExam) {
                                                                        const pIdx = pNum - 1;
                                                                        const currentPages = (ex as PagesExercise).pageIndexes;
                                                                        if (!currentPages.includes(pIdx)) {
                                                                            updateExerciseMeta(ex.id, { pageIndexes: [...currentPages, pIdx].sort((a, b) => a - b) });
                                                                        }
                                                                    }
                                                                }
                                                            }}
                                                            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '3px', fontSize: '0.65rem', padding: '1px 4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                                            title="Afegir pàgina per número"
                                                        >
                                                            <Plus size={10} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1.5rem' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Màx:</span>
                                                <NumericInput value={ex.maxScore} onChange={val => updateExerciseMeta(ex.id, { maxScore: val })} style={{ width: '40px' }} />

                                                {ex.type === 'crop' && (
                                                    <button
                                                        onClick={() => {
                                                            const pagesEx: PagesExercise = {
                                                                id: ex.id,
                                                                type: 'pages',
                                                                name: ex.name,
                                                                maxScore: ex.maxScore,
                                                                scoringMode: ex.scoringMode,
                                                                rubric: ex.rubric,
                                                                pageIndexes: [(ex as any).pageIndex]
                                                            };
                                                            setExercises(prev => prev.map(e => e.id === ex.id ? pagesEx : e));
                                                        }}
                                                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)', borderRadius: '4px', fontSize: '0.6rem', padding: '2px 6px', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}
                                                        title="Convertir aquest retall en un exercici de pàgina sencera (permet afegir més pàgines)"
                                                    >
                                                        PASSAR A PÀGINES
                                                    </button>
                                                )}

                                                {ex.type === 'pages' && (
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', marginLeft: '0.2rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={(ex as any).spansTwoPages || false}
                                                            onChange={e => updateExerciseMeta(ex.id, { spansTwoPages: e.target.checked })}
                                                        />
                                                        <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>Vista 2p</span>
                                                    </label>
                                                )}

                                                <div style={{ flex: 1 }}></div>

                                                <div style={{ display: 'flex', gap: '0.2rem' }}>
                                                    {(['from_max', 'from_zero'] as const).map(m => (
                                                        <button key={m}
                                                            onClick={() => updateExerciseMeta(ex.id, { scoringMode: m })}
                                                            style={{
                                                                fontSize: '0.6rem', padding: '2px 5px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                                                background: (ex.scoringMode ?? 'from_max') === m ? 'var(--accent)' : 'var(--bg-primary)',
                                                                color: (ex.scoringMode ?? 'from_max') === m ? 'white' : 'var(--text-secondary)'
                                                            }}
                                                        >{m === 'from_max' ? 'Max' : 'Rúb'}</button>
                                                    ))}
                                                </div>
                                            </div>

                                            {ex.scoringMode === 'from_zero' && (
                                                <div style={{ marginLeft: '1.5rem', padding: '0.4rem', background: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                                    {(ex.rubric ?? []).map((item, ri) => (
                                                        <div key={item.id} style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                                                            <input type="text" value={item.label} placeholder="Ítem" onChange={e => {
                                                                const newRubric = (ex.rubric ?? []).map((it, i) => i === ri ? { ...it, label: e.target.value } : it);
                                                                updateExerciseMeta(ex.id, { rubric: newRubric });
                                                            }} style={{ flex: 1, fontSize: '0.65rem', padding: '1px 3px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--text-primary)' }} />
                                                            <NumericInput value={item.points} onChange={val => {
                                                                if (val === undefined) return;
                                                                const newRubric = (ex.rubric ?? []).map((it, i) => i === ri ? { ...it, points: val } : it);
                                                                updateExerciseMeta(ex.id, { rubric: newRubric });
                                                            }} style={{ width: '35px', padding: '1px' }} />
                                                            <button onClick={() => updateExerciseMeta(ex.id, { rubric: (ex.rubric ?? []).filter((_, i) => i !== ri) })} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.7rem', padding: 0 }}>✕</button>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => updateExerciseMeta(ex.id, { rubric: [...(ex.rubric ?? []), { id: `ri_${Date.now()}`, label: '', points: 0.5 }] })} style={{ fontSize: '0.6rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>+ Ítem</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => onComplete(exercises)}>
                        <Check size={18} /> Finalitzar Configuració
                    </button>
                </div>
            </div>

            {/* Editor Main Canvas */}
            <div
                className="workspace"
                ref={containerRef}
                style={{
                    background: 'var(--bg-tertiary)',
                    overflow: 'hidden', // Let stage handle pan
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: 1,
                    minHeight: 0
                }}
            >
                {/* Pagination controls */}
                <div className="glass-dark" style={{ position: 'absolute', top: '1rem', zIndex: 10, display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', borderRadius: '2rem' }}>
                    <button
                        className="btn-icon"
                        style={{ color: 'white' }}
                        disabled={currentPageIndex === 0}
                        onClick={() => setCurrentPageIndex(p => Math.max(0, p - 1))}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <span style={{ color: 'white', fontWeight: 500 }}>
                        Page {currentPageIndex + 1} / {pagesPerExam}
                    </span>
                    <button
                        className="btn-icon"
                        style={{ color: 'white' }}
                        disabled={currentPageIndex === pagesPerExam - 1}
                        onClick={() => setCurrentPageIndex(p => Math.min(pagesPerExam - 1, p + 1))}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                {bgImage ? (
                    <div className="canvas-container" style={{ width: '100%', height: '100%', cursor: mode !== 'select' ? 'crosshair' : 'grab' }}>
                        <Stage
                            ref={stageRef}
                            width={containerRef.current?.clientWidth || window.innerWidth - 320}
                            height={containerRef.current?.clientHeight || window.innerHeight}
                            scaleX={stageScale}
                            scaleY={stageScale}
                            x={stagePos.x}
                            y={stagePos.y}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            onTouchStart={handleMouseDown}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            onWheel={handleWheel}
                            onClick={(e) => {
                                // Deselect when clicking on empty area
                                if (e.target === e.target.getStage()) {
                                    setSelectedId(null);
                                }
                            }}
                            onTap={(e) => {
                                // Deselect when tapping on empty area
                                if (e.target === e.target.getStage()) {
                                    setSelectedId(null);
                                }
                            }}
                            draggable={mode === 'select'}
                            onDragEnd={(e) => {
                                setStagePos({ x: e.target.x(), y: e.target.y() });
                            }}
                        >
                            <Layer>
                                <KonvaImage
                                    image={bgImage}
                                    x={0}
                                    y={0}
                                    width={bgImage.width}
                                    height={bgImage.height}
                                />

                                {currentPageRegions.map((region) => {
                                    const { fill, stroke, label } = getRegionStyle(region.type);
                                    const isSelected = region.id === selectedId;

                                    return (
                                        <Group
                                            key={region.id}
                                            draggable={mode === 'select'}
                                            onClick={(e) => {
                                                if (mode === 'select') {
                                                    e.cancelBubble = true;
                                                    setSelectedId(region.id);
                                                }
                                            }}
                                            onTap={(e) => {
                                                if (mode === 'select') {
                                                    e.cancelBubble = true;
                                                    setSelectedId(region.id);
                                                }
                                            }}
                                            onDragEnd={(e) => {
                                                const x = e.target.x();
                                                const y = e.target.y();
                                                setExercises(prev => prev.map(ex => ex.id === region.id ? { ...ex, x, y } : ex));
                                                e.target.x(0); // Reset local pos because we update exercise state
                                                e.target.y(0);
                                            }}
                                            x={region.x}
                                            y={region.y}
                                        >
                                            <Rect
                                                name="regionRect"
                                                x={0}
                                                y={0}
                                                width={region.width}
                                                height={region.height}
                                                fill={fill}
                                                stroke={stroke}
                                                strokeWidth={2 / stageScale}
                                            />
                                            <Rect
                                                x={0}
                                                y={-(24 / stageScale)}
                                                width={Math.max(80, label.length * 8 + 16) / stageScale}
                                                height={24 / stageScale}
                                                fill={stroke}
                                            />
                                            <Text
                                                text={label}
                                                fill="white"
                                                x={8 / stageScale}
                                                y={-(18 / stageScale)}
                                                fontSize={12 / stageScale}
                                                fontFamily="system-ui"
                                            />

                                            {isSelected && mode === 'select' && (
                                                <Transformer
                                                    ref={(node) => {
                                                        if (node && node.getNode() && node.getNode().getStage()) {
                                                            const parent = node.getParent();
                                                            if (parent) {
                                                                const rectNode = parent.findOne('.regionRect');
                                                                if (rectNode) node.nodes([rectNode]);
                                                            }
                                                        }
                                                    }}
                                                    boundBoxFunc={(oldBox, newBox) => {
                                                        if (newBox.width < 10 || newBox.height < 10) return oldBox;
                                                        return newBox;
                                                    }}
                                                    onTransformEnd={(e) => {
                                                        const node = e.target;
                                                        const scaleX = node.scaleX();
                                                        const scaleY = node.scaleY();
                                                        const newWidth = Math.max(10, node.width() * scaleX);
                                                        const newHeight = Math.max(10, node.height() * scaleY);

                                                        // Update the data model
                                                        setExercises(prev => prev.map(ex => ex.id === region.id ? {
                                                            ...ex,
                                                            width: newWidth,
                                                            height: newHeight
                                                        } : ex));

                                                        // Reset scale back to 1 since we apply it to width/height
                                                        node.scaleX(1);
                                                        node.scaleY(1);
                                                    }}
                                                    ignoreStroke={true}
                                                    rotateEnabled={false}
                                                    keepRatio={false}
                                                    borderStroke="#3b82f6"
                                                    anchorSize={12 / stageScale}
                                                />
                                            )}
                                        </Group>
                                    );
                                })}

                                {isDrawing && newCropRef && (() => {
                                    const typeForStyle = mode === 'draw' ? 'crop' : mode === 'draw_qr' ? 'qr_code' : mode === 'draw_ocr' ? 'ocr_name' : 'total_score';
                                    const { fill, stroke } = getRegionStyle(typeForStyle);
                                    return (
                                        <Rect
                                            x={newCropRef.x || 0}
                                            y={newCropRef.y || 0}
                                            width={newCropRef.width || 0}
                                            height={newCropRef.height || 0}
                                            fill={fill}
                                            stroke={stroke}
                                            strokeWidth={2 / stageScale}
                                            dash={[5 / stageScale, 5 / stageScale]}
                                        />
                                    );
                                })()}
                            </Layer>
                        </Stage>
                    </div>
                ) : (
                    <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '20vh' }}>
                        <div className="loader"></div>
                        Rendering template page...
                    </div>
                )}
            </div>
        </div >
    );
}
