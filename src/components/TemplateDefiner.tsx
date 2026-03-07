import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group, Text } from 'react-konva';
import { ChevronLeft, ChevronRight, Check, Trash2, MousePointer2, Square, Plus, File, Award, QrCode, TextSelect } from 'lucide-react';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas } from '../utils/pdfUtils';
import type { ExerciseDef, CropExercise, PagesExercise, RubricItem } from '../types';

interface Props {
    pdfDoc: PDFDocumentProxy;
    pagesPerExam: number;
    initialExercises: ExerciseDef[];
    onComplete: (crops: ExerciseDef[]) => void;
    onBack?: () => void;
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
            // Single touch - allow drawing or panning
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
            <div className="sidebar" style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {onBack && (
                        <button className="btn-icon" onClick={onBack} title="Back">
                            <ChevronLeft />
                        </button>
                    )}
                    <div>
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem', fontWeight: 600 }}>Define Exercises</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            Page {currentPageIndex + 1} of {pagesPerExam}. Draw bounding boxes or add entire pages.
                        </p>
                    </div>
                </div>

                <div style={{ padding: '1rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    <button
                        className={`btn-icon ${mode === 'select' ? 'active' : ''}`}
                        onClick={() => setMode('select')}
                        title="Select/Delete Region"
                    >
                        <MousePointer2 size={20} />
                    </button>
                    <button
                        className={`btn-icon ${mode === 'draw' ? 'active' : ''}`}
                        onClick={() => setMode('draw')}
                        title="Draw Crop Rectangle"
                    >
                        <Square size={20} />
                    </button>
                    <button
                        className={`btn-icon ${mode === 'draw_qr' ? 'active' : ''}`}
                        onClick={() => setMode('draw_qr')}
                        title="Define QR Code Area"
                        style={{ color: mode === 'draw_qr' ? '#10b981' : undefined }}
                    >
                        <QrCode size={20} />
                    </button>
                    <button
                        className={`btn-icon ${mode === 'draw_ocr' ? 'active' : ''}`}
                        onClick={() => setMode('draw_ocr')}
                        title="Define OCR Name Area (for non-QR users)"
                        style={{ color: mode === 'draw_ocr' ? '#eab308' : undefined }}
                    >
                        <TextSelect size={20} />
                    </button>
                    <button
                        className={`btn-icon ${mode === 'draw_total_score' ? 'active' : ''}`}
                        onClick={() => setMode('draw_total_score')}
                        title="Define Final Score Area"
                        style={{ color: mode === 'draw_total_score' ? '#ef4444' : undefined }}
                    >
                        <Award size={20} />
                    </button>

                    <div style={{ width: '1px', background: 'var(--border)', margin: '0 0.5rem' }}></div>

                    <button
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                        onClick={addFullPageExercise}
                        title="Define this entire page as an exercise"
                    >
                        <File size={16} /> Add Full Page
                    </button>
                </div>

                <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
                    <h4 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        All Defined Exercises ({exercises.length})
                    </h4>
                    {exercises.length === 0 ? (
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>No exercises defined yet.</p>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {exercises.map((ex, idx) => {
                                const isCurrentPageInvolved = ex.type === 'pages'
                                    ? (ex as PagesExercise).pageIndexes.includes(currentPageIndex)
                                    : (ex as any).pageIndex === currentPageIndex;

                                return (
                                    <li key={ex.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem',
                                        background: 'var(--bg-tertiary)', borderRadius: '0.5rem', border: isCurrentPageInvolved ? '1px solid var(--accent)' : '1px solid var(--border)'
                                    }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                                                        {ex.type === 'qr_code' ? 'QR Area' : ex.type === 'total_score' ? 'Nota Final' : `Exercise ${idx + 1}`}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                        {ex.type === 'pages'
                                                            ? `Full Pages: ${(ex as PagesExercise).pageIndexes.map(p => p + 1).join(', ')}`
                                                            : ex.type === 'qr_code' ? `Localització a pàg ${(ex as any).pageIndex + 1}`
                                                                : ex.type === 'total_score' ? `Localització a pàg ${(ex as any).pageIndex + 1}`
                                                                    : `Crop on Page ${(ex as any).pageIndex + 1}`
                                                        }
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                    {ex.type === 'pages' && !(ex as PagesExercise).pageIndexes.includes(currentPageIndex) && (
                                                        <button className="btn-icon" onClick={() => addPageToExistingExercise(ex.id)} title="Add current page to this exercise" style={{ padding: '0.25rem' }}>
                                                            <Plus size={16} />
                                                        </button>
                                                    )}
                                                    <button className="btn-icon" onClick={() => removeExercise(ex.id)} title="Delete EX" style={{ color: 'var(--danger)', padding: '0.25rem' }}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                                <input
                                                    ref={el => inputRefs.current[ex.id] = el}
                                                    type="text"
                                                    placeholder="Name (e.g. Ex 1a)"
                                                    value={ex.name || ''}
                                                    onChange={e => updateExerciseMeta(ex.id, { name: e.target.value })}
                                                    style={{
                                                        flex: 1,
                                                        background: 'var(--bg-primary)',
                                                        border: '1px solid var(--border)',
                                                        color: 'var(--text-primary)',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '0.25rem',
                                                        fontSize: '0.8rem'
                                                    }}
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Max points"
                                                    value={ex.maxScore || ''}
                                                    onChange={e => updateExerciseMeta(ex.id, { maxScore: parseFloat(e.target.value) || undefined })}
                                                    style={{
                                                        width: '80px',
                                                        background: 'var(--bg-primary)',
                                                        border: '1px solid var(--border)',
                                                        color: 'var(--text-primary)',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '0.25rem',
                                                        fontSize: '0.8rem'
                                                    }}
                                                    min="0"
                                                    step="0.25"
                                                />
                                            </div>

                                            {/* Scoring mode toggle + rubric editor — only for scorable exercises */}
                                            {(ex.type === 'crop' || ex.type === 'pages') && (
                                                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                    {/* Scoring mode pills */}
                                                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Mode:</span>
                                                        {(['from_max', 'from_zero'] as const).map(m => (
                                                            <button key={m}
                                                                onClick={() => updateExerciseMeta(ex.id, {
                                                                    scoringMode: m,
                                                                    rubric: m === 'from_zero' ? (ex.rubric ?? []) : undefined,
                                                                    maxScore: m === 'from_zero' ? undefined : ex.maxScore
                                                                })}
                                                                style={{
                                                                    fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px',
                                                                    border: 'none', cursor: 'pointer',
                                                                    background: (ex.scoringMode ?? 'from_max') === m ? 'var(--accent)' : 'var(--bg-primary)',
                                                                    color: (ex.scoringMode ?? 'from_max') === m ? 'white' : 'var(--text-secondary)'
                                                                }}
                                                            >
                                                                {m === 'from_max' ? '↓ des del màx' : '↑ des de zero'}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Rubric items editor */}
                                                    {ex.scoringMode === 'from_zero' && (
                                                        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '0.375rem', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ítems de rúbrica</span>
                                                            {(ex.rubric ?? []).map((item, ri) => (
                                                                <div key={item.id} style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                                                    <input
                                                                        type="text"
                                                                        value={item.label}
                                                                        placeholder="Descripció"
                                                                        onChange={e => {
                                                                            const newRubric = (ex.rubric ?? []).map((it, i) => i === ri ? { ...it, label: e.target.value } : it);
                                                                            updateExerciseMeta(ex.id, { rubric: newRubric });
                                                                        }}
                                                                        style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-primary)' }}
                                                                    />
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        value={item.points}
                                                                        onChange={e => {
                                                                            const newRubric = (ex.rubric ?? []).map((it, i) => i === ri ? { ...it, points: parseFloat(e.target.value) || 0 } : it);
                                                                            updateExerciseMeta(ex.id, { rubric: newRubric });
                                                                        }}
                                                                        style={{ width: '52px', fontSize: '0.75rem', padding: '2px 4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-primary)', textAlign: 'right' }}
                                                                    />
                                                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>pt</span>
                                                                    <button
                                                                        onClick={() => updateExerciseMeta(ex.id, { rubric: (ex.rubric ?? []).filter((_, i) => i !== ri) })}
                                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '0.8rem', padding: '0 2px' }}
                                                                    >✕</button>
                                                                </div>
                                                            ))}
                                                            <button
                                                                onClick={() => {
                                                                    const newItem: RubricItem = { id: `ri_${Date.now()}`, label: '', points: 0.5 };
                                                                    updateExerciseMeta(ex.id, { rubric: [...(ex.rubric ?? []), newItem] });
                                                                }}
                                                                style={{ fontSize: '0.7rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0' }}
                                                            >+ Afegir ítem</button>
                                                        </div>
                                                    )}

                                                    {/* Two-page crop toggle — only for pages */}
                                                    {ex.type === 'pages' && (
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={(ex as any).spansTwoPages === true}
                                                                onChange={e => {
                                                                    const isChecked = e.target.checked;
                                                                    setExercises(prev => prev.map(pEx => {
                                                                        if (pEx.id === ex.id && pEx.type === 'pages') {
                                                                            let newPages = [...pEx.pageIndexes];
                                                                            if (isChecked) {
                                                                                // Add next page if not already there and within bounds
                                                                                const lastPage = Math.max(...newPages);
                                                                                if (lastPage + 1 < pagesPerExam && !newPages.includes(lastPage + 1)) {
                                                                                    newPages.push(lastPage + 1);
                                                                                    newPages.sort((a, b) => a - b);
                                                                                }
                                                                            }
                                                                            return { ...pEx, pageIndexes: newPages, spansTwoPages: isChecked };
                                                                        }
                                                                        return pEx;
                                                                    }));
                                                                }}
                                                            />
                                                            Abasta 2 pàgines simultànies
                                                        </label>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => onComplete(exercises)}>
                        <Check size={18} /> Finish Setup
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
                                    return (
                                        <Group key={region.id}>
                                            <Rect
                                                x={region.x}
                                                y={region.y}
                                                width={region.width}
                                                height={region.height}
                                                fill={fill}
                                                stroke={stroke}
                                                strokeWidth={2 / stageScale}
                                            />
                                            <Rect
                                                x={region.x}
                                                y={region.y - (24 / stageScale)}
                                                width={Math.max(80, label.length * 8 + 16) / stageScale}
                                                height={24 / stageScale}
                                                fill={stroke}
                                            />
                                            <Text
                                                text={label}
                                                fill="white"
                                                x={region.x + (8 / stageScale)}
                                                y={region.y - (18 / stageScale)}
                                                fontSize={12 / stageScale}
                                                fontFamily="system-ui"
                                            />
                                        </Group>
                                    )
                                })}

                                {isDrawing && newCropRef && (
                                    <Rect
                                        x={newCropRef.x || 0}
                                        y={newCropRef.y || 0}
                                        width={newCropRef.width || 0}
                                        height={newCropRef.height || 0}
                                        fill={getRegionStyle(mode === 'draw' ? 'crop' : 'total_score').fill}
                                        stroke={getRegionStyle(mode === 'draw' ? 'crop' : 'total_score').stroke}
                                        strokeWidth={2 / stageScale}
                                        dash={[5 / stageScale, 5 / stageScale]}
                                    />
                                )}
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
        </div>
    );
}
