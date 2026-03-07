import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Rect, Group, Text, Transformer } from 'react-konva';
import {
    ChevronLeft, ChevronRight, PenTool, Highlighter, MousePointer2,
    Undo, Trash2, Type, Plus, Pencil, Check, X, Download, Loader2, Moon, Sun
} from 'lucide-react';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas } from '../utils/pdfUtils';
import { exportAnnotatedPDF, exportOriginalLayoutPDF } from '../utils/pdfExport';
import type { Student, ExerciseDef, AnnotationStore, Annotation, PenAnnotation, HighlighterAnnotation, ImageAnnotation, TextAnnotation, ToolType, PresetHighlighter, PenColor, RubricCountStore, AnnotationComment } from '../types';

interface Props {
    pdfDoc: PDFDocumentProxy;
    students: Student[];
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    onUpdateAnnotations: (studentId: string, exerciseId: string, annotations: Annotation[]) => void;
    onUpdateRubricCounts: (studentId: string, exerciseId: string, itemId: string, delta: number) => void;
    onUpdateExercise: (exercise: ExerciseDef) => void;
    onBack?: () => void;
}


const DEFAULT_HIGHLIGHT_PRESETS: PresetHighlighter[] = [
    { id: 'h1', label: 'Error Procediment', color: 'rgba(239, 68, 68, 0.4)', points: -0.5 },
    { id: 'h2', label: 'Error Càlcul', color: 'rgba(249, 115, 22, 0.4)', points: -0.25 },
    { id: 'h3', label: 'Falta Raonament', color: 'rgba(234, 179, 8, 0.4)', points: -0.5 },
    { id: 'h4', label: 'Error Greu', color: 'rgba(225, 29, 72, 0.4)', points: -1.0 },
    { id: 'h5', label: 'Anotació Bona', color: 'rgba(16, 185, 129, 0.4)', points: 0.5 },
];

const FONT_SCALE = 2.5; // Scale from points to our high-res coordinate system

interface RenderedPage {
    img: HTMLImageElement;
    width: number;
    height: number;
    yOffset: number;
    xOffset?: number;
}

export default function CorrectionView({ pdfDoc, students, exercises, annotations, rubricCounts, onUpdateAnnotations, onUpdateRubricCounts, onUpdateExercise, onBack }: Props) {
    const [studentIdx, setStudentIdx] = useState(0);
    const [exerciseIdx, setExerciseIdx] = useState(0);
    const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);

    const [tool, setTool] = useState<ToolType>('pen');
    const [penColor, setPenColor] = useState<PenColor>('#ef4444');
    const [defaultTextColor, setDefaultTextColor] = useState<string>('#111827');
    const [penWidth, setPenWidth] = useState<number>(3);
    const [penOpacity, setPenOpacity] = useState<number>(1);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);

    // Comment bank
    const [commentBank, setCommentBank] = useState<AnnotationComment[]>([
        { text: 'Correcte!', score: undefined, colorMode: 'neutral' },
        { text: 'Revisa el procediment', score: -0.25, colorMode: 'score' },
        { text: 'Error de signe', score: -0.1, colorMode: 'score' },
        { text: 'Falta demostraci\u00f3', score: -0.5, colorMode: 'score' },
        { text: 'Bona idea, per\u00f2 incorrecte', score: undefined, colorMode: 'neutral' },
        { text: 'Error aritm\u00e8tic', score: -0.25, colorMode: 'score' },
    ]);
    const [newComment, setNewComment] = useState('');
    const [newCommentScore, setNewCommentScore] = useState<string>('');
    const [newCommentColorMode, setNewCommentColorMode] = useState<'neutral' | 'score' | 'custom'>('neutral');
    const [newCommentCustomColor, setNewCommentCustomColor] = useState('#6366f1');
    const [commentDefaultSize, setCommentDefaultSize] = useState(18);
    const [commentBankHeight, setCommentBankHeight] = useState(160);
    const [draggingComment, setDraggingComment] = useState<string | null>(null);
    const [editingBankComment, setEditingBankComment] = useState<number | null>(null);

    // Highlighters
    const [presets, setPresets] = useState<PresetHighlighter[]>(DEFAULT_HIGHLIGHT_PRESETS);
    const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
    const [presetForm, setPresetForm] = useState<Partial<PresetHighlighter>>({});
    const [tempColor, setTempColor] = useState<string>('#fde047');
    const [activePresetId, setActivePresetId] = useState<string | null>(null);

    // Rubric editing
    const [isEditingRubric, setIsEditingRubric] = useState(false);

    // Selection & Editing state
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingTextNode, setEditingTextNode] = useState<{ id: string, text: string, x: number, y: number } | null>(null);

    // Zoom & Pan state
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [targetMaxScore, setTargetMaxScore] = useState<number>(10);
    const [scoreStampSize, setScoreStampSize] = useState(24);
    const [history, setHistory] = useState<Annotation[][]>([]);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = localStorage.getItem('correction-dark-mode');
        return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const transformerRef = useRef<any>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        localStorage.setItem('correction-dark-mode', JSON.stringify(isDarkMode));
    }, [isDarkMode]);



    const updateAnnotationsWithHistory = (newAnns: Annotation[]) => {
        setHistory(prev => [...prev.slice(-19), currentAnnotations]); // Limit history to 20 steps
        onUpdateAnnotations(currentStudent.id, currentExercise.id, newAnns);
    };

    const handleUndo = () => {
        if (history.length > 0) {
            const last = history[history.length - 1];
            setHistory(prev => prev.slice(0, -1));
            onUpdateAnnotations(currentStudent.id, currentExercise.id, last);
        }
    };

    const gradableExercises = exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages');
    const currentStudent = students[studentIdx];
    const currentExercise = gradableExercises[exerciseIdx];
    const currentAnnotations = (currentStudent && currentExercise)
        ? (annotations[currentStudent.id]?.[currentExercise.id] || [])
        : [];

    const currentExRubricCounts = (currentStudent && currentExercise)
        ? (rubricCounts?.[currentStudent.id]?.[currentExercise.id] ?? {})
        : {};

    const rubricBase = (currentExercise?.scoringMode === 'from_zero' && currentExercise?.rubric)
        ? (currentExercise.rubric ?? []).reduce((sum, item) => sum + item.points * (currentExRubricCounts[item.id] ?? 0), 0)
        : null;

    const highlightAdjustment = currentAnnotations.reduce((sum, ann) => {
        if (ann.type === 'highlighter' && typeof ann.points === 'number') return sum + ann.points;
        if (ann.type === 'text' && typeof ann.score === 'number') return sum + ann.score;
        return sum;
    }, 0);

    const computedScore = currentExercise
        ? rubricBase !== null
            ? rubricBase + highlightAdjustment
            : currentExercise.maxScore !== undefined
                ? currentExercise.maxScore + highlightAdjustment
                : null
        : null;

    const totalStudentScore = currentStudent ? gradableExercises.reduce((acc, ex) => {
        const exAnns = annotations[currentStudent.id]?.[ex.id] || [];
        const exPoints = exAnns.reduce((sum, ann) => {
            if (ann.type === 'highlighter' && typeof ann.points === 'number') return sum + ann.points;
            if (ann.type === 'text' && typeof ann.score === 'number') return sum + ann.score;
            return sum;
        }, 0);
        const exRubric = ex.scoringMode === 'from_zero' && ex.rubric
            ? ex.rubric.reduce((s, item) => s + item.points * (rubricCounts?.[currentStudent.id]?.[ex.id]?.[item.id] ?? 0), 0)
            : (ex.maxScore ?? 0);
        return acc + exRubric + exPoints;
    }, 0) : 0;

    // Fix JS float weirdness (like 0.1+0.2=0.3000000004)
    const roundedTotalStudentScore = Math.round(totalStudentScore * 100) / 100;

    useEffect(() => {
        if (editingTextNode && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [editingTextNode]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const key = e.key.toLowerCase();
            if (key === 'v') setTool('select');
            if (key === 'p') setTool('pen');
            if (key === 't') setTool('text');
            if (key === 'h') setTool('highlighter');

            if (/^[1-9]$/.test(key)) {
                const idx = parseInt(key) - 1;
                if (presets[idx]) {
                    setTool('highlighter');
                    setActivePresetId(presets[idx].id);
                }
            }

            const colorMap: Record<string, PenColor> = {
                'q': '#ef4444',  // Red
                'w': '#f97316',  // Orange
                'e': '#3b82f6',  // Blue
                'r': '#6366f1',  // Indigo
                'a': '#10b981',  // Green
                's': '#000000',  // Black
            };
            if (colorMap[key] && !e.ctrlKey && !e.metaKey) {
                setTool('pen');
                setPenColor(colorMap[key]);
            }

            if (key === 'delete' || key === 'backspace') {
                if (selectedId) {
                    updateAnnotationsWithHistory(currentAnnotations.filter(a => a.id !== selectedId));
                    setSelectedId(null);
                }
                return;
            }

            if (key === 'escape') {
                if (editingTextNode) {
                    setEditingTextNode(null);
                } else {
                    setSelectedId(null);
                }
                return;
            }

            if (key === 'z' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleUndo();
                return;
            }

            // Navigation
            if (key === ' ' || key === 'arrowright') {
                if (studentIdx < students.length - 1) setStudentIdx(s => s + 1);
            } else if (key === 'arrowleft') {
                if (studentIdx > 0) setStudentIdx(s => s - 1);
            } else if (key === 'arrowdown') {
                if (exerciseIdx < exercises.length - 1) setExerciseIdx(c => c + 1);
            } else if (key === 'arrowup') {
                if (exerciseIdx > 0) setExerciseIdx(c => c - 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tool, selectedId, currentAnnotations, presets, studentIdx, exerciseIdx, history]);

    const stageRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastDistRef = useRef<number>(0);

    useEffect(() => {
        if (!currentStudent || !currentExercise) return;

        setSelectedId(null);
        setEditingTextNode(null);

        const loadExerciseRegions = async () => {
            setRenderedPages([]);
            setStageScale(1);
            setStagePos({ x: 0, y: 0 });

            const images: RenderedPage[] = [];
            let currentYOffset = 0;

            if (currentExercise.type === 'crop') {
                const actualPageIndex = currentStudent.pageIndexes[currentExercise.pageIndex];
                if (actualPageIndex === undefined || actualPageIndex === -1) return;

                const renderCropPage = async (absPage: number, yOff: number) => {
                    const canvas = document.createElement('canvas');
                    const dimensions = await renderPDFPageToCanvas(pdfDoc, absPage, canvas, 2.5);
                    if (!dimensions) return null;
                    const cropCanvas = document.createElement('canvas');
                    cropCanvas.width = currentExercise.width;
                    cropCanvas.height = currentExercise.height;
                    const ctx = cropCanvas.getContext('2d');
                    if (!ctx) return null;
                    ctx.drawImage(canvas,
                        currentExercise.x, currentExercise.y, currentExercise.width, currentExercise.height,
                        0, 0, currentExercise.width, currentExercise.height);
                    const img = new Image();
                    img.src = cropCanvas.toDataURL('image/png');
                    await new Promise(r => img.onload = r);
                    return { img, width: currentExercise.width, height: currentExercise.height, yOffset: yOff, xOffset: 0 };
                };

                const page1 = await renderCropPage(actualPageIndex, 0);
                if (page1) {
                    images.push(page1);
                }

            } else if (currentExercise.type === 'pages') {
                const spansTwoPages = (currentExercise as any).spansTwoPages;

                for (let i = 0; i < currentExercise.pageIndexes.length; i++) {
                    const pageIdx = currentExercise.pageIndexes[i];
                    const actualPageIndex = currentStudent.pageIndexes[pageIdx];
                    if (actualPageIndex === undefined || actualPageIndex === -1) continue;

                    const canvas = document.createElement('canvas');
                    const dimensions = await renderPDFPageToCanvas(pdfDoc, actualPageIndex, canvas, 2.5);
                    if (dimensions) {
                        const img = new Image();
                        img.src = canvas.toDataURL('image/png');
                        await new Promise(r => img.onload = r);

                        const isRightSide = spansTwoPages && i % 2 !== 0;
                        const xOffset = isRightSide ? dimensions.width + 20 : 0;

                        images.push({ img, width: dimensions.width, height: dimensions.height, xOffset, yOffset: currentYOffset });

                        if (!spansTwoPages || isRightSide) {
                            currentYOffset += dimensions.height + 20;
                        }
                    }
                }
            }

            if (images.length > 0 && containerRef.current) {
                // If spanning two pages, the total width is double plus gap. Otherwise just max width.
                const totalWidth = ((currentExercise.type === 'pages' && (currentExercise as any).spansTwoPages && images.length > 1)
                    ? images.filter(i => i.xOffset === 0)[0]?.width + Math.max(...images.filter(i => i.xOffset !== 0).map(i => i.width), 0) + 20
                    : Math.max(...images.map(img => img.width)));

                // Total height calculates the maximum Y offset plus height.
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
        };

        // Small delay to ensure container is fully rendered for dimensions
        setTimeout(loadExerciseRegions, 100);
    }, [studentIdx, exerciseIdx, students, exercises, pdfDoc]);

    // Paste handling API
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (editingTextNode) return;

            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const dataUrl = event.target?.result as string;

                            const stage = stageRef.current;
                            let pasteX = (50 - stagePos.x) / stageScale;
                            let pasteY = (50 - stagePos.y) / stageScale;

                            if (stage) {
                                const pos = stage.getPointerPosition();
                                if (pos) {
                                    pasteX = (pos.x - stagePos.x) / stageScale;
                                    pasteY = (pos.y - stagePos.y) / stageScale;
                                }
                            }

                            const newAnnotation: ImageAnnotation = {
                                id: `img_${Date.now()}`,
                                type: 'image',
                                x: pasteX,
                                y: pasteY,
                                width: 150,
                                height: 150,
                                dataUrl
                            };

                            onUpdateAnnotations(currentStudent.id, currentExercise.id, [...currentAnnotations, newAnnotation]);
                        };
                        reader.readAsDataURL(blob);
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [currentStudent, currentExercise, currentAnnotations, editingTextNode, onUpdateAnnotations]);

    // Keyboard shortcuts (Escape for deselection)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (editingTextNode) {
                    commitTextEdit();
                } else {
                    setSelectedId(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingTextNode, selectedId]);

    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        const handleResizing = (me: MouseEvent) => {
            const h = window.innerHeight - me.clientY;
            if (h > 60 && h < 600) setCommentBankHeight(h);
        };
        const stopResizing = () => {
            document.removeEventListener('mousemove', handleResizing);
            document.removeEventListener('mouseup', stopResizing);
        };
        document.addEventListener('mousemove', handleResizing);
        document.addEventListener('mouseup', stopResizing);
    };

    const handleMouseDown = (e: any) => {
        // If we're actively editing text and user clicks elsewhere with a NON-text tool, commit it
        if (editingTextNode && tool !== 'text') {
            commitTextEdit();
            return;
        }

        if (tool === 'select' && e.target === e.target.getStage()) {
            setSelectedId(null);
            return;
        }

        if (tool === 'select') return;

        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const transform = stage.getAbsoluteTransform().copy().invert();
        const actualPos = transform.point(pos);
        const actualX = actualPos.x;
        const actualY = actualPos.y;

        if (tool === 'text') {
            const newId = `text_${Date.now()}`;
            setEditingTextNode({
                id: newId,
                text: '',
                x: actualX,
                y: actualY
            });
            setSelectedId(newId);
            return;
        }

        setIsDrawing(true);
        setSelectedId(null);

        if (tool === 'pen') {
            const newAnnotation: PenAnnotation = {
                id: `pen_${Date.now()}`,
                type: 'pen',
                points: [actualPos.x, actualPos.y],
                color: penColor,
                strokeWidth: penWidth,
                opacity: penOpacity
            };
            updateAnnotationsWithHistory([...currentAnnotations, newAnnotation]);
        } else if (tool === 'highlighter') {
            const activePreset = activePresetId ? presets.find(p => p.id === activePresetId) : null;
            const newAnnotation: HighlighterAnnotation = {
                id: `hl_${Date.now()}`,
                type: 'highlighter',
                x: actualPos.x,
                y: actualPos.y,
                width: 0,
                height: 0,
                color: activePreset ? activePreset.color : 'rgba(253, 224, 71, 0.4)',
                presetId: activePreset?.id,
                points: activePreset?.points,
                label: activePreset?.label,
                fontSize: commentDefaultSize
            };
            updateAnnotationsWithHistory([...currentAnnotations, newAnnotation]);
        }
    };

    const handleMouseMove = (e: any) => {
        if (!isDrawing || tool === 'select' || tool === 'text') return;

        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const transform = stage.getAbsoluteTransform().copy().invert();
        const actualPos = transform.point(pos);

        const annots = [...currentAnnotations];
        const lastAnnot = annots[annots.length - 1];

        if (tool === 'pen' && lastAnnot?.type === 'pen') {
            lastAnnot.points = lastAnnot.points.concat([actualPos.x, actualPos.y]);
        } else if (tool === 'highlighter' && lastAnnot?.type === 'highlighter') {
            const hl = lastAnnot as HighlighterAnnotation & { startX?: number, startY?: number };
            const startX = hl.startX !== undefined ? hl.startX : hl.x;
            const startY = hl.startY !== undefined ? hl.startY : hl.y;

            if (hl.startX === undefined) {
                hl.startX = hl.x;
                hl.startY = hl.y;
            }

            hl.x = Math.min(startX, actualPos.x);
            hl.y = Math.min(startY, actualPos.y);
            hl.width = Math.abs(actualPos.x - startX);
            hl.height = Math.abs(actualPos.y - startY);
        }

        annots[annots.length - 1] = lastAnnot;
        onUpdateAnnotations(currentStudent.id, currentExercise.id, annots);
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
        }
    };

    const handleTouchEnd = () => {
        lastDistRef.current = 0;
        if (isDrawing) {
            setIsDrawing(false);
        }
    };

    const handleMouseUp = () => {
        if (isDrawing) {
            setIsDrawing(false);
        }
    };

    const commitTextEdit = () => {
        if (editingTextNode) {
            if (editingTextNode.text.trim() === '') {
                setEditingTextNode(null);
                return;
            }

            const isExisting = currentAnnotations.some(a => a.id === editingTextNode.id);

            if (isExisting) {
                const newAnnots = currentAnnotations.map(a =>
                    a.id === editingTextNode.id ? { ...a, text: editingTextNode.text } as TextAnnotation : a
                );
                updateAnnotationsWithHistory(newAnnots);
            } else {
                const newAnnotation: TextAnnotation = {
                    id: editingTextNode.id,
                    type: 'text',
                    x: editingTextNode.x,
                    y: editingTextNode.y,
                    text: editingTextNode.text,
                    color: defaultTextColor,
                    fontSize: commentDefaultSize
                };
                updateAnnotationsWithHistory([...currentAnnotations, newAnnotation]);
            }
            setEditingTextNode(null);
            setTool('select');
        }
    };

    const deleteSelected = () => {
        if (selectedId) {
            const newAnnots = currentAnnotations.filter(a => a.id !== selectedId);
            updateAnnotationsWithHistory(newAnnots);
            setSelectedId(null);
        }
    };



    const handleDragEnd = (e: any, id: string) => {
        const newAnnots = currentAnnotations.map(a => {
            if (a.id === id) {
                if (a.type === 'pen') {
                    // Pen uses absolute points, we add the relative movement and reset group
                    const dx = e.target.x();
                    const dy = e.target.y();
                    const points = a.points.map((p, i) => i % 2 === 0 ? p + dx : p + dy);
                    e.target.position({ x: 0, y: 0 });
                    return { ...a, points } as PenAnnotation;
                } else {
                    // Other types use Group position as coordinate
                    return { ...a, x: e.target.x(), y: e.target.y() } as any;
                }
            }
            return a;
        }) as Annotation[];
        updateAnnotationsWithHistory(newAnnots);
    };

    const handleTransformEnd = (e: any, id: string) => {
        const node = e.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const newAnnots = currentAnnotations.map(a => {
            if (a.id === id) {
                if (a.type === 'pen') {
                    // Scale the actual points to preserve line thickness
                    const ox = node.x();
                    const oy = node.y();
                    const scaledPoints = a.points.map((p, i) => {
                        const base = i % 2 === 0 ? ox : oy;
                        const scale = i % 2 === 0 ? scaleX : scaleY;
                        return base + (p - base) * scale;
                    });
                    return { ...a, points: scaledPoints } as PenAnnotation;
                } else if (a.type === 'highlighter' || a.type === 'image') {
                    return {
                        ...a,
                        x: node.x(),
                        y: node.y(),
                        width: Math.abs(node.width() * scaleX),
                        height: Math.abs(node.height() * scaleY),
                    } as any;
                }
            }
            return a;
        }) as Annotation[];
        node.scaleX(1);
        node.scaleY(1);
        updateAnnotationsWithHistory(newAnnots);
    };

    useEffect(() => {
        if (selectedId && transformerRef.current) {
            const selectedNode = stageRef.current.findOne('#' + selectedId);
            if (selectedNode) {
                transformerRef.current.nodes([selectedNode]);
                transformerRef.current.getLayer().batchDraw();
            } else {
                transformerRef.current.nodes([]);
            }
        }
    }, [selectedId, currentAnnotations]);

    if (!currentStudent || !currentExercise) return <div>No exercises or students found.</div>;

    return (
        <div style={{ display: 'flex', width: '100%', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            {/* Header Toolbar */}
            <div className="header" style={{ height: '70px', padding: '0 2rem', background: 'var(--bg-secondary)', borderBottom: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10, flexShrink: 0 }}>
                {/* Left: Exercise Navigation */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {onBack && (
                        <button className="btn-icon" onClick={onBack} title="Back to Configuration">
                            <ChevronLeft />
                        </button>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Exercici</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{exerciseIdx + 1} / {gradableExercises.length}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn-icon" onClick={() => setExerciseIdx(c => Math.max(0, c - 1))} disabled={exerciseIdx === 0}>
                            <ChevronLeft />
                        </button>
                        <select
                            value={exerciseIdx}
                            onChange={(e) => setExerciseIdx(Number(e.target.value))}
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                        >
                            {gradableExercises.map((ex, i) => (
                                <option key={ex.id} value={i}>
                                    {ex.name || `Exercici ${i + 1}`}
                                </option>
                            ))}
                        </select>
                        <button className="btn-icon" onClick={() => setExerciseIdx(c => Math.min(gradableExercises.length - 1, c + 1))} disabled={exerciseIdx === gradableExercises.length - 1}>
                            <ChevronRight />
                        </button>
                    </div>
                </div>

                {/* Center: Grade Tracker */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grade tracker</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-tertiary)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Màxim:</span>
                            <input 
                                type="number" step="0.5" value={targetMaxScore} 
                                onChange={(e) => setTargetMaxScore(Number(e.target.value))}
                                style={{ width: '40px', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: 0 }}
                            />
                        </div>
                    </div>
                    {(() => {
                        const totalPossible = gradableExercises.reduce((acc, ex) => acc + (ex.maxScore ?? 10), 0);
                        const currentFactor = totalPossible > 0 ? targetMaxScore / totalPossible : 1;
                        const scaledScore = Math.round(roundedTotalStudentScore * currentFactor * 100) / 100;
                        
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' }}>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>Total: {roundedTotalStudentScore} pt</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)', marginTop: '-2px' }}>
                                    (Recalculat: {scaledScore} / {targetMaxScore})
                                </span>
                            </div>
                        );
                    })()}
                </div>

                {/* Right: Student Navigation & Export */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1.5rem', justifyContent: 'flex-end' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Alumne</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>{studentIdx + 1} / {students.length}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button className="btn-icon" onClick={() => setStudentIdx(s => Math.max(0, s - 1))} disabled={studentIdx === 0}>
                                <ChevronLeft />
                            </button>
                            <select
                                value={studentIdx}
                                onChange={(e) => setStudentIdx(Number(e.target.value))}
                                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                            >
                                {students.map((st, i) => (
                                    <option key={st.id} value={i}>
                                        {st.name || `Alumne ${i + 1}`}
                                    </option>
                                ))}
                            </select>
                            <button className="btn-icon" onClick={() => setStudentIdx(s => Math.min(students.length - 1, s + 1))} disabled={studentIdx === students.length - 1}>
                                <ChevronRight />
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', borderLeft: '1px solid var(--border)', paddingLeft: '1rem' }}>
                        <button
                            disabled={isExporting}
                            onClick={async () => {
                                setIsExporting(true);
                                setExportProgress({ done: 0, total: exercises.length });
                                const totalPossible = gradableExercises.reduce((acc, ex) => acc + (ex.maxScore ?? 10), 0);
                                const currentFactor = totalPossible > 0 ? targetMaxScore / totalPossible : 1;
                                try {
                                    await exportAnnotatedPDF({
                                        pdfDoc, students, exercises, annotations, rubricCounts,
                                        scope: 'current',
                                        currentStudentIdx: studentIdx,
                                        scaleFactor: currentFactor,
                                        onProgress: (d, t) => setExportProgress({ done: d, total: t })
                                    });
                                } finally {
                                    setIsExporting(false);
                                    setExportProgress(null);
                                }
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.4rem 0.75rem', borderRadius: '0.5rem',
                                background: isExporting ? 'var(--bg-tertiary)' : 'var(--accent)',
                                color: 'white', border: 'none', cursor: isExporting ? 'wait' : 'pointer',
                                fontSize: '0.8rem', fontWeight: 600
                            }}
                            title="Exportar alumne actual"
                        >
                            {isExporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
                            {isExporting && exportProgress ? `${exportProgress.done}/${exportProgress.total}` : 'PDF'}
                        </button>
                        <button
                            disabled={isExporting}
                            onClick={async () => {
                                setIsExporting(true);
                                setExportProgress({ done: 0, total: students.length * exercises.length });
                                const totalPossible = gradableExercises.reduce((acc, ex) => acc + (ex.maxScore ?? 10), 0);
                                const currentFactor = totalPossible > 0 ? targetMaxScore / totalPossible : 1;
                                try {
                                    await exportAnnotatedPDF({
                                        pdfDoc, students, exercises, annotations, rubricCounts,
                                        scope: 'all',
                                        currentStudentIdx: studentIdx,
                                        scaleFactor: currentFactor,
                                        onProgress: (d, t) => setExportProgress({ done: d, total: t })
                                    });
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
                                cursor: isExporting ? 'wait' : 'pointer',
                                fontSize: '0.8rem', fontWeight: 600
                            }}
                            title="Exportar tots els alumnes"
                        >
                            <Download size={14} />
                            Tots
                        </button>
                        <button
                            disabled={isExporting}
                            onClick={async () => {
                                setIsExporting(true);
                                setExportProgress({ done: 0, total: exercises.length });
                                const totalPossible = gradableExercises.reduce((acc, ex) => acc + (ex.maxScore ?? 10), 0);
                                const currentFactor = totalPossible > 0 ? targetMaxScore / totalPossible : 1;
                                try {
                                    await exportOriginalLayoutPDF({
                                        pdfDoc, students, exercises, annotations, rubricCounts,
                                        scope: 'current',
                                        currentStudentIdx: studentIdx,
                                        scaleFactor: currentFactor,
                                        onProgress: (d, t) => setExportProgress({ done: d, total: t })
                                    });
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
                                cursor: isExporting ? 'wait' : 'pointer',
                                fontSize: '0.8rem', fontWeight: 600
                            }}
                            title="Exportar alumne actual en layout original"
                        >
                            <Download size={14} />
                            Layout (Alumne)
                        </button>
                        <button
                            disabled={isExporting}
                            onClick={async () => {
                                setIsExporting(true);
                                setExportProgress({ done: 0, total: students.length * exercises.length });
                                const totalPossible = gradableExercises.reduce((acc, ex) => acc + (ex.maxScore ?? 10), 0);
                                const currentFactor = totalPossible > 0 ? targetMaxScore / totalPossible : 1;
                                try {
                                    await exportOriginalLayoutPDF({
                                        pdfDoc, students, exercises, annotations, rubricCounts,
                                        scope: 'all',
                                        currentStudentIdx: studentIdx,
                                        scaleFactor: currentFactor,
                                        onProgress: (d, t) => setExportProgress({ done: d, total: t })
                                    });
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
                                cursor: isExporting ? 'wait' : 'pointer',
                                fontSize: '0.8rem', fontWeight: 600
                            }}
                            title="Exportar tot en layout original"
                        >
                            <Download size={14} />
                            Layout (Tots)
                        </button>

                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="btn-icon"
                            style={{ marginLeft: '0.5rem', background: 'var(--bg-tertiary)' }}
                            title={isDarkMode ? 'Canviar a Mode Clar' : 'Canviar a Mode Fosc'}
                        >
                            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {/* Tool Left Sidebar */}
                <div className="tool-sidebar" style={{ width: '92px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', alignContent: 'start', justifyItems: 'center', padding: '1rem 0.5rem', gap: '0.5rem', flexShrink: 0, overflowY: 'auto', minHeight: 0 }}>
                    {/* Top Select Tool spans 2 cols for emphasis */}
                    <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'center', width: '100%' }}>
                        {[
                            { id: 'select' as ToolType, icon: <MousePointer2 size={18} />, label: 'V', title: 'Seleccionar (V)' },
                        ].map(btn => (
                            <button key={btn.id} className={`btn-icon ${tool === btn.id ? 'active' : ''}`}
                                onClick={() => setTool(btn.id)} title={btn.title}
                                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '6px 4px', width: '100%' }}>
                                {btn.icon}
                                <span style={{ fontSize: '0.55rem', opacity: 0.5, fontFamily: 'monospace' }}>{btn.label}</span>
                            </button>
                        ))}
                    </div>

                    <div style={{ gridColumn: 'span 2', width: '24px', height: '1px', background: 'var(--border)' }}></div>

                    {[
                        { id: 'pen' as ToolType, icon: <PenTool size={18} />, label: 'P', title: 'Boli (P)', onClick: () => { setTool('pen'); setSelectedId(null); } },
                        { id: 'text' as ToolType, icon: <Type size={18} />, label: 'T', title: 'Text (T)', onClick: () => { setTool('text'); setSelectedId(null); } },
                        { id: 'highlighter' as ToolType, icon: <Highlighter size={18} />, label: 'H', title: 'Destacador (H)', onClick: () => { setTool('highlighter'); setActivePresetId(null); setSelectedId(null); } },
                    ].map(btn => (
                        <button key={btn.id} className={`btn-icon ${tool === btn.id ? 'active' : ''}`}
                            onClick={btn.onClick} title={btn.title}
                            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '6px 4px', width: '100%', gridColumn: btn.id === 'highlighter' ? 'span 2' : 'span 1' }}>
                            {btn.icon}
                            <span style={{ fontSize: '0.55rem', opacity: 0.5, fontFamily: 'monospace' }}>{btn.label}</span>
                        </button>
                    ))}

                    <div style={{ gridColumn: 'span 2', width: '24px', height: '1px', background: 'var(--border)' }}></div>

                    {['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#000000'].map((presetColor, ci) => {
                        const shortcutKeys = ['Q', 'W', 'E', 'R', 'A', 'S'];
                        return (
                            <div key={presetColor} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                                <button
                                    onClick={() => { setPenColor(presetColor as PenColor); setTool('pen'); }}
                                    style={{
                                        width: '24px', height: '24px', borderRadius: '50%', background: presetColor,
                                        border: penColor === presetColor && tool === 'pen' ? '2px solid var(--text-primary)' : '2px solid transparent',
                                        cursor: 'pointer',
                                        transition: 'transform 0.1s',
                                        transform: penColor === presetColor && tool === 'pen' ? 'scale(1.15)' : 'scale(1)',
                                        flexShrink: 0
                                    }}
                                    title={`Color (${shortcutKeys[ci]})`}
                                />
                                <span style={{ fontSize: '0.55rem', opacity: 0.45, fontFamily: 'monospace' }}>{shortcutKeys[ci]}</span>
                            </div>
                        );
                    })}

                    <div style={{ gridColumn: 'span 2', width: '24px', height: '1px', background: 'var(--border)' }}></div>

                    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%', padding: '0 0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Mida</span>
                                <span style={{ fontSize: '0.6rem', opacity: 0.6, fontWeight: 700 }}>{penWidth}px</span>
                            </div>
                            <input
                                type="range"
                                min="1" max="40" step="1"
                                value={penWidth}
                                onChange={(e) => setPenWidth(Number(e.target.value))}
                                className="custom-slider"
                                title={`Pen Width: ${penWidth}px`}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Opacitat</span>
                                <span style={{ fontSize: '0.6rem', opacity: 0.6, fontWeight: 700 }}>{Math.round(penOpacity * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.1" max="1" step="0.05"
                                value={penOpacity}
                                onChange={(e) => setPenOpacity(Number(e.target.value))}
                                className="custom-slider"
                                title={`Opacity: ${Math.round(penOpacity * 100)}%`}
                            />
                        </div>
                    </div>

                    <div style={{ gridColumn: 'span 2', width: '24px', height: '1px', background: 'var(--border)' }}></div>

                    {/* Pen custom color */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pen</span>
                        <label style={{ position: 'relative', cursor: 'pointer' }} title="Custom pen color">
                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: penColor, border: '2px solid var(--border)', cursor: 'pointer' }} />
                            <input
                                type="color"
                                value={penColor}
                                onChange={(e) => { setPenColor(e.target.value as PenColor); setTool('pen'); }}
                                style={{ opacity: 0, position: 'absolute', top: 0, left: 0, width: '22px', height: '22px', cursor: 'pointer' }}
                            />
                        </label>
                    </div>

                    {/* Text default color */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Text</span>
                        <label style={{ position: 'relative', cursor: 'pointer' }} title="Default text color">
                            <div style={{ width: '22px', height: '22px', borderRadius: '4px', background: defaultTextColor, border: '2px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: '10px', fontWeight: 900, color: 'white', mixBlendMode: 'difference' }}>A</span>
                            </div>
                            <input
                                type="color"
                                value={defaultTextColor}
                                onChange={(e) => setDefaultTextColor(e.target.value)}
                                style={{ opacity: 0, position: 'absolute', top: 0, left: 0, width: '22px', height: '22px', cursor: 'pointer' }}
                            />
                        </label>
                    </div>

                    <div style={{ gridColumn: 'span 2', flex: 1 }}></div>

                    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.8rem', marginTop: '0.5rem', width: '100%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0' }}>
                            <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'center' }}>Mida Text</span>
                            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                                <input type="number" value={commentDefaultSize} onChange={e => setCommentDefaultSize(Number(e.target.value))}
                                    style={{ width: '100%', maxWidth: '60px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 4px', fontSize: '0.75rem', textAlign: 'center' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0' }}>
                            <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'center' }}>Mida Nota</span>
                            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                                <input type="number" value={scoreStampSize} onChange={e => setScoreStampSize(Number(e.target.value))}
                                    style={{ width: '100%', maxWidth: '60px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 4px', fontSize: '0.75rem', textAlign: 'center' }} />
                            </div>
                        </div>
                        <button
                            onClick={() => { if (window.confirm('Eliminar TOTES les anotacions de l\'exercici?')) { updateAnnotationsWithHistory([]); setSelectedId(null); } }}
                            style={{
                                width: '100%',
                                background: 'rgba(239, 68, 68, 0.08)',
                                color: 'var(--danger)',
                                border: '1px solid rgba(239, 68, 68, 0.15)',
                                borderRadius: '4px',
                                padding: '4px 2px',
                                cursor: 'pointer',
                                fontSize: '0.6rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '3px'
                            }}
                        >
                            <Trash2 size={10} />
                            Netejar Tot
                        </button>
                    </div>

                    <div style={{ gridColumn: 'span 2', display: 'flex', gap: '0.25rem', paddingBottom: '0.5rem', paddingTop: '0.5rem', position: 'relative', zIndex: 1 }}>
                        <button className="btn-icon" onClick={handleUndo} title="Undo (Ctrl+Z)" disabled={history.length === 0}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '6px 4px' }}>
                            <Undo size={18} />
                            <span style={{ fontSize: '0.5rem', opacity: 0.45, fontFamily: 'monospace' }}>^Z</span>
                        </button>
                        <button className="btn-icon" onClick={deleteSelected} title="Delete Selected (Del)" disabled={!selectedId} style={{ color: selectedId ? 'var(--danger)' : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '6px 4px' }}>
                            <Trash2 size={18} />
                            <span style={{ fontSize: '0.5rem', opacity: 0.45, fontFamily: 'monospace' }}>DEL</span>
                        </button>
                    </div>
                </div>

                {/* Main Vertical Layout (Workspace + Bottom Bar) */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative', background: 'var(--bg-primary)' }}>
                    {/* Main Workspace */}
                    <div className="workspace" ref={containerRef} style={{ background: 'transparent', display: 'flex', flexDirection: 'column', position: 'relative', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                        {renderedPages.length > 0 ? (
                            <div
                                className="canvas-container"
                                style={{
                                    width: '100%',
                                    flex: 1,
                                    minHeight: 0,
                                    position: 'relative',
                                    margin: 0,
                                    boxShadow: 'none',
                                    background: 'transparent'
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const payload = e.dataTransfer.getData('text/comment');
                                    if (!payload || !stageRef.current) return;
                                    let commentText = payload;
                                    let commentScore: number | undefined = undefined;
                                    try {
                                        const parsed = JSON.parse(payload);
                                        commentText = parsed.text;
                                        commentScore = parsed.score;
                                    } catch { }
                                    const rect = (e.target as HTMLElement).closest('.canvas-container')?.getBoundingClientRect();
                                    if (!rect) return;
                                    const canvasX = e.clientX - rect.left;
                                    const canvasY = e.clientY - rect.top;
                                    const stage = stageRef.current;
                                    const transform = stage.getAbsoluteTransform().copy().invert();
                                    const actualPos = transform.point({ x: canvasX, y: canvasY });
                                    const newId = `text_${Date.now()}`;
                                    // Resolve comment color from colorMode
                                    let resolvedColor = defaultTextColor;
                                    try {
                                        const parsed = JSON.parse(payload);
                                        const cm = parsed.colorMode || 'neutral';
                                        if (cm === 'score') {
                                            resolvedColor = (parsed.score !== undefined && parsed.score > 0) ? '#10b981' : '#ef4444';
                                        } else if (cm === 'custom' && parsed.customColor) {
                                            resolvedColor = parsed.customColor;
                                        }
                                    } catch { }
                                    const newAnnotation: TextAnnotation = {
                                        id: newId,
                                        type: 'text',
                                        x: actualPos.x,
                                        y: actualPos.y,
                                        text: commentText,
                                        color: resolvedColor,
                                        fontSize: commentDefaultSize,
                                        score: commentScore,
                                    };
                                    updateAnnotationsWithHistory([...currentAnnotations, newAnnotation] as Annotation[]);
                                    setDraggingComment(null);
                                    setTool('select');
                                    // Select after short delay to let state settle
                                    setTimeout(() => setSelectedId(newId), 50);
                                }}                            >
                                <Stage
                                    ref={stageRef}
                                    width={containerRef.current?.clientWidth || window.innerWidth}
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
                                        // If we click the stage (empty area), deselect
                                        if (e.target === e.target.getStage()) {
                                            setSelectedId(null);
                                        }
                                    }}
                                    onTap={(e) => {
                                        if (e.target === e.target.getStage()) {
                                            setSelectedId(null);
                                        }
                                    }}
                                    draggable={tool === 'select'}
                                    onDragEnd={(e) => {
                                        if (tool === 'select' && e.target === stageRef.current) {
                                            setStagePos({ x: e.target.x(), y: e.target.y() });
                                        }
                                    }}
                                    style={{ cursor: tool === 'pen' ? 'crosshair' : tool === 'highlighter' ? 'text' : tool === 'text' ? 'text' : tool === 'select' ? 'grab' : 'default' }}
                                >
                                    <Layer>
                                        {/* Render the background pages */}
                                        {renderedPages.map((page, i) => (
                                            <KonvaImage key={i} image={page.img} x={page.xOffset || 0} y={page.yOffset} width={page.width} height={page.height} />
                                        ))}

                                        {/* Clipping Limit Visualization */}
                                        {renderedPages.length > 0 && (
                                            <Rect
                                                x={0}
                                                y={0}
                                                width={(currentExercise.type === 'pages' && (currentExercise as any).spansTwoPages && renderedPages.length > 1) 
                                                    ? renderedPages[0].width + (renderedPages[1].width || 0) + 20
                                                    : renderedPages[0].width}
                                                height={renderedPages.reduce((max, p) => Math.max(max, p.yOffset + p.height), 0)}
                                                stroke="#ef4444"
                                                strokeWidth={2 / stageScale}
                                                dash={[15 / stageScale, 10 / stageScale]}
                                                opacity={0.6}
                                                listening={false}
                                            />
                                        )}

                                        {currentAnnotations.map((ann) => {
                                            const isSelected = ann.id === selectedId;

                                            const handleSelect = (e: any) => {
                                                if (tool === 'select') {
                                                    e.cancelBubble = true;
                                                    setSelectedId(ann.id);
                                                }
                                            };

                                            const handleDbClickText = (e: any) => {
                                                if (tool === 'select' && ann.type === 'text') {
                                                    e.cancelBubble = true;
                                                    setEditingTextNode({
                                                        id: ann.id,
                                                        text: ann.text,
                                                        x: ann.x,
                                                        y: ann.y
                                                    });
                                                }
                                            };

                                            if (ann.type === 'pen') {
                                                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                                                for (let i = 0; i < ann.points.length; i += 2) {
                                                    minX = Math.min(minX, ann.points[i]);
                                                    minY = Math.min(minY, ann.points[i + 1]);
                                                    maxX = Math.max(maxX, ann.points[i]);
                                                    maxY = Math.max(maxY, ann.points[i + 1]);
                                                }

                                                return (
                                                    <Group
                                                        key={ann.id}
                                                        id={ann.id}
                                                        draggable={tool === 'select' && isSelected}
                                                        onDragEnd={(e) => handleDragEnd(e, ann.id)}
                                                        onClick={handleSelect}
                                                        onTap={handleSelect}
                                                        onTransformEnd={(e) => handleTransformEnd(e, ann.id)}
                                                    >
                                                        <Line
                                                            points={ann.points}
                                                            stroke={ann.color}
                                                            strokeWidth={(ann.strokeWidth || 2) / stageScale}
                                                            lineCap="round"
                                                            lineJoin="round"
                                                            tension={0.5}
                                                            opacity={ann.opacity ?? 1}
                                                            hitStrokeWidth={10 / stageScale}
                                                        />
                                                        {isSelected && (
                                                            <Rect
                                                                x={minX - 4} y={minY - 4}
                                                                width={(maxX - minX) + 8} height={(maxY - minY) + 8}
                                                                stroke="#6366f1" dash={[4 / stageScale, 4 / stageScale]} strokeWidth={1 / stageScale} fill="transparent"
                                                            />
                                                        )}
                                                    </Group>
                                                );
                                            } else if (ann.type === 'highlighter') {
                                                const annFontSize = (ann.fontSize || commentDefaultSize) * FONT_SCALE;
                                                const labelColor = ann.color.startsWith('rgba') 
                                                    ? ann.color.replace(/[\d.]+\)$/, '1.0)') 
                                                    : ann.color;

                                                return (
                                                    <Group
                                                        key={ann.id}
                                                        id={ann.id}
                                                        x={ann.x}
                                                        y={ann.y}
                                                        draggable={tool === 'select' && isSelected}
                                                        onClick={handleSelect}
                                                        onTap={handleSelect}
                                                        onDragEnd={(e) => handleDragEnd(e, ann.id)}
                                                    >
                                                        <Rect
                                                            width={ann.width}
                                                            height={ann.height}
                                                            fill={ann.color}
                                                            stroke={isSelected ? 'var(--accent)' : undefined}
                                                            strokeWidth={isSelected ? 1 / stageScale : 0}
                                                            onTransformEnd={(e) => handleTransformEnd(e, ann.id)}
                                                        />
                                                        {(ann.label || ann.points !== undefined) && (
                                                            <Text
                                                                x={2}
                                                                y={-(annFontSize + 4)}
                                                                text={[
                                                                    ann.label || '',
                                                                    ann.points !== undefined ? (ann.points > 0 ? `+${ann.points}` : `${ann.points}`) : ''
                                                                ].filter(Boolean).join(' ')}
                                                                fill={labelColor}
                                                                fontSize={annFontSize}
                                                                fontFamily="'Caveat', cursive"
                                                                fontStyle="800"
                                                                letterSpacing={0.5}
                                                                align="left"
                                                            />
                                                        )}
                                                    </Group>
                                                );
                                            } else if (ann.type === 'text') {
                                                if (editingTextNode?.id === ann.id) return null;

                                                const currentFontSize = (ann.fontSize || commentDefaultSize) * FONT_SCALE;
                                                return (
                                                    <Group
                                                        key={ann.id}
                                                        id={ann.id}
                                                        x={ann.x} y={ann.y}
                                                        draggable={tool === 'select' && isSelected}
                                                        onClick={handleSelect}
                                                        onTap={handleSelect}
                                                        onDblClick={handleDbClickText}
                                                        onDblTap={handleDbClickText}
                                                        onDragEnd={(e) => handleDragEnd(e, ann.id)}
                                                    >
                                                        <Text
                                                            text={ann.text}
                                                            fill={ann.color}
                                                            fontSize={currentFontSize}
                                                            fontFamily="Caveat, cursive"
                                                        />
                                                        {ann.score !== undefined && (
                                                            <Text
                                                                x={0}
                                                                y={-(currentFontSize * 0.7)}
                                                                text={ann.score > 0 ? `+${ann.score}` : `${ann.score}`}
                                                                fill={ann.color}
                                                                fontSize={currentFontSize * 0.65}
                                                                fontFamily="'Caveat', cursive"
                                                                fontStyle="bold"
                                                            />
                                                        )}
                                                        {isSelected && (
                                                            <Rect
                                                                x={-4} y={-4}
                                                                width={(ann.text.length * (currentFontSize * 0.6)) + 8} height={currentFontSize + 8}
                                                                stroke="#6366f1" dash={[4 / stageScale, 4 / stageScale]} strokeWidth={1 / stageScale} fill="transparent"
                                                            />
                                                        )}
                                                    </Group>
                                                );
                                            } else if (ann.type === 'image') {
                                                const img = new Image();
                                                img.src = ann.dataUrl;
                                                return (
                                                    <Group
                                                        key={ann.id} x={ann.x} y={ann.y}
                                                        draggable={tool === 'select' && isSelected}
                                                        onClick={handleSelect}
                                                        onTap={handleSelect}
                                                        onDragEnd={(e) => handleDragEnd(e, ann.id)}
                                                    >
                                                        <KonvaImage image={img} width={ann.width} height={ann.height} />
                                                        {isSelected && (
                                                            <Rect width={ann.width} height={ann.height} stroke="var(--accent)" dash={[5, 5]} strokeWidth={2} />
                                                        )}
                                                    </Group>
                                                );
                                            }
                                            return null;
                                        })}
                                        {selectedId && (
                                            <Transformer
                                                ref={transformerRef}
                                                rotateEnabled={false}
                                                borderStroke="#6366f1"
                                                borderStrokeWidth={1}
                                                anchorFill="white"
                                                anchorStroke="#6366f1"
                                                anchorStrokeWidth={1.5}
                                                anchorSize={5 / stageScale}
                                                anchorCornerRadius={1}
                                                padding={5 / stageScale}
                                                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
                                            />
                                        )}

                                        {/* Persistent Score Stamp in Viewer */}
                                        {renderedPages.length > 0 && computedScore !== null && (() => {
                                            const totalPossible = gradableExercises.reduce((acc, ex) => acc + (ex.maxScore ?? 10), 0);
                                            const currentFactor = totalPossible > 0 ? targetMaxScore / totalPossible : 1;
                                            const scaledExScore = Math.round(computedScore * currentFactor * 100) / 100;
                                            const scaledExMax = (currentExercise.maxScore ?? 10) * currentFactor;

                                            return (
                                                <Text
                                                    x={renderedPages[0].width - 310}
                                                    y={renderedPages.reduce((sum, p) => sum + p.height, 0) - (scoreStampSize + 10)}
                                                    text={`Nota: ${scaledExScore}`}
                                                    fontSize={scoreStampSize}
                                                    fontFamily="'Caveat', cursive"
                                                    fontStyle="bold"
                                                    fill={(scaledExScore >= (scaledExMax / 2)) ? '#10b981' : '#ef4444'}
                                                    align="right"
                                                    width={300}
                                                />
                                            );
                                        })()}
                                    </Layer>
                                </Stage>

                                {/* HTML Overlay for Text Editing */}
                                {editingTextNode && (
                                    <textarea
                                        ref={textareaRef}
                                        autoFocus
                                        placeholder="Escriu aquí... (Enter per confirmar, Esc per cancel·lar)"
                                        value={editingTextNode.text}
                                        onChange={(e) => setEditingTextNode({ ...editingTextNode, text: e.target.value })}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                commitTextEdit();
                                            } else if (e.key === 'Escape') {
                                                setEditingTextNode(null);
                                            }
                                            e.stopPropagation();
                                        }}
                                        style={{
                                            position: 'absolute',
                                            top: (editingTextNode.y * stageScale) + stagePos.y,
                                            left: (editingTextNode.x * stageScale) + stagePos.x,
                                            margin: 0,
                                            padding: '4px',
                                            border: '1px solid var(--accent)',
                                            background: 'var(--bg-primary)',
                                            outline: 'none',
                                            resize: 'both',
                                            color: penColor,
                                            fontSize: `${(activePresetId ? 18 : commentDefaultSize) * FONT_SCALE * stageScale}px`,
                                            fontFamily: "'Caveat', cursive",
                                            fontWeight: 700,
                                            lineHeight: 1.2,
                                            minWidth: '200px',
                                            minHeight: '60px',
                                            zIndex: 10
                                        }}
                                    />
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '20vh', color: 'var(--text-secondary)' }}>
                                <div className="loader"></div>
                                Loading exercise view for Student {studentIdx + 1}...
                            </div>
                        )}
                    </div>

                    {/* Bottom Comment Bar (Inside Center Column so Sidebars reach bottom) */}
                    <div className="bottom-comment-bank" style={{
                        height: `${commentBankHeight}px`,
                        background: 'var(--bg-tertiary)',
                        borderTop: '1px solid var(--border)',
                        padding: '0.4rem 0.75rem',
                        display: 'flex',
                        gap: '0.75rem',
                        flexShrink: 0,
                        position: 'relative',
                        zIndex: 20,
                        boxShadow: 'none'
                    }}>
                        {/* Resize handle */}
                        <div
                            onMouseDown={startResizing}
                            style={{
                                position: 'absolute', top: '-3px', left: 0, right: 0, height: '6px',
                                cursor: 'ns-resize', zIndex: 30, display: 'flex', justifyContent: 'center'
                            }}
                        >
                            <div style={{ width: '32px', height: '3px', background: 'var(--border)', borderRadius: '2px', marginTop: '2px', opacity: 0.5 }} />
                        </div>
                        {/* Left: Comment Bank Sections (Now Horizontal) */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: '1rem', overflowY: 'hidden', paddingRight: '0.5rem' }}>
                            {/* Generals */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', position: 'sticky', top: 0, background: 'var(--bg-tertiary)', zIndex: 5, paddingBottom: '2px' }}>
                                    <div style={{ width: '3px', height: '9px', background: 'var(--accent)', borderRadius: '1px' }} />
                                    <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Generals</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', paddingBottom: '0.5rem' }}>
                                    {commentBank.map((comment, idx) => {
                                        if (comment.exerciseId) return null;
                                        const isEditing = editingBankComment === idx;
                                        const bgColor = isEditing 
                                            ? (isDarkMode ? '#451a03' : '#fef3c7') 
                                            : (comment.colorMode === 'custom' 
                                                ? (isDarkMode ? `${comment.customColor}30` : `${comment.customColor}15`) 
                                                : comment.score !== undefined 
                                                    ? (comment.score > 0 
                                                        ? (isDarkMode ? '#064e3b' : '#10b98115') 
                                                        : comment.score < 0 
                                                            ? (isDarkMode ? '#7f1d1d' : '#ef444415') 
                                                            : 'var(--bg-secondary)') 
                                                    : (draggingComment === comment.text ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-secondary)'));
                                        
                                        const borderColor = isEditing 
                                            ? (isDarkMode ? '#f59e0b' : '#f59e0b') 
                                            : (comment.colorMode === 'custom' 
                                                ? (isDarkMode ? `${comment.customColor}60` : `${comment.customColor}40`) 
                                                : comment.score !== undefined 
                                                    ? (comment.score > 0 
                                                        ? (isDarkMode ? '#05966960' : '#10b98140') 
                                                        : comment.score < 0 
                                                            ? (isDarkMode ? '#dc262660' : '#ef444440') 
                                                            : 'var(--border)') 
                                                    : 'var(--border)');

                                        const textColor = isEditing 
                                            ? (isDarkMode ? '#fbbf24' : '#92400e') 
                                            : (comment.colorMode === 'custom' 
                                                ? comment.customColor 
                                                : comment.score !== undefined 
                                                    ? (comment.score > 0 
                                                        ? (isDarkMode ? '#34d399' : '#059669') 
                                                        : comment.score < 0 
                                                            ? (isDarkMode ? '#f87171' : '#dc2626') 
                                                            : 'var(--text-primary)') 
                                                    : 'var(--text-primary)');

                                        return (
                                            <div key={`gen_${idx}`} draggable onDragStart={(e) => { e.dataTransfer.setData('text/comment', JSON.stringify(comment)); setDraggingComment(comment.text); }} onDragEnd={() => setDraggingComment(null)}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.6rem', borderRadius: '2rem',
                                                    background: bgColor,
                                                    border: `1px solid ${borderColor}`,
                                                    cursor: 'grab', fontSize: '0.7rem', fontWeight: 600,
                                                    color: textColor,
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', userSelect: 'none',
                                                    transform: isEditing ? 'scale(1.05)' : 'none'
                                                }}
                                                onDoubleClick={() => {
                                                    setEditingBankComment(idx);
                                                    setNewComment(comment.text);
                                                    setNewCommentScore(comment.score?.toString() || '');
                                                    setNewCommentColorMode(comment.colorMode || 'neutral');
                                                    if (comment.customColor) setNewCommentCustomColor(comment.customColor);
                                                }}
                                            >
                                                <span>{comment.text}</span>
                                                {comment.score !== undefined && <span style={{ fontWeight: 800, opacity: 0.8, background: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)', padding: '0.05rem 0.25rem', borderRadius: '3px', fontSize: '0.65rem' }}>{comment.score > 0 ? '+' : ''}{comment.score}</span>}
                                                <button onClick={(e) => { e.stopPropagation(); setCommentBank(prev => prev.filter((_, i) => i !== idx)); if (isEditing) setEditingBankComment(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.4, fontSize: '1rem', marginLeft: '4px' }}>×</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Vertical Divider */}
                            <div style={{ width: '1px', background: 'var(--border)', height: '80%', alignSelf: 'center', opacity: 0.5 }} />

                            {/* Per Exercici */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', position: 'sticky', top: 0, background: 'var(--bg-tertiary)', zIndex: 5, paddingBottom: '2px' }}>
                                    <div style={{ width: '3px', height: '9px', background: '#f59e0b', borderRadius: '1px' }} />
                                    <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ex. {exerciseIdx + 1}</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', paddingBottom: '0.5rem' }}>
                                    {commentBank.map((comment, idx) => {
                                        if (comment.exerciseId !== currentExercise.id) return null;
                                        const isEditing = editingBankComment === idx;
                                        const bgColor = isEditing 
                                            ? (isDarkMode ? '#451a03' : '#fef3c7') 
                                            : (comment.colorMode === 'custom' 
                                                ? (isDarkMode ? `${comment.customColor}30` : `${comment.customColor}15`) 
                                                : comment.score !== undefined 
                                                    ? (comment.score > 0 
                                                        ? (isDarkMode ? '#064e3b' : '#10b98115') 
                                                        : comment.score < 0 
                                                            ? (isDarkMode ? '#7f1d1d' : '#ef444415') 
                                                            : 'var(--bg-secondary)') 
                                                    : (draggingComment === comment.text ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-secondary)'));
                                        
                                        const borderColor = isEditing 
                                            ? (isDarkMode ? '#f59e0b' : '#f59e0b') 
                                            : (comment.colorMode === 'custom' 
                                                ? (isDarkMode ? `${comment.customColor}60` : `${comment.customColor}40`) 
                                                : comment.score !== undefined 
                                                    ? (comment.score > 0 
                                                        ? (isDarkMode ? '#05966960' : '#10b98140') 
                                                        : comment.score < 0 
                                                            ? (isDarkMode ? '#dc262660' : '#ef444440') 
                                                            : 'var(--border)') 
                                                    : 'var(--border)');

                                        const textColor = isEditing 
                                            ? (isDarkMode ? '#fbbf24' : '#92400e') 
                                            : (comment.colorMode === 'custom' 
                                                ? comment.customColor 
                                                : comment.score !== undefined 
                                                    ? (comment.score > 0 
                                                        ? (isDarkMode ? '#34d399' : '#059669') 
                                                        : comment.score < 0 
                                                            ? (isDarkMode ? '#f87171' : '#dc2626') 
                                                            : 'var(--text-primary)') 
                                                    : 'var(--text-primary)');

                                        return (
                                            <div key={`ex_${idx}`} draggable onDragStart={(e) => { e.dataTransfer.setData('text/comment', JSON.stringify(comment)); setDraggingComment(comment.text); }} onDragEnd={() => setDraggingComment(null)}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.6rem', borderRadius: '2rem',
                                                    background: bgColor,
                                                    border: `1px solid ${borderColor}`,
                                                    cursor: 'grab', fontSize: '0.7rem', fontWeight: 600,
                                                    color: textColor,
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', userSelect: 'none',
                                                    transform: isEditing ? 'scale(1.05)' : 'none'
                                                }}
                                                onDoubleClick={() => {
                                                    setEditingBankComment(idx);
                                                    setNewComment(comment.text);
                                                    setNewCommentScore(comment.score?.toString() || '');
                                                    setNewCommentColorMode(comment.colorMode || 'neutral');
                                                    if (comment.customColor) setNewCommentCustomColor(comment.customColor);
                                                }}
                                            >
                                                <span>{comment.text}</span>
                                                {comment.score !== undefined && <span style={{ fontWeight: 800, opacity: 0.8, background: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)', padding: '0.05rem 0.25rem', borderRadius: '3px', fontSize: '0.65rem' }}>{comment.score > 0 ? '+' : ''}{comment.score}</span>}
                                                <button onClick={(e) => { e.stopPropagation(); setCommentBank(prev => prev.filter((_, i) => i !== idx)); if (isEditing) setEditingBankComment(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.4, fontSize: '1rem', marginLeft: '4px' }}>×</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Middle: Quick Add / Edit / Annotation Edit */}
                        <div style={{
                            width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.4rem',
                            background: (selectedId && currentAnnotations.find(a => a.id === selectedId && (a.type === 'text' || a.type === 'highlighter'))) ? 'rgba(99, 102, 241, 0.08)' : (editingBankComment !== null ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-secondary)'),
                            border: (selectedId && currentAnnotations.find(a => a.id === selectedId && (a.type === 'text' || a.type === 'highlighter'))) ? '1px solid rgba(99, 102, 241, 0.3)' : (editingBankComment !== null ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border)'),
                            borderRadius: '8px', transition: 'all 0.3s ease'
                        }}>
                            {(() => {
                                const selectedAnn = currentAnnotations.find(a => a.id === selectedId);
                                const isEditingAnn = selectedAnn && (selectedAnn.type === 'text' || selectedAnn.type === 'highlighter');

                                if (isEditingAnn) {
                                    return (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <Pencil size={10} style={{ color: 'var(--accent)' }} />
                                                    <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        Editant anotació
                                                    </span>
                                                </div>
                                                <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, display: 'flex' }}><X size={12} /></button>
                                            </div>
                                            <input
                                                placeholder="Text..."
                                                autoFocus
                                                value={selectedAnn.type === 'text' ? (selectedAnn as TextAnnotation).text : (selectedAnn as HighlighterAnnotation).label || ''}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        setSelectedId(null);
                                                    }
                                                }}
                                                onChange={e => {
                                                    updateAnnotationsWithHistory(currentAnnotations.map(a =>
                                                        a.id === selectedId ? (a.type === 'text' ? { ...a, text: e.target.value } : { ...a, label: e.target.value }) : a
                                                    ));
                                                }}
                                                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', padding: '0.2rem 0.3rem', fontSize: '0.65rem' }}
                                            />
                                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                                                <input
                                                    type="number" step="0.1" placeholder="Pts"
                                                    value={selectedAnn.type === 'text' ? ((selectedAnn as TextAnnotation).score ?? '') : (selectedAnn.type === 'highlighter' ? ((selectedAnn as HighlighterAnnotation).points ?? '') : '')}
                                                    onChange={e => {
                                                        const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                        updateAnnotationsWithHistory(currentAnnotations.map(a =>
                                                            a.id === selectedId ? (a.type === 'text' ? { ...a, score: val } : (a.type === 'highlighter' ? { ...a, points: val } : a)) : a
                                                        ));
                                                    }}
                                                    style={{ width: '50px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', padding: '0.2rem 0.3rem', fontSize: '0.65rem' }}
                                                />
                                                <input 
                                                    type="color" 
                                                    value={(selectedAnn as any).color?.startsWith('#') ? (selectedAnn as any).color : '#ef4444'} 
                                                    onChange={e => {
                                                        updateAnnotationsWithHistory(currentAnnotations.map(a => 
                                                            a.id === selectedId ? { ...a, color: e.target.value } as any : a
                                                        ));
                                                    }}
                                                    style={{ width: '24px', height: '24px', padding: 0, border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}
                                                    title="Canviar color d'anotació"
                                                />
                                                <div style={{ flex: 1 }}></div>
                                                <button
                                                    onClick={() => {
                                                        updateAnnotationsWithHistory(currentAnnotations.filter(a => a.id !== selectedId));
                                                        setSelectedId(null);
                                                    }}
                                                    style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: 'none', borderRadius: '4px', padding: '0.2rem 0.4rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.65rem' }}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                                <button
                                                    onClick={() => setSelectedId(null)}
                                                    style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem' }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                            </div>
                                        </>
                                    );
                                }

                                return (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                {editingBankComment !== null ? <Pencil size={10} style={{ color: '#d97706' }} /> : <Plus size={8} style={{ color: 'var(--accent)' }} />}
                                                <span style={{ fontSize: '0.55rem', color: editingBankComment !== null ? '#92400e' : 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {editingBankComment !== null ? 'Editar comentari' : 'Nou comentari'}
                                                </span>
                                            </div>
                                            {editingBankComment !== null && (
                                                <button onClick={() => { setEditingBankComment(null); setNewComment(''); setNewCommentScore(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', padding: 0, display: 'flex' }}><X size={12} /></button>
                                            )}
                                        </div>
                                        <input
                                            placeholder="Text..."
                                            value={newComment}
                                            onChange={e => setNewComment(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && newComment.trim()) {
                                                    const score = newCommentScore !== '' ? Number(newCommentScore) : undefined;
                                                    if (editingBankComment !== null) {
                                                        const b = [...commentBank];
                                                        b[editingBankComment] = { ...b[editingBankComment], text: newComment.trim(), score, colorMode: newCommentColorMode, customColor: newCommentColorMode === 'custom' ? newCommentCustomColor : undefined };
                                                        setCommentBank(b);
                                                        setEditingBankComment(null);
                                                    } else {
                                                        setCommentBank(prev => [...prev, {
                                                            text: newComment.trim(),
                                                            score,
                                                            colorMode: newCommentColorMode,
                                                            customColor: newCommentColorMode === 'custom' ? newCommentCustomColor : undefined,
                                                            exerciseId: currentExercise.id
                                                        }]);
                                                    }
                                                    setNewComment(''); setNewCommentScore('');
                                                }
                                            }}
                                            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', padding: '0.2rem 0.3rem', fontSize: '0.65rem' }}
                                        />
                                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                                            <input
                                                type="number" step="0.1" placeholder="Pts"
                                                value={newCommentScore}
                                                onChange={e => setNewCommentScore(e.target.value)}
                                                style={{ width: '40px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', padding: '0.2rem 0.3rem', fontSize: '0.65rem' }}
                                            />
                                            <select
                                                value={newCommentColorMode}
                                                onChange={e => setNewCommentColorMode(e.target.value as any)}
                                                style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', padding: '0.2rem 0.3rem', fontSize: '0.65rem', cursor: 'pointer' }}
                                            >
                                                <option value="neutral">Neutral</option>
                                                <option value="score">Nota</option>
                                                <option value="custom">Color</option>
                                            </select>
                                            {newCommentColorMode === 'custom' && (
                                                <input
                                                    type="color"
                                                    value={newCommentCustomColor}
                                                    onChange={e => setNewCommentCustomColor(e.target.value)}
                                                    style={{ width: '30px', height: '24px', padding: 0, border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}
                                                />
                                            )}
                                            <button
                                                onClick={() => {
                                                    if (newComment.trim()) {
                                                        const score = newCommentScore !== '' ? Number(newCommentScore) : undefined;
                                                        if (editingBankComment !== null) {
                                                            const b = [...commentBank];
                                                            b[editingBankComment] = { ...b[editingBankComment], text: newComment.trim(), score, colorMode: newCommentColorMode, customColor: newCommentColorMode === 'custom' ? newCommentCustomColor : undefined };
                                                            setCommentBank(b);
                                                            setEditingBankComment(null);
                                                        } else {
                                                            setCommentBank(prev => [...prev, {
                                                                text: newComment.trim(),
                                                                score,
                                                                colorMode: newCommentColorMode,
                                                                customColor: newCommentColorMode === 'custom' ? newCommentCustomColor : undefined,
                                                                exerciseId: currentExercise.id
                                                            }]);
                                                        }
                                                        setNewComment(''); setNewCommentScore('');
                                                    }
                                                }}
                                                style={{
                                                    background: editingBankComment !== null ? '#f59e0b' : 'var(--accent)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '0.2rem 0.4rem',
                                                    cursor: 'pointer',
                                                    fontWeight: 700,
                                                    fontSize: '0.7rem'
                                                }}
                                            >
                                                {editingBankComment !== null ? <Check size={14} /> : '+'}
                                            </button>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                    </div>
                </div>

                {/* Grading Right Sidebar */}
                <div className="grading-sidebar" style={{ width: '300px', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0 }}>
                    
                    {/* Properties for Selected Annotation */}
                    {selectedId && (
                        <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>Propietats</span>
                                <button 
                                    className="btn-icon" 
                                    style={{ color: 'var(--danger)', padding: '0.25rem' }} 
                                    onClick={() => deleteSelected()}
                                    title="Eliminar anotació"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Color</label>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#000000'].map(c => {
                                        const selectedAnn = currentAnnotations.find(a => a.id === selectedId);
                                        const isSelectedColor = (selectedAnn as any)?.color === c;
                                        
                                        return (
                                            <button
                                                key={c}
                                                onClick={() => {
                                                    const newAnns = currentAnnotations.map(a => 
                                                        a.id === selectedId ? { ...a, color: c } as any : a
                                                    );
                                                    updateAnnotationsWithHistory(newAnns);
                                                }}
                                                style={{
                                                    width: '24px', height: '24px', borderRadius: '50%',
                                                    background: c, border: isSelectedColor ? '2px solid var(--text-primary)' : '2px solid transparent',
                                                    boxShadow: isSelectedColor ? '0 0 0 1px var(--bg-secondary)' : 'none',
                                                    cursor: 'pointer', padding: 0, transition: 'transform 0.1s'
                                                }}
                                            />
                                        );
                                    })}
                                    <input 
                                        type="color" 
                                        value={(() => {
                                            const ann = currentAnnotations.find(a => a.id === selectedId) as any;
                                            if (ann?.color && ann.color.startsWith('#')) return ann.color;
                                            return '#3b82f6'; 
                                        })()}
                                        onChange={(e) => {
                                            const newAnns = currentAnnotations.map(a => 
                                                a.id === selectedId ? { ...a, color: e.target.value } as any : a
                                            );
                                            updateAnnotationsWithHistory(newAnns);
                                        }}
                                        style={{ width: '24px', height: '24px', padding: 0, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', borderRadius: '4px' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Exercise details</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Status: <strong style={{ color: 'var(--text-primary)' }}>Currently grading</strong></p>
                    </div>

                    <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>Exercise {exerciseIdx + 1}</span>
                                {currentExercise.name && <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{currentExercise.name}</span>}
                            </div>
                            {computedScore !== null ? (
                                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: computedScore < 0 ? 'var(--danger)' : 'var(--accent)' }}>
                                    {computedScore.toFixed(2)} {currentExercise.scoringMode !== 'from_zero' && currentExercise.maxScore !== undefined && `/ ${currentExercise.maxScore}`}
                                </span>
                            ) : (
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Sense nota</span>
                            )}
                        </div>

                        {/* Rubric panel — only shown when scoringMode === 'from_zero' */}
                        {currentExercise.scoringMode === 'from_zero' && currentExercise.rubric && currentExercise.rubric.length > 0 && (
                            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                    <h4 style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>
                                        Rúbrica
                                    </h4>
                                    <button
                                        onClick={() => setIsEditingRubric(!isEditingRubric)}
                                        style={{ background: 'transparent', border: 'none', color: isEditingRubric ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
                                        title="Editar rúbrica"
                                    >
                                        {isEditingRubric ? <Check size={14} /> : <Pencil size={14} />}
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {currentExercise.rubric.map((item, idx) => {
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
                                                    <input
                                                        type="number" step="0.1"
                                                        value={item.points}
                                                        onChange={(e) => {
                                                            const newRubric = [...(currentExercise.rubric || [])];
                                                            newRubric[idx] = { ...item, points: Number(e.target.value) };
                                                            onUpdateExercise({ ...currentExercise, rubric: newRubric });
                                                        }}
                                                        style={{ width: '40px', fontSize: '0.75rem', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'right' }}
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
                                                {/* − button */}
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
                                                {/* Count */}
                                                <span style={{
                                                    minWidth: '18px', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem',
                                                    color: count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'
                                                }}>{count}</span>
                                                {/* + button */}
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
                                                {/* Label & contribution */}
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
                                    })}

                                    {isEditingRubric && (
                                        <button
                                            onClick={() => {
                                                const newRubric = [...(currentExercise.rubric || []), { id: `rub_${Date.now()}`, label: 'Nou ítem', points: 0 }];
                                                onUpdateExercise({ ...currentExercise, rubric: newRubric });
                                            }}
                                            style={{ marginTop: '0.4rem', background: 'var(--bg-primary)', border: '1px dashed var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.7rem', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                        >
                                            <Plus size={12} /> Afegir ítem
                                        </button>
                                    )}
                                </div>
                                {/* Summary breakdown */}
                                {Object.values(currentExRubricCounts).some(v => v > 0) && (
                                    <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
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
                        )}



                        <div style={{ marginTop: '2rem' }}>
                            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem', letterSpacing: '0.05em' }}>Penalty Highlights</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                {presets.map(preset => {
                                    const isEditing = editingPresetId === preset.id;
                                    const isSelected = tool === 'highlighter' && activePresetId === preset.id;

                                    if (isEditing) {
                                        return (
                                            <div key={preset.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.3rem', background: 'var(--bg-tertiary)', borderRadius: '0.3rem', border: '1px solid var(--accent)' }}>
                                                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        value={presetForm.label || ''}
                                                        onChange={e => setPresetForm({ ...presetForm, label: e.target.value })}
                                                        style={{ flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '2px', padding: '0.1rem 0.2rem', fontSize: '0.7rem' }}
                                                        placeholder="Label"
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <input
                                                        type="color"
                                                        value={tempColor}
                                                        onChange={e => {
                                                            setTempColor(e.target.value);
                                                            const hex = e.target.value;
                                                            const r = parseInt(hex.slice(1, 3), 16);
                                                            const g = parseInt(hex.slice(3, 5), 16);
                                                            const b = parseInt(hex.slice(5, 7), 16);
                                                            setPresetForm({ ...presetForm, color: `rgba(${r}, ${g}, ${b}, 0.4)` });
                                                        }}
                                                        style={{ width: '18px', height: '18px', padding: 0, border: 'none', cursor: 'pointer' }}
                                                    />
                                                    <input
                                                        type="number" step="0.25"
                                                        value={presetForm.points || 0}
                                                        onChange={e => setPresetForm({ ...presetForm, points: Number(e.target.value) })}
                                                        style={{ width: '40px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '2px', fontSize: '0.7rem', padding: '0.1rem' }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                                                        <button onClick={() => setEditingPresetId(null)} className="btn-icon" style={{ padding: '0.1rem' }}><X size={10} /></button>
                                                        <button
                                                            onClick={() => {
                                                                setPresets(presets.map(p => p.id === preset.id ? { ...p, ...presetForm } as PresetHighlighter : p));
                                                                setEditingPresetId(null);
                                                            }}
                                                            className="btn-icon" style={{ padding: '0.1rem', color: 'var(--success)' }}
                                                        ><Check size={10} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                                            <button
                                                onClick={() => {
                                                    setTool('highlighter');
                                                    setActivePresetId(preset.id);
                                                    setSelectedId(null);
                                                }}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '0.2rem 0.4rem',
                                                    background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                                                    border: `1px solid ${isSelected ? preset.color.replace('0.4', '1.0') : 'var(--border)'}`,
                                                    borderRadius: '0.3rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.1s ease',
                                                    textAlign: 'left',
                                                    minWidth: 0
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0, flex: 1 }}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: preset.color, flexShrink: 0 }} />
                                                    <span style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isSelected ? 700 : 400, fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.label}</span>
                                                </div>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: preset.points > 0 ? 'var(--success)' : (preset.points < 0 ? 'var(--danger)' : 'var(--text-secondary)'), marginLeft: '4px', flexShrink: 0 }}>
                                                    {preset.points > 0 ? `+${preset.points}` : preset.points}
                                                </span>
                                            </button>
                                            <div style={{ display: 'flex', gap: '0.05rem' }}>
                                                <button
                                                    onClick={() => {
                                                        setEditingPresetId(preset.id);
                                                        setPresetForm(preset);
                                                        setTempColor(preset.color.startsWith('rgba') ?
                                                            '#' + preset.color.match(/\d+/g)!.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('') :
                                                            preset.color
                                                        );
                                                    }}
                                                    style={{ padding: '0.15rem', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }} title="Edit"
                                                >
                                                    <Pencil size={10} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setPresets(presets.filter(p => p.id !== preset.id));
                                                        if (activePresetId === preset.id) setActivePresetId(null);
                                                    }}
                                                    style={{ padding: '0.15rem', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, color: 'var(--danger)' }} title="Delete"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                <button
                                    onClick={() => {
                                        const newPreset: PresetHighlighter = { id: `preset_${Date.now()}`, label: 'New Error', color: 'rgba(239, 68, 68, 0.4)', points: -0.5 };
                                        setPresets([...presets, newPreset]);
                                        setEditingPresetId(newPreset.id);
                                        setPresetForm(newPreset);
                                        setTempColor('#ef4444');
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.2rem', background: 'transparent', border: '1px dashed var(--border)', borderRadius: '0.3rem', color: 'var(--text-secondary)', cursor: 'pointer', marginTop: '0.1rem' }}
                                >
                                    <Plus size={10} />
                                    <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>Afegir</span>
                                </button>
                            </div>
                        </div>


                    </div>
                </div>
            </div>
        </div>
    );
}
