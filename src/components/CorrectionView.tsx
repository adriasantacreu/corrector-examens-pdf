import { useState, useEffect, useRef, useMemo } from 'react';

declare global {
    interface Window {
        google: any;
    }
}

import {
    ChevronLeft, ChevronRight, Check, Pencil, Plus, Minus,
    Download, RotateCcw, Highlighter as HighlighterIcon,
    Type, Image as ImageIcon, Eraser, MousePointer2,
    RefreshCw, X
} from 'lucide-react';

import { Stage, Layer, Image as KonvaImage, Line, Rect, Text, Group, Transformer } from 'react-konva';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas } from '../utils/pdfUtils';
import type {
    Student, ExerciseDef, Annotation, AnnotationStore,
    PenAnnotation, HighlighterAnnotation, TextAnnotation,
    RubricCountStore,
    PagesExercise
} from '../types';
import { exportAnnotatedPDF, exportOriginalLayoutPDF } from '../utils/pdfExport';
import NumericInput from './NumericInput';

interface Props {
    pdfDoc: PDFDocumentProxy;
    students: Student[];
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    commentBank: import('../types').AnnotationComment[];
    targetMaxScore: number;
    onUpdateCommentBank: (bank: import('../types').AnnotationComment[]) => void;
    onUpdateTargetMaxScore: (score: number) => void;
    onBack: () => void;
    onFinish: () => void;
    onUpdateAnnotations: (studentId: string, exerciseId: string, annotations: Annotation[]) => void;
    onUpdateRubricCounts: (studentId: string, exerciseId: string, rubricItemId: string, delta: number) => void;
    onUpdateExercise: (exercise: ExerciseDef) => void;
    studentIdx: number;
    exerciseIdx: number;
    onUpdateStudentIdx: (idx: number) => void;
    onUpdateExerciseIdx: (idx: number) => void;
    showDialog: (title: string, message: string) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

interface RenderedPage {
    img: HTMLImageElement;
    width: number;
    height: number;
    yOffset: number;
    xOffset: number;
}

type Tool = 'pen' | 'highlighter' | 'text' | 'image' | 'eraser' | 'select';

const HIGHLIGHTER_PRESETS = [
    { id: 'h1', label: 'Error Procediment', color: 'rgba(239, 68, 68, 0.4)', points: -0.5 },
    { id: 'h2', label: 'Error Càlcul', color: 'rgba(249, 115, 22, 0.4)', points: -0.25 },
    { id: 'h3', label: 'Falta Raonament', color: 'rgba(234, 179, 8, 0.4)', points: -0.5 },
    { id: 'h4', label: 'Error Greu', color: 'rgba(225, 29, 72, 0.4)', points: -1.0 },
    { id: 'h5', label: 'Anotació Bona', color: 'rgba(16, 185, 129, 0.4)', points: 0.5 },
];

export default function CorrectionView({
    pdfDoc, students, exercises, annotations, rubricCounts, commentBank,
    onBack, onFinish,
    onUpdateAnnotations, onUpdateRubricCounts, onUpdateExercise,
    studentIdx, exerciseIdx, onUpdateStudentIdx, onUpdateExerciseIdx
}: Props) {
    const [tool, setTool] = useState<Tool>('pen');
    const [color, _setColor] = useState('#ef4444');
    const [strokeWidth, setStrokeWidth] = useState(2);
    const [fontSize, _setFontSize] = useState(24);
    const [highlighterLabelMode, setHighlighterLabelMode] = useState<'individual' | 'legend'>('individual');

    const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [selectedAnnotationId, setSelectedId] = useState<string | null>(null);
    const [isEditingRubric, setIsEditingRubric] = useState(false);

    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState<{ done: number, total: number } | null>(null);

    const stageRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastDistRef = useRef<number>(0);

    const currentStudent = students[studentIdx];
    const currentExercise = exercises[exerciseIdx];
    const currentAnnotations = useMemo(() => (currentStudent && currentExercise)
        ? (annotations[currentStudent.id]?.[currentExercise.id] ?? [])
        : [], [annotations, currentStudent?.id, currentExercise?.id]);

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    const currentExRubricCounts = (currentStudent && currentExercise)
        ? (rubricCounts?.[currentStudent.id]?.[currentExercise.id] ?? {})
        : {};

    const rubricAdjustment = (currentExercise?.rubric ?? []).reduce((sum: number, item: any) => {
        return sum + item.points * (currentExRubricCounts[item.id] ?? 0);
    }, 0);

    const highlightAdjustment = currentAnnotations.reduce((sum: number, ann: any) => {
        if (ann.type === 'highlighter' && typeof ann.points === 'number') return sum + ann.points;
        if (ann.type === 'text' && typeof ann.score === 'number') return sum + ann.score;
        return sum;
    }, 0);

    const computedScore = currentExercise
        ? Math.max(0, (currentExercise.scoringMode === 'from_zero' ? 0 : (currentExercise.maxScore || 0)) + rubricAdjustment + highlightAdjustment)
        : null;

    useEffect(() => {
        let isMounted = true;
        setRenderedPages([]);
        setIsPageLoading(true);

        const loadExerciseRegions = async () => {
            if (!containerRef.current || !currentStudent || !currentExercise) return;

            const images: RenderedPage[] = [];
            let currentYOffset = 0;

            console.log(`[PAGE DEBUG] START Loading regions for student: ${currentStudent.name} (${currentStudent.id})`);
            console.log(`[PAGE DEBUG] Student pageIndexes:`, currentStudent.pageIndexes);
            console.log(`[PAGE DEBUG] Exercise: ${currentExercise.name} (${currentExercise.id}), Type: ${currentExercise.type}`);

            try {
                if (currentExercise.type === 'crop') {
                    console.log(`[PAGE DEBUG] CROP mode. currentExercise.pageIndex (logical): ${currentExercise.pageIndex}`);
                    let actualPageIndex = currentStudent.pageIndexes[currentExercise.pageIndex];
                    console.log(`[PAGE DEBUG] Mapped actualPageIndex (absolute): ${actualPageIndex}`);

                    if ((actualPageIndex === undefined || actualPageIndex === -1) && currentStudent.pageIndexes.length > 0 && currentExercise.pageIndex > 0) {
                        const baseIndex = currentStudent.pageIndexes.find(p => p > 0) || 1;
                        const guessedIndex = baseIndex + currentExercise.pageIndex;
                        if (guessedIndex <= pdfDoc.numPages) {
                            actualPageIndex = guessedIndex;
                            console.log(`[PAGE DEBUG] Guessed page index ${guessedIndex}`);
                        }
                    }

                    if (actualPageIndex !== undefined && actualPageIndex >= 1 && actualPageIndex <= pdfDoc.numPages && !isNaN(actualPageIndex)) {
                        console.log(`[PAGE DEBUG] Loading absolute page ${actualPageIndex}`);
                        const canvas = document.createElement('canvas');
                        const dimensions = await renderPDFPageToCanvas(pdfDoc, actualPageIndex, canvas, 2.5, isDarkMode);
                        if (dimensions) {
                            const cropCanvas = document.createElement('canvas');
                            cropCanvas.width = currentExercise.width;
                            cropCanvas.height = currentExercise.height;
                            const ctx = cropCanvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(canvas,
                                    currentExercise.x, currentExercise.y, currentExercise.width, currentExercise.height,
                                    0, 0, currentExercise.width, currentExercise.height);
                                const img = new Image();
                                img.src = cropCanvas.toDataURL('image/png');
                                await new Promise(r => img.onload = r);
                                images.push({ img, width: currentExercise.width, height: currentExercise.height, yOffset: 0, xOffset: 0 });
                            }
                        }
                    } else {
                        console.warn(`[PAGE DEBUG] Invalid actualPageIndex: ${actualPageIndex}`);
                    }
                } else if (currentExercise.type === 'pages') {
                    const spansTwoPages = (currentExercise as any).spansTwoPages;
                    const pageIndexes = (currentExercise as PagesExercise).pageIndexes;
                    console.log(`[PAGE DEBUG] PAGES mode. Logical pageIndexes:`, pageIndexes);

                    let prevWidth = 0;
                    for (let i = 0; i < pageIndexes.length; i++) {
                        const pageIdx = pageIndexes[i];
                        let actualPageIndex = currentStudent.pageIndexes[pageIdx];
                        console.log(`[PAGE DEBUG] Iteration ${i}: logicalIdx ${pageIdx} -> initial actualPageIndex ${actualPageIndex}`);

                        if ((actualPageIndex === undefined || actualPageIndex === -1) && currentStudent.pageIndexes.length > 0 && pageIdx > 0) {
                            const baseIndex = currentStudent.pageIndexes.find(p => p > 0) || 1;
                            const guessedIndex = baseIndex + pageIdx;
                            if (guessedIndex <= pdfDoc.numPages) {
                                actualPageIndex = guessedIndex;
                                console.log(`[PAGE DEBUG] Guessed page index ${guessedIndex}`);
                            }
                        }

                        if (actualPageIndex === undefined || actualPageIndex < 1 || actualPageIndex > pdfDoc.numPages || isNaN(actualPageIndex)) {
                            console.warn(`[PAGE DEBUG] Skipping invalid page: ${actualPageIndex}`);
                            continue;
                        }

                        console.log(`[PAGE DEBUG] Loading absolute page ${actualPageIndex}`);
                        const canvas = document.createElement('canvas');
                        const dimensions = await renderPDFPageToCanvas(pdfDoc, actualPageIndex, canvas, 2.5, isDarkMode);
                        if (dimensions) {
                            const img = new Image();
                            img.src = canvas.toDataURL('image/png');
                            await new Promise(r => img.onload = r);

                            const isRightSide = spansTwoPages && i % 2 !== 0;
                            const xOffset = isRightSide ? prevWidth + 20 : 0;

                            images.push({ img, width: dimensions.width, height: dimensions.height, xOffset, yOffset: currentYOffset });

                            if (!spansTwoPages || isRightSide || i === pageIndexes.length - 1) {
                                currentYOffset += dimensions.height + 20;
                            }
                            prevWidth = dimensions.width;
                        }
                    }
                }

                if (!isMounted) return;

                if (images.length > 0 && containerRef.current) {
                    const totalWidth = ((currentExercise.type === 'pages' && (currentExercise as any).spansTwoPages && images.length > 1)
                        ? images.filter(i => i.xOffset === 0)[0]?.width + Math.max(...images.filter(i => i.xOffset !== 0).map(i => i.width), 0) + 20
                        : Math.max(...images.map(img => img.width)));

                    const totalHeight = Math.max(...images.map(img => img.yOffset + img.height));

                    const containerWidth = containerRef.current.clientWidth;
                    const containerHeight = containerRef.current.clientHeight;

                    const padding = 40;
                    const targetScaleX = (containerWidth - padding) / totalWidth;
                    const targetScaleY = (containerHeight - padding) / totalHeight;
                    const targetScale = Math.min(targetScaleX, targetScaleY, 1.2);

                    setStageScale(targetScale);
                    setStagePos({
                        x: (containerWidth - (totalWidth * targetScale)) / 2,
                        y: Math.max(20, (containerHeight - (totalHeight * targetScale)) / 2)
                    });
                }

                setRenderedPages(images);
            } catch (err) {
                console.error("Error loading exercise regions:", err);
            } finally {
                setIsPageLoading(false);
            }
        };

        loadExerciseRegions();
        return () => { isMounted = false; };
    }, [currentStudent?.id, currentExercise?.id, pdfDoc, isDarkMode]);

    const handleMouseDown = (e: any) => {
        if (tool === 'select') return;
        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const x = (pos.x - stage.x()) / stageScale;
        const y = (pos.y - stage.y()) / stageScale;

        if (tool === 'eraser') {
            const clickedAnn = currentAnnotations.find((ann: any) => {
                if (ann.type === 'pen') {
                    for (let i = 0; i < ann.points.length; i += 2) {
                        const dist = Math.sqrt(Math.pow(ann.points[i] - x, 2) + Math.pow(ann.points[i + 1] - y, 2));
                        if (dist < 10) return true;
                    }
                } else {
                    return x >= ann.x && x <= ann.x + (ann.width || 20) && y >= ann.y && y <= ann.y + (ann.height || 20);
                }
                return false;
            });
            if (clickedAnn) onUpdateAnnotations(currentStudent.id, currentExercise.id, currentAnnotations.filter((a: any) => a.id !== clickedAnn.id));
            return;
        }

        const id = `ann_${Date.now()}`;
        let newAnn: Annotation | null = null;

        if (tool === 'pen') {
            newAnn = { id, type: 'pen', points: [x, y], color, strokeWidth, opacity: 1 } as PenAnnotation;
        } else if (tool === 'highlighter') {
            newAnn = { id, type: 'highlighter', x, y, width: 0, height: 0, color: 'rgba(255, 255, 0, 0.3)', points: 0, label: '' } as HighlighterAnnotation;
        } else if (tool === 'text') {
            newAnn = { id, type: 'text', x, y, text: '', color, fontSize, align: 'left', baseline: 'top' } as TextAnnotation;
        }

        if (newAnn) {
            onUpdateAnnotations(currentStudent.id, currentExercise.id, [...currentAnnotations, newAnn]);
            setSelectedId(id);
        }
    };

    const handleMouseMove = (e: any) => {
        if (!selectedAnnotationId || tool === 'select' || tool === 'eraser') return;
        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const x = (pos.x - stage.x()) / stageScale;
        const y = (pos.y - stage.y()) / stageScale;

        const updated = currentAnnotations.map((ann: any) => {
            if (ann.id !== selectedAnnotationId) return ann;
            if (ann.type === 'pen') return { ...ann, points: [...ann.points, x, y] };
            if (ann.type === 'highlighter') return { ...ann, width: x - ann.x, height: y - ann.y };
            return ann;
        });

        onUpdateAnnotations(currentStudent.id, currentExercise.id, updated);
    };

    const handleMouseUp = () => {
        if (tool !== 'select') setSelectedId(null);
    };

    const handleWheel = (e: any) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        if (e.evt.ctrlKey) {
            const scaleBy = 1.1;
            const oldScale = stage.scaleX();
            const pointer = stage.getPointerPosition();
            if (!pointer) return;
            const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
            const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
            if (newScale < 0.1 || newScale > 10) return;
            setStageScale(newScale);
            setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
        } else {
            setStagePos({ x: stage.x() - e.evt.deltaX, y: stage.y() - e.evt.deltaY });
        }
    };

    const handleTouchMove = (e: any) => {
        const touch1 = e.evt.touches[0];
        const touch2 = e.evt.touches[1];
        if (touch1 && touch2) {
            const dist = Math.sqrt(Math.pow(touch1.clientX - touch2.clientX, 2) + Math.pow(touch1.clientY - touch2.clientY, 2));
            if (!lastDistRef.current) { lastDistRef.current = dist; return; }
            const stage = stageRef.current;
            if (!stage) return;
            const scaleBy = dist / lastDistRef.current;
            const oldScale = stage.scaleX();
            const newScale = oldScale * scaleBy;
            if (newScale < 0.1 || newScale > 10) return;
            const center = { x: (touch1.clientX + touch2.clientX) / 2, y: (touch1.clientY + touch2.clientY) / 2 };
            const stageBox = containerRef.current?.getBoundingClientRect();
            if (!stageBox) return;
            const pointer = { x: center.x - stageBox.left, y: center.y - stageBox.top };
            const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
            setStageScale(newScale);
            setStagePos({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
            lastDistRef.current = dist;
        } else {
            handleMouseMove(e);
        }
    };

    const handleAnnotationUpdate = (id: string, updates: Partial<Annotation>) => {
        const updated = currentAnnotations.map((a: any) => a.id === id ? { ...a, ...updates } : a);
        onUpdateAnnotations(currentStudent.id, currentExercise.id, updated);
    };

    const handleTransformEnd = (e: any, id: string) => {
        const node = e.target;
        handleAnnotationUpdate(id, {
            x: node.x(),
            y: node.y(),
            width: node.width() * node.scaleX(),
            height: node.height() * node.scaleY()
        });
        node.scaleX(1); node.scaleY(1);
    };

    const handleApplyPreset = (preset: typeof HIGHLIGHTER_PRESETS[0]) => {
        const id = `ann_${Date.now()}`;
        const stage = stageRef.current;
        const centerX = (containerRef.current!.clientWidth / 2 - stage.x()) / stageScale;
        const centerY = (containerRef.current!.clientHeight / 2 - stage.y()) / stageScale;

        const newAnn: HighlighterAnnotation = {
            id, type: 'highlighter', x: centerX - 50, y: centerY - 15, width: 100, height: 30,
            color: preset.color, points: preset.points, label: preset.label
        };
        onUpdateAnnotations(currentStudent.id, currentExercise.id, [...currentAnnotations, newAnn]);
        setSelectedId(id);
    };

    const handleApplyComment = (comment: import('../types').AnnotationComment) => {
        const id = `ann_${Date.now()}`;
        const stage = stageRef.current;
        const centerX = (containerRef.current!.clientWidth / 2 - stage.x()) / stageScale;
        const centerY = (containerRef.current!.clientHeight / 2 - stage.y()) / stageScale;

        const newAnn: TextAnnotation = {
            id, type: 'text', x: centerX, y: centerY, text: comment.text,
            color: comment.colorMode === 'score' ? (comment.score! >= 0 ? '#10b981' : '#ef4444') : '#1e293b',
            fontSize: 24, score: comment.score, align: 'center', baseline: 'middle'
        };
        onUpdateAnnotations(currentStudent.id, currentExercise.id, [...currentAnnotations, newAnn]);
        setSelectedId(id);
    };

    const nextStudent = () => {
        if (studentIdx < students.length - 1) onUpdateStudentIdx(studentIdx + 1);
        else if (exerciseIdx < exercises.length - 1) { onUpdateStudentIdx(0); onUpdateExerciseIdx(exerciseIdx + 1); }
    };

    const prevStudent = () => {
        if (studentIdx > 0) onUpdateStudentIdx(studentIdx - 1);
        else if (exerciseIdx > 0) { onUpdateStudentIdx(students.length - 1); onUpdateExerciseIdx(exerciseIdx - 1); }
    };

    const gradableExercises = exercises.filter((ex: ExerciseDef) => ex.type === 'crop' || ex.type === 'pages');
    const gradableIdx = gradableExercises.findIndex((ex: any) => ex.id === currentExercise?.id);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)' }}>
            <header className="header">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button className="btn-icon" onClick={onBack} title="Tornar a la configuració"><ChevronLeft size={28} /></button>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Corregint</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 900, fontSize: '1.1rem' }}>{currentStudent?.name}</span>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>({studentIdx + 1}/{students.length})</span>
                        </div>
                    </div>
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button className="btn-icon" onClick={prevStudent} disabled={studentIdx === 0 && exerciseIdx === 0}><ChevronLeft size={24} /></button>
                        <div style={{ background: 'var(--bg-secondary)', padding: '0.4rem 1.25rem', borderRadius: '2rem', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '180px' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{currentExercise?.name || 'Sense nom'}</span>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>Exercici {gradableIdx + 1} de {gradableExercises.length}</span>
                        </div>
                        <button className="btn-icon" onClick={nextStudent} disabled={studentIdx === students.length - 1 && exerciseIdx === exercises.length - 1}><ChevronRight size={24} /></button>
                    </div>
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
                    {computedScore !== null && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: '1rem' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Puntuació</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
                                <span style={{ fontSize: '1.8rem', fontWeight: 950, color: 'var(--accent)' }}>{computedScore.toFixed(2)}</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>/ {(currentExercise.maxScore || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                    <button className="btn btn-primary" onClick={onFinish}><Check size={18} /> Finalitzar</button>
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <div style={{ width: '72px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem 0', gap: '0.75rem' }}>
                    <button className={`btn-icon ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')} title="Seleccionar (V)"><MousePointer2 size={22} /></button>
                    <button className={`btn-icon ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="Bolígraf (P)"><Pencil size={22} /></button>
                    <button className={`btn-icon ${tool === 'highlighter' ? 'active' : ''}`} onClick={() => setTool('highlighter')} title="Fluorescent (H)"><HighlighterIcon size={22} /></button>
                    <button className={`btn-icon ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool('text')} title="Text (T)"><Type size={22} /></button>
                    <div style={{ flex: 1 }} />
                    <button className={`btn-icon ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="Goma (E)" style={{ color: 'var(--danger)' }}><Eraser size={22} /></button>
                </div>

                <div className="workspace" ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f0f2f5' }}>
                    {isPageLoading && (
                        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(4px)' }}>
                            <div className="loader" />
                        </div>
                    )}

                    <Stage
                        ref={stageRef}
                        width={containerRef.current?.clientWidth || 800}
                        height={containerRef.current?.clientHeight || 600}
                        scaleX={stageScale}
                        scaleY={stageScale}
                        x={stagePos.x}
                        y={stagePos.y}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onWheel={handleWheel}
                        onTouchStart={handleMouseDown}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleMouseUp}
                        draggable={tool === 'select'}
                        onDragEnd={(e) => tool === 'select' && setStagePos({ x: e.target.x(), y: e.target.y() })}
                    >
                        <Layer>
                            {renderedPages.map((page, i) => (
                                <KonvaImage
                                    key={i}
                                    image={page.img}
                                    x={page.xOffset}
                                    y={page.yOffset}
                                    width={page.width}
                                    height={page.height}
                                    shadowColor="black"
                                    shadowBlur={10}
                                    shadowOpacity={0.1}
                                />
                            ))}

                            {currentAnnotations.map((ann: any) => {
                                const isSelected = ann.id === selectedAnnotationId;
                                if (ann.type === 'pen') {
                                    return (
                                        <Line
                                            key={ann.id}
                                            points={ann.points}
                                            stroke={ann.color}
                                            strokeWidth={ann.strokeWidth || 2}
                                            tension={0.5}
                                            lineCap="round"
                                            lineJoin="round"
                                            onClick={() => tool === 'select' && setSelectedId(ann.id)}
                                        />
                                    );
                                }
                                if (ann.type === 'highlighter') {
                                    return (
                                        <Group key={ann.id} x={ann.x} y={ann.y} draggable={tool === 'select'} onDragEnd={(e) => handleAnnotationUpdate(ann.id, { x: e.target.x(), y: e.target.y() })}>
                                            <Rect
                                                width={ann.width}
                                                height={ann.height}
                                                fill={ann.color}
                                                onClick={() => tool === 'select' && setSelectedId(ann.id)}
                                            />
                                            {ann.label && (
                                                <Text
                                                    text={`${ann.label} (${ann.points > 0 ? '+' : ''}${ann.points})`}
                                                    fontSize={14}
                                                    fill={ann.color.replace('0.3', '1').replace('0.4', '1')}
                                                    fontStyle="bold"
                                                    y={-18}
                                                />
                                            )}
                                            {isSelected && tool === 'select' && (
                                                <Transformer
                                                    rotateEnabled={false}
                                                    boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5 ? oldBox : newBox}
                                                    onTransformEnd={(e) => handleTransformEnd(e, ann.id)}
                                                />
                                            )}
                                        </Group>
                                    );
                                }
                                if (ann.type === 'text') {
                                    return (
                                        <Group key={ann.id} x={ann.x} y={ann.y} draggable={tool === 'select'} onDragEnd={(e) => handleAnnotationUpdate(ann.id, { x: e.target.x(), y: e.target.y() })}>
                                            <Text
                                                text={ann.text || 'Fes clic per editar'}
                                                fontSize={ann.fontSize || 20}
                                                fill={ann.color}
                                                fontFamily="Caveat, cursive"
                                                onClick={() => {
                                                    if (tool === 'select') setSelectedId(ann.id);
                                                    const newText = window.prompt("Edita el comentari:", ann.text);
                                                    if (newText !== null) handleAnnotationUpdate(ann.id, { text: newText });
                                                }}
                                            />
                                            {ann.score !== undefined && (
                                                <Text
                                                    text={`${ann.score > 0 ? '+' : ''}${ann.score}`}
                                                    fontSize={14}
                                                    fill={ann.color}
                                                    fontStyle="bold"
                                                    y={-16}
                                                />
                                            )}
                                        </Group>
                                    );
                                }
                                return null;
                            })}
                        </Layer>
                    </Stage>

                    <div style={{ position: 'absolute', bottom: '1.5rem', left: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                        <div className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem', borderRadius: '2rem' }}>
                            <button className="btn-icon" style={{ color: 'white' }} onClick={() => setStageScale(s => s / 1.2)}><Minus size={18} /></button>
                            <span style={{ color: 'white', fontWeight: 800, fontSize: '0.8rem', minWidth: '45px', textAlign: 'center' }}>{Math.round(stageScale * 100)}%</span>
                            <button className="btn-icon" style={{ color: 'white' }} onClick={() => setStageScale(s => s * 1.2)}><Plus size={18} /></button>
                            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 0.2rem' }} />
                            <button className="btn-icon" style={{ color: 'white' }} onClick={() => { setStageScale(1); setStagePos({ x: 0, y: 0 }); }} title="Reset Zoom"><RotateCcw size={18} /></button>
                        </div>
                    </div>
                </div>

                <div style={{ width: '340px', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Nota Exercici</span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--accent)' }}>{computedScore?.toFixed(2)}</span>
                            </div>
                            <div className="progress-bar-container" style={{ height: '6px' }}>
                                <div className="progress-bar-fill" style={{ width: `${Math.min(100, (computedScore || 0) / (currentExercise.maxScore || 1) * 100)}%` }} />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                <h4 style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>
                                    Rúbrica
                                </h4>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {(!currentExercise.rubric || currentExercise.rubric.length === 0) && (
                                        <button
                                            onClick={() => setIsEditingRubric(true)}
                                            style={{
                                                background: 'transparent',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '4px', padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <Plus size={10} /> DEFINIR RÚBRICA
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsEditingRubric(!isEditingRubric)}
                                        style={{ background: 'transparent', border: 'none', color: isEditingRubric ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
                                        title="Editar rúbrica"
                                    >
                                        {isEditingRubric ? <Check size={14} /> : <Pencil size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {currentExercise.rubric && currentExercise.rubric.length > 0 ? (
                                    currentExercise.rubric.map((item, idx) => {
                                        const count = currentExRubricCounts[item.id] ?? 0;
                                        const contribution = item.points * count;

                                        if (isEditingRubric) {
                                            return (
                                                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'var(--bg-primary)', padding: '4px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                                    <input
                                                        value={item.label}
                                                        onChange={(e) => {
                                                            const newRubric = [...(currentExercise.rubric || [])];
                                                            newRubric[idx] = { ...item, label: e.target.value };
                                                            onUpdateExercise({ ...currentExercise, rubric: newRubric });
                                                        }}
                                                        placeholder="Descripció..."
                                                        style={{ flex: 1, fontSize: '0.75rem', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', padding: '2px' }}
                                                    />
                                                    <NumericInput
                                                        value={item.points}
                                                        onChange={(val) => {
                                                            if (val === undefined) return;
                                                            const newRubric = [...(currentExercise.rubric || [])];
                                                            newRubric[idx] = { ...item, points: val };
                                                            onUpdateExercise({ ...currentExercise, rubric: newRubric });
                                                        }}
                                                        style={{ width: '40px', border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'right' }}
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const newRubric = (currentExercise.rubric || []).filter(r => r.id !== item.id);
                                                            onUpdateExercise({ ...currentExercise, rubric: newRubric });
                                                        }}
                                                        style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                                                    ><X size={12} /></button>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <button
                                                    onClick={() => onUpdateRubricCounts(currentStudent.id, currentExercise.id, item.id, -1)}
                                                    disabled={count === 0}
                                                    style={{
                                                        width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--border)',
                                                        background: count === 0 ? 'transparent' : 'var(--bg-primary)',
                                                        color: count === 0 ? 'var(--text-secondary)' : 'var(--danger)',
                                                        cursor: count === 0 ? 'not-allowed' : 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '1rem', fontWeight: 700, flexShrink: 0
                                                    }}
                                                >−</button>
                                                <span style={{
                                                    minWidth: '18px', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem',
                                                    color: count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'
                                                }}>{count}</span>
                                                <button
                                                    onClick={() => onUpdateRubricCounts(currentStudent.id, currentExercise.id, item.id, +1)}
                                                    style={{
                                                        width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--border)',
                                                        background: 'var(--bg-primary)',
                                                        color: item.points >= 0 ? 'var(--success)' : 'var(--danger)',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '1rem', fontWeight: 700, flexShrink: 0
                                                    }}
                                                >+</button>
                                                <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)' }}>{item.label}</span>
                                                <span style={{
                                                    fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace',
                                                    color: item.points >= 0 ? 'var(--success)' : 'var(--danger)',
                                                    minWidth: '40px', textAlign: 'right'
                                                }}>
                                                    {item.points > 0 ? '+' : ''}{item.points}
                                                    {count > 0 && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> ={contribution > 0 ? '+' : ''}{contribution.toFixed(2)}</span>}
                                                </span>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '0.5rem' }}>
                                        Sense criteris definits.
                                    </div>
                                )}

                                {isEditingRubric && (
                                    <button
                                        onClick={() => {
                                            const newRubric = [...(currentExercise.rubric || []), { id: `rub_${Date.now()}`, label: 'Nou ítem', points: 0 }];
                                            onUpdateExercise({ ...currentExercise, rubric: newRubric });
                                        }}
                                        style={{ marginTop: '0.4rem', background: 'var(--bg-primary)', border: '1px dashed var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.7rem', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                    >
                                        <Plus size={12} /> Afegir criteri
                                    </button>
                                )}
                            </div>
                            {currentExercise.rubric && Object.values(currentExRubricCounts).some(v => v > 0) && (
                                <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: 'none', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                    {currentExercise.rubric.filter(item => (currentExRubricCounts[item.id] ?? 0) > 0).map(item => {
                                        const count = currentExRubricCounts[item.id];
                                        const contribution = item.points * count;
                                        return (
                                            <span key={item.id} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                {count}× {item.label} → <strong style={{ color: contribution >= 0 ? 'var(--success)' : 'var(--danger)' }}>{contribution > 0 ? '+' : ''}{contribution.toFixed(2)} pt</strong>
                                            </span>
                                        );
                                    })}
                                    {(() => {
                                        const colorPoints = currentAnnotations.reduce((sum, ann) => (ann.type === 'highlighter' && typeof ann.points === 'number') ? sum + ann.points : sum, 0);
                                        const textPoints = currentAnnotations.reduce((sum, ann) => (ann.type === 'text' && typeof ann.score === 'number') ? sum + ann.score : sum, 0);

                                        return (
                                            <>
                                                {colorPoints !== 0 && (
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                        Highlights → <strong style={{ color: colorPoints >= 0 ? 'var(--success)' : 'var(--danger)' }}>{colorPoints > 0 ? '+' : ''}{colorPoints.toFixed(2)} pt</strong>
                                                    </span>
                                                )}
                                                {textPoints !== 0 && (
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                        Comentaris → <strong style={{ color: textPoints >= 0 ? 'var(--success)' : 'var(--danger)' }}>{textPoints > 0 ? '+' : ''}{textPoints.toFixed(2)} pt</strong>
                                                    </span>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                                <h4 style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>Fluorescents ràpids</h4>
                                <button
                                    onClick={() => setHighlighterLabelMode(highlighterLabelMode === 'legend' ? 'individual' : 'legend')}
                                    style={{
                                        background: highlighterLabelMode === 'legend' ? 'var(--accent)' : 'transparent',
                                        color: highlighterLabelMode === 'legend' ? 'white' : 'var(--text-secondary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '4px', padding: '2px 8px', fontSize: '0.6rem', fontWeight: 700, cursor: 'pointer'
                                    }}
                                >
                                    {highlighterLabelMode === 'legend' ? 'MODE LLEGENDA' : 'MODE INDIVIDUAL'}
                                </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                {HIGHLIGHTER_PRESETS.map(preset => (
                                    <button
                                        key={preset.id}
                                        onClick={() => handleApplyPreset(preset)}
                                        style={{
                                            display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.4rem',
                                            background: preset.color, border: '1px solid rgba(0,0,0,0.1)', borderRadius: '0.4rem',
                                            cursor: 'pointer', textAlign: 'left'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(0,0,0,0.7)', lineHeight: 1.1 }}>{preset.label}</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'rgba(0,0,0,0.8)' }}>{preset.points > 0 ? '+' : ''}{preset.points}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.6rem' }}>Comentaris freqüents</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {commentBank.map((comment, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleApplyComment(comment)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem',
                                            background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '0.5rem',
                                            cursor: 'pointer', textAlign: 'left'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{comment.text}</span>
                                        {comment.score !== undefined && (
                                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: comment.score >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                {comment.score > 0 ? '+' : ''}{comment.score}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h4 style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>Exportar</h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-tertiary)', padding: '2px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-secondary)', padding: '0 4px' }}>CALITAT</span>
                                    {[1, 1.8, 2.5].map(factor => (
                                        <button
                                            key={factor}
                                            onClick={() => setStrokeWidth(factor)} 
                                            style={{
                                                padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, borderRadius: '2px', border: 'none', cursor: 'pointer',
                                                background: strokeWidth === factor ? 'var(--accent)' : 'transparent',
                                                color: strokeWidth === factor ? 'white' : 'var(--text-secondary)'
                                            }}
                                        >{factor}x</button>
                                    ))}
                                </div>
                            </div>
                            {(() => { const currentFactor = strokeWidth === 2 ? 1.8 : strokeWidth; return (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <button
                                        disabled={isExporting}
                                        onClick={async () => {
                                            setIsExporting(true);
                                            setExportProgress({ done: 0, total: 1 });
                                            try {
                                                await exportAnnotatedPDF({
                                                    pdfDoc, students, exercises, annotations, rubricCounts,
                                                    scope: 'current',
                                                    currentStudentIdx: studentIdx,
                                                    scaleFactor: currentFactor,
                                                    onProgress: (d: number, t: number) => setExportProgress({ done: d, total: t })
                                                } as any);
                                            } finally {
                                                setIsExporting(false);
                                                setExportProgress(null);
                                            }
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                            padding: '0.4rem 0.75rem', borderRadius: '0.5rem',
                                            background: isExporting ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                                            color: 'var(--text-primary)', border: '1px solid var(--border)',
                                            cursor: isExporting ? 'wait' : 'pointer', fontSize: '0.8rem', fontWeight: 600
                                        }}
                                        title="Exportar retalls de l'alumne actual"
                                    >
                                        {isExporting && exportProgress ? <RefreshCw size={14} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <ImageIcon size={14} />}
                                        {isExporting && exportProgress ? `${exportProgress.done}/${exportProgress.total}` : 'RETALLS'}
                                    </button>
                                    <button
                                        disabled={isExporting}
                                        onClick={async () => {
                                            setIsExporting(true);
                                            setExportProgress({ done: 0, total: 1 });
                                            try {
                                                await exportOriginalLayoutPDF({
                                                    pdfDoc, students, exercises, annotations, rubricCounts,
                                                    scope: 'current',
                                                    currentStudentIdx: studentIdx,
                                                    scaleFactor: currentFactor,
                                                    onProgress: (d: number, t: number) => setExportProgress({ done: d, total: t })
                                                } as any);
                                            } finally {
                                                setIsExporting(false);
                                                setExportProgress(null);
                                            }
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                            padding: '0.4rem 0.75rem', borderRadius: '0.5rem',
                                            background: isExporting ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                                            color: 'var(--text-primary)', border: '1px solid var(--border)',
                                            cursor: isExporting ? 'wait' : 'pointer', fontSize: '0.8rem', fontWeight: 600
                                        }}
                                        title="Exportar examen complet de l'alumne actual"
                                    >
                                        {isExporting && exportProgress ? <RefreshCw size={14} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
                                        {isExporting && exportProgress ? `${exportProgress.done}/${exportProgress.total}` : 'PDF'}
                                    </button>
                                </div>
                            ); })()}
                        </div>
                    </div>

                    <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                        <button
                            className="btn btn-secondary"
                            style={{ flex: 1 }}
                            onClick={() => {
                                setStageScale(1);
                                setStagePos({ x: 0, y: 0 });
                            }}
                        >
                            <RotateCcw size={16} /> Reset
                        </button>
                        <button className="btn btn-primary" style={{ flex: 1.5 }} onClick={nextStudent}>
                            Següent <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
