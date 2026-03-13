import { useState, useEffect, useRef, useMemo } from 'react';

declare global {
    interface Window {
        stampDebugged?: Record<string, string>;
    }
}
import { Stage, Layer, Image as KonvaImage, Line, Rect, Group, Text, Transformer } from 'react-konva';
import {
    ChevronLeft, ChevronRight, PenTool, Highlighter, MousePointer2,
    Undo, Trash2, Type, Plus, Pencil, Check, X, Download, Loader2, Moon, Sun, AlertTriangle, RefreshCw, Send, Minus, ChevronDown, ChevronUp
} from 'lucide-react';
// import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas, type PDFDocumentProxy } from '../utils/pdfUtils';
import { exportAnnotatedPDF, exportOriginalLayoutPDF } from '../utils/pdfExport';
import type { Student, ExerciseDef, AnnotationStore, Annotation, PenAnnotation, HighlighterAnnotation, ImageAnnotation, TextAnnotation, ToolType, PresetHighlighter, PenColor, RubricCountStore, AnnotationComment, HighlighterLegendAnnotation } from '../types';

interface Props {
    pdfDoc: PDFDocumentProxy;
    solutionPdfDoc?: PDFDocumentProxy | null;
    students: Student[];
    exercises: ExerciseDef[];
    annotations: AnnotationStore;
    rubricCounts: RubricCountStore;
    commentBank: AnnotationComment[];
    targetMaxScore: number;
    onUpdateCommentBank: (bank: AnnotationComment[]) => void;
    onUpdateTargetMaxScore: (score: number) => void;
    presets: PresetHighlighter[];
    onUpdatePresets: (presets: PresetHighlighter[]) => void;
    onUpdateAnnotations: (studentId: string, exerciseId: string, annotations: Annotation[]) => void;
    onUpdateRubricCounts: (studentId: string, exerciseId: string, itemId: string, delta: number) => void;
    onUpdateExercise: (exercise: ExerciseDef) => void;
    onBack?: () => void;
    onFinish?: () => void;
    studentIdx: number;
    exerciseIdx: number;
    onUpdateStudentIdx: (idx: number) => void;
    onUpdateExerciseIdx: (idx: number) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void) => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}



const FONT_SCALE = 2.5; // Scale from points to our high-res coordinate system

interface RenderedPage {
    img: HTMLImageElement;
    width: number;
    height: number;
    yOffset: number;
    xOffset?: number;
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
                // Allow intermediate states: empty, just minus, or numbers with one comma
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

export default function CorrectionView({
    pdfDoc, solutionPdfDoc, students, exercises, annotations, rubricCounts,
    commentBank, targetMaxScore, onUpdateCommentBank, onUpdateTargetMaxScore,
    presets, onUpdatePresets,
    onUpdateAnnotations, onUpdateRubricCounts, onUpdateExercise, onBack, onFinish,
    studentIdx, exerciseIdx, onUpdateStudentIdx, onUpdateExerciseIdx,
    showConfirm, theme, onToggleTheme
}: Props) {
    const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
    const [isPageLoading, setIsPageLoading] = useState(false);

    const [tool, setTool] = useState<ToolType>(() => (localStorage.getItem('correction-last-tool') as ToolType) || 'pen');
    const [penColor, setPenColor] = useState<PenColor>(() => localStorage.getItem('correction-last-pen-color') || '#ef4444');
    const [highlighterColor, setHighlighterColor] = useState<string>(() => localStorage.getItem('correction-last-h-color') || 'rgba(253, 224, 71, 0.4)');
    const [defaultTextColor] = useState<string>('#111827');
    const [penWidth, setPenWidth] = useState<number>(() => Number(localStorage.getItem('correction-last-pen-width')) || 3);
    const [penOpacity, setPenOpacity] = useState<number>(() => Number(localStorage.getItem('correction-last-pen-opacity')) || 1);
    const [isDrawing, setIsDrawing] = useState(false);

    // Save settings on change
    useEffect(() => { localStorage.setItem('correction-last-tool', tool); }, [tool]);
    useEffect(() => { localStorage.setItem('correction-last-pen-color', penColor); }, [penColor]);
    useEffect(() => { localStorage.setItem('correction-last-h-color', highlighterColor); }, [highlighterColor]);
    useEffect(() => { localStorage.setItem('correction-last-pen-width', String(penWidth)); }, [penWidth]);
    useEffect(() => { localStorage.setItem('correction-last-pen-opacity', String(penOpacity)); }, [penOpacity]);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);

    // Comment bank states
    const [newComment, setNewComment] = useState('');
    const [newCommentScore, setNewCommentScore] = useState<string>('');
    const [newCommentColorMode, setNewCommentColorMode] = useState<'neutral' | 'score' | 'custom'>('neutral');
    const [newCommentCustomColor, setNewCommentCustomColor] = useState('#6366f1');
    const [commentDefaultSize, setCommentDefaultSize] = useState(18);
    const [commentBankHeight, setCommentBankHeight] = useState(160);
    const [isCommentBankExpanded, setIsCommentBankExpanded] = useState(true);
    const [draggingComment, setDraggingComment] = useState<string | null>(null);
    const [editingBankComment, setEditingBankComment] = useState<number | null>(null);
    const [pendingStampComment, setPendingStampComment] = useState<any | null>(null);

    // Highlighters
    const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

    const renderPresetHighlighter = (preset: PresetHighlighter) => {
        const isEditing = editingPresetId === preset.id;
        const isSelected = tool === 'highlighter' && activePresetId === preset.id;

        if (isEditing) {
            return (
                <div key={preset.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.3rem', background: 'var(--bg-secondary)', borderRadius: '0.3rem', border: '1px solid var(--accent)' }}>
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
                        <NumericInput
                            value={presetForm.points || 0}
                            onChange={val => setPresetForm({ ...presetForm, points: val })}
                            style={{ width: '40px' }}
                        />
                        <div style={{ display: 'flex', gap: '0.2rem' }}>
                            <button onClick={() => setEditingPresetId(null)} className="btn-icon" style={{ padding: '0.1rem' }}><X size={10} /></button>
                            <button
                                onClick={() => {
                                    onUpdatePresets(presets.map(p => p.id === preset.id ? { ...p, ...presetForm } as PresetHighlighter : p));
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
                        {formatScaledPoints(preset.points)}
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
                            onUpdatePresets(presets.filter(p => p.id !== preset.id));
                            if (activePresetId === preset.id) setActivePresetId(null);
                        }}
                        style={{ padding: '0.15rem', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, color: 'var(--danger)' }} title="Delete"
                    >
                        <Trash2 size={10} />
                    </button>
                </div>
            </div>
        );
    };
    const [presetForm, setPresetForm] = useState<Partial<PresetHighlighter>>({});
    const [tempColor, setTempColor] = useState<string>('#fde047');
    const [activePresetId, setActivePresetId] = useState<string | null>(null);

    // Rubric editing
    const [isEditingRubric, setIsEditingRubric] = useState(false);

    // Selection & Editing state
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingTextNode, setEditingTextNode] = useState<{ id: string, text: string, x: number, y: number, width?: number, height?: number } | null>(null);

    // Zoom & Pan state
    const [stageScale, setStageScale] = useState(1);
    const [baseScale, setBaseScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [scoreStampSize, setScoreStampSize] = useState(24);
    const [history, setHistory] = useState<Annotation[][]>([]);
    const [highlighterLabelMode, setHighlighterLabelMode] = useState<'individual' | 'legend'>('individual');
    const isDarkMode = theme === 'dark';

    useEffect(() => {
        if (solutionPdfDoc) {
            console.log("[CorrectionView] Solucionari carregat:", solutionPdfDoc.numPages, "pàgines");
        }
    }, [solutionPdfDoc]);

    const [pendingStampChange, setPendingStampChange] = useState<{ x: number, y: number, scale: number } | null>(null);
    const transformerRef = useRef<any>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isErasingSessionRef = useRef(false);

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

    const handleEraserAtPos = (actualPos: { x: number, y: number }) => {
        const eraserRadius = 20 / baseScale;
        const newAnnots = currentAnnotations.filter(ann => {
            if (ann.type === 'pen') {
                for (let i = 0; i < ann.points.length; i += 2) {
                    const dist = Math.sqrt(Math.pow(ann.points[i] - actualPos.x, 2) + Math.pow(ann.points[i + 1] - actualPos.y, 2));
                    if (dist < eraserRadius) return false;
                }
            } else if (ann.type === 'highlighter' || ann.type === 'image') {
                if (actualPos.x >= ann.x && actualPos.x <= ann.x + ann.width &&
                    actualPos.y >= ann.y && actualPos.y <= ann.y + ann.height) return false;
            } else if (ann.type === 'text') {
                const fontSize = (ann.fontSize || 18) * 1.5;
                if (actualPos.x >= ann.x && actualPos.x <= ann.x + (ann.text.length * fontSize * 0.6) &&
                    actualPos.y >= ann.y - fontSize && actualPos.y <= ann.y + fontSize) return false;
            }
            return true;
        });

        if (newAnnots.length !== currentAnnotations.length) {
            if (!isErasingSessionRef.current) {
                setHistory(prev => [...prev.slice(-19), currentAnnotations]);
                isErasingSessionRef.current = true;
            }
            onUpdateAnnotations(currentStudent.id, currentExercise.id, newAnnots);
        }
    };

    const gradableExercises = useMemo(() => exercises.filter((ex: ExerciseDef) => ex.type === 'crop' || ex.type === 'pages'), [exercises]);
    const currentStudent = students[studentIdx];
    const currentExercise = gradableExercises[exerciseIdx];
    const currentAnnotations = (currentStudent && currentExercise)
        ? (annotations[currentStudent.id]?.[currentExercise.id] || [])
        : [];

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

    // Scaling calculations
    const totalPossiblePoints = useMemo(() => gradableExercises.reduce((acc, ex) => acc + (ex.maxScore ?? 10), 0), [gradableExercises]);
    const currentFactor = useMemo(() => totalPossiblePoints > 0 ? targetMaxScore / totalPossiblePoints : 1, [totalPossiblePoints, targetMaxScore]);

    const formatScaledPoints = (p: number) => {
        const s = Math.round(p * currentFactor * 100) / 100;
        return (s > 0 ? '+' : '') + s;
    };
    const scaleValue = (p: number) => Math.round(p * currentFactor * 100) / 100;

    const scoreStampData = useMemo(() => {
        if (!renderedPages.length || computedScore === null || !currentExercise) return null;

        const scaledExScore = scaleValue(computedScore);
        const scaledExMax = scaleValue(currentExercise.maxScore ?? 10);

        const rubricSumm = (currentExercise.rubric || [])
            .filter(item => (currentExRubricCounts[item.id] || 0) > 0)
            .map(item => `${item.label}${currentExRubricCounts[item.id] > 1 ? ` (x${currentExRubricCounts[item.id]})` : ''} (${formatScaledPoints(item.points * currentExRubricCounts[item.id])})`)
            .join(', ');

        const groupRepetitions = (items: { label: string, pts?: number }[]) => {
            const map = new Map<string, { count: number, pts?: number }>();
            for (const item of items) {
                const key = item.label;
                if (map.has(key)) {
                    const existing = map.get(key)!;
                    map.set(key, { count: existing.count + 1, pts: (existing.pts || 0) + (item.pts || 0) });
                } else {
                    map.set(key, { count: 1, pts: item.pts });
                }
            }
            return Array.from(map.entries()).map(([label, data]) => {
                return `${label}${data.count > 1 ? ` (x${data.count})` : ''}${data.pts !== undefined ? ` (${formatScaledPoints(data.pts)})` : ''}`;
            }).join(', ');
        };

        const highlightItems = currentAnnotations
            .filter(ann => ann.type === 'highlighter' && (ann as any).points !== undefined)
            .map(ann => ({ label: ((ann as any).label || 'Marc').trim(), pts: (ann as any).points as number }));
        const highlightSumm = groupRepetitions(highlightItems);

        const scoredCommItems = currentAnnotations
            .filter(ann => ann.type === 'text' && (ann as any).text.trim().length > 0 && (ann as any).score !== undefined)
            .map(ann => ({ label: (ann as any).text.trim(), pts: (ann as any).score as number }));
        const scoredCommSumm = groupRepetitions(scoredCommItems);

        const pureCommItems = currentAnnotations
            .filter(ann => ann.type === 'text' && (ann as any).text.trim().length > 0 && (ann as any).score === undefined)
            .map(ann => ({ label: (ann as any).text.trim() }));
        const pureCommSumm = groupRepetitions(pureCommItems);

        const lines = [
            rubricSumm ? `Rúbrica: ${rubricSumm}` : '',
            highlightSumm ? `Fluorescents: ${highlightSumm}` : '',
            scoredCommSumm ? `Comentaris (+pts): ${scoredCommSumm}` : '',
            pureCommSumm ? `Comentaris: ${pureCommSumm}` : ''
        ].filter(Boolean);

        const stampStorage = currentAnnotations.find(a => a.id === 'system_score_stamp') as TextAnnotation | undefined;
        const lastPage = renderedPages[renderedPages.length - 1];

        // Robust layout-aware dimensions
        const totalW = Math.max(...renderedPages.map(p => (p.xOffset ?? 0) + p.width));
        const totalH = Math.max(...renderedPages.map(p => p.yOffset + p.height));

        const defaultStampX = (lastPage.width > 600) ? (lastPage.width - 550) : 20;
        const defaultStampY = (totalH > 100) ? (totalH - 80) : 10;

        let x = stampStorage?.x ?? currentExercise.stampX ?? defaultStampX;
        let y = stampStorage?.y ?? currentExercise.stampY ?? defaultStampY;
        const scale = stampStorage?.width ? (stampStorage.width / 500) : (currentExercise.stampScale ?? 1);

        // Clamp coordinates within bounds (safety)
        x = Math.max(0, Math.min(x, totalW - 100));
        y = Math.max(0, Math.min(y, totalH - 50));

        const linesCount = lines.length;
        const height = (scoreStampSize * 1.5) + (linesCount > 0 ? (linesCount * scoreStampSize * 0.75 * 1.2) + scoreStampSize * 0.5 : 0);

        console.log(`[STAMP DEBUG] Ex: ${currentExercise.name}, x: ${x}, y: ${y}, totalH: ${totalH}, score: ${scaledExScore}, lines: ${linesCount}`);

        return {
            x, y, scale, height, scaledExScore, scaledExMax, lines
        };
    }, [
        renderedPages, computedScore, currentExercise, currentAnnotations,
        currentExRubricCounts, targetMaxScore, gradableExercises, scoreStampSize
    ]);

    const totalStudentScore = currentStudent ? gradableExercises.reduce((acc: number, ex: ExerciseDef) => {
        const exAnns = annotations[currentStudent.id]?.[ex.id] || [];
        const exRubric = rubricCounts[currentStudent.id]?.[ex.id] || {};
        const exAdjustment = exAnns.reduce((sum: number, ann: any) => {
            if (ann.type === 'highlighter' && typeof ann.points === 'number') return sum + ann.points;
            if (ann.type === 'text' && typeof ann.score === 'number') return sum + ann.score;
            return sum;
        }, 0);

        let exScore = 0;
        if (ex.scoringMode === 'from_zero' && ex.rubric) {
            const rb = ex.rubric.reduce((sum: number, item: any) => sum + item.points * (exRubric[item.id] ?? 0), 0);
            exScore = rb + exAdjustment;
        } else {
            exScore = (ex.maxScore || 0) + exAdjustment;
        }
        return acc + Math.max(0, exScore);
    }, 0) : 0;

    // Fix JS float weirdness (like 0.1+0.2=0.3000000004)
    const roundedTotalStudentScore = Math.round(totalStudentScore * 100) / 100;

    useEffect(() => {
        if (editingTextNode && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [editingTextNode]);

    useEffect(() => {
        setSelectedId(null);
    }, [studentIdx, exerciseIdx]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const key = e.key.toLowerCase();
            if (key === 'v') setTool('select');
            if (key === 'p') setTool('pen');
            if (key === 't') setTool('text');
            if (key === 'h') setTool('highlighter');
            if (key === 'x') setTool('eraser');

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
                e.preventDefault();
                if (studentIdx < students.length - 1) onUpdateStudentIdx(studentIdx + 1);
            } else if (key === 'arrowleft') {
                e.preventDefault();
                if (studentIdx > 0) onUpdateStudentIdx(studentIdx - 1);
            } else if (key === 'arrowdown') {
                e.preventDefault();
                if (exerciseIdx < gradableExercises.length - 1) onUpdateExerciseIdx(exerciseIdx + 1);
            } else if (key === 'arrowup') {
                e.preventDefault();
                if (exerciseIdx > 0) onUpdateExerciseIdx(exerciseIdx - 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tool, selectedId, currentAnnotations, presets, studentIdx, exerciseIdx, history]);

    const stageRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastDistRef = useRef<number>(0);

    const applyZoom = (newScale: number, pointer?: { x: number, y: number }) => {
        const stage = stageRef.current;
        if (!stage) return;
        const oldScale = stage.scaleX();
        const safeScale = Math.min(10, Math.max(0.1, newScale));

        let targetPointer = pointer;
        if (!targetPointer) {
            if (containerRef.current) {
                targetPointer = {
                    x: containerRef.current.clientWidth / 2,
                    y: containerRef.current.clientHeight / 2
                };
            } else {
                targetPointer = { x: stage.width() / 2, y: stage.height() / 2 };
            }
        }

        const mousePointTo = { x: (targetPointer.x - stage.x()) / oldScale, y: (targetPointer.y - stage.y()) / oldScale };
        setStageScale(safeScale);
        setStagePos({ x: targetPointer.x - mousePointTo.x * safeScale, y: targetPointer.y - mousePointTo.y * safeScale });
    };

    useEffect(() => {
        if (!currentStudent || !currentExercise || !pdfDoc) return;

        setSelectedId(null);
        setEditingTextNode(null);
        setRenderedPages([]); // Clear old pages immediately to avoid ghost rendering during transition
        setIsPageLoading(true);

        let isMounted = true;

        const loadExerciseRegions = async () => {
            if (!containerRef.current) {
                if (isMounted) setTimeout(loadExerciseRegions, 50);
                return;
            }

            const images: RenderedPage[] = [];
            let currentYOffset = 0;

            try {
                if (currentExercise.type === 'crop') {
                    let actualPageIndex = currentStudent.pageIndexes[currentExercise.pageIndex];

                    console.log(`[DEBUG] CROP Exercise: exercise.pageIndex=${currentExercise.pageIndex}, mapped actualPageIndex=${actualPageIndex}`);
                    if (actualPageIndex !== undefined && actualPageIndex >= 1 && actualPageIndex <= pdfDoc.numPages && !isNaN(actualPageIndex)) {

                        // Check if this page is ignored
                        if (currentStudent.ignoredPageIndexes?.includes(actualPageIndex)) {
                            console.log(`[DEBUG] Skipping ignored crop page ${actualPageIndex}`);
                            // Will fall through to placeholder logic below
                        } else {
                            console.log(`[DEBUG] Attempting to render crop on page ${actualPageIndex}`);
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
                        }
                    }
                } else if (currentExercise.type === 'pages') {
                    const spansTwoPages = (currentExercise as any).spansTwoPages;

                    for (let i = 0; i < currentExercise.pageIndexes.length; i++) {
                        const pageIdx = currentExercise.pageIndexes[i];
                        let actualPageIndex = currentStudent.pageIndexes[pageIdx];

                        // Check if this page is ignored
                        if (currentStudent.ignoredPageIndexes?.includes(actualPageIndex)) {
                            console.log(`[DEBUG] Skipping ignored page ${actualPageIndex}`);
                            continue;
                        }

                        if (actualPageIndex === undefined || actualPageIndex < 1 || actualPageIndex > pdfDoc.numPages || isNaN(actualPageIndex)) {
                            continue;
                        }

                        const canvas = document.createElement('canvas');
                        const dimensions = await renderPDFPageToCanvas(pdfDoc, actualPageIndex, canvas, 2.5, isDarkMode);
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

                // If no images were loaded (e.g. all pages ignored), and it's a pages exercise
                if (images.length === 0 && currentExercise.type === 'pages') {
                    // Create a placeholder image with a message
                    const canvas = document.createElement('canvas');
                    canvas.width = 800;
                    canvas.height = 400;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.fillStyle = isDarkMode ? '#1f2937' : '#f3f4f6';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.fillStyle = isDarkMode ? '#9ca3af' : '#4b5563';
                        ctx.font = 'bold 24px Inter, system-ui, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText('Pàgina marcada com a buida per aquest alumne.', 400, 180);
                        ctx.font = '18px Inter, system-ui, sans-serif';
                        ctx.fillText('L\'exercici tindrà un 0 per defecte.', 400, 220);

                        const img = new Image();
                        img.src = canvas.toDataURL('image/png');
                        await new Promise(r => img.onload = r);
                        images.push({ img, width: 800, height: 400, yOffset: 0, xOffset: 0 });
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
                    setBaseScale(targetScale);
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
    }, [
        studentIdx,
        exerciseIdx,
        pdfDoc,
        currentExercise?.id,
        currentExercise?.type,
        (currentExercise as any)?.pageIndex,
        (currentExercise as any)?.pageIndexes ? JSON.stringify((currentExercise as any).pageIndexes) : '',
        (currentExercise as any)?.x, (currentExercise as any)?.y, (currentExercise as any)?.width, (currentExercise as any)?.height,
        (currentExercise as any)?.spansTwoPages,
        currentStudent?.pageIndexes ? currentStudent.pageIndexes.join(',') : '',
        isDarkMode
    ]);

    // Auto-add legend if mode is on and highlighters exist
    useEffect(() => {
        if (!currentStudent || !currentExercise) return;

        const hasHighlighters = currentAnnotations.some(a => a.type === 'highlighter');
        const hasLegend = currentAnnotations.some(a => a.type === 'highlighter_legend');

        if (highlighterLabelMode === 'legend' && hasHighlighters && !hasLegend) {
            // Add legend
            const newLegend: HighlighterLegendAnnotation = {
                id: `legend_${Date.now()}`,
                type: 'highlighter_legend',
                x: 100,
                y: 100,
                scale: 1
            };
            // Use updateAnnotationsWithHistory (silent/no history if possible? 
            // Actually, better to just use current set function to avoid infinite loop)
            onUpdateAnnotations(currentStudent.id, currentExercise.id, [...currentAnnotations, newLegend]);
        } else if ((highlighterLabelMode !== 'legend' || !hasHighlighters) && hasLegend) {
            // Remove legend if it exists but shouldn't (either mode off or no highlighters)
            onUpdateAnnotations(currentStudent.id, currentExercise.id, currentAnnotations.filter(a => a.type !== 'highlighter_legend'));
        }
    }, [highlighterLabelMode, currentAnnotations.length, currentStudent?.id, currentExercise?.id]);

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

                            const img = new Image();
                            img.onload = () => {
                                const newId = `img_${Date.now()}`;
                                const newAnnotation: ImageAnnotation = {
                                    id: newId,
                                    type: 'image',
                                    x: pasteX,
                                    y: pasteY,
                                    width: img.width / 2, // Default to a reasonable size (half of natural)
                                    height: img.height / 2,
                                    dataUrl
                                };

                                updateAnnotationsWithHistory([...currentAnnotations, newAnnotation] as Annotation[]);
                                setTimeout(() => setSelectedId(newId), 50);
                            };
                            img.src = dataUrl;
                        };
                        reader.readAsDataURL(blob);
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [currentStudent, currentExercise, currentAnnotations, editingTextNode, onUpdateAnnotations, stagePos, stageScale]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in input/textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.key === 'Escape') {
                if (editingTextNode) {
                    commitTextEdit();
                } else {
                    setSelectedId(null);
                }
                return;
            }

            // Tools shortcuts
            const key = e.key.toLowerCase();
            if (key === 'v') setTool('select');
            else if (key === 'p') { setTool('pen'); setSelectedId(null); }
            else if (key === 'x') { setTool('eraser'); setSelectedId(null); }
            else if (key === 't') { setTool('text'); setSelectedId(null); }
            else if (key === 'h') { setTool('highlighter'); setActivePresetId(null); setSelectedId(null); }

            // Colors shortcuts
            const presetColors = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#000000'];
            const colorKeys = ['q', 'w', 'e', 'r', 'a', 's'];
            const cIdx = colorKeys.indexOf(key);
            if (cIdx !== -1) {
                const presetColor = presetColors[cIdx];
                setTool(prev => {
                    if (prev === 'highlighter') {
                        const hex = presetColor;
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        setHighlighterColor(`rgba(${r}, ${g}, ${b}, 0.4)`);
                        return 'highlighter';
                    }
                    setPenColor(presetColor as PenColor);
                    return 'pen';
                });
            }

            // Undo and Delete shortcuts are already handled normally or could be here
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedId && !editingTextNode) {
                    deleteSelected();
                }
            }
            if ((e.ctrlKey || e.metaKey) && key === 'z') {
                e.preventDefault();
                handleUndo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingTextNode, selectedId, tool, history, selectedId]);

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

        if (tool === 'select' && !pendingStampComment) return;

        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const transform = stage.getAbsoluteTransform().copy().invert();
        const actualPos = transform.point(pos);
        const actualX = actualPos.x;
        const actualY = actualPos.y;

        if (pendingStampComment) {
            const textColor = pendingStampComment.colorMode === 'custom'
                ? pendingStampComment.customColor
                : pendingStampComment.score !== undefined
                    ? (pendingStampComment.score > 0 ? (isDarkMode ? '#34d399' : '#059669') : pendingStampComment.score < 0 ? (isDarkMode ? '#f87171' : '#dc2626') : defaultTextColor)
                    : defaultTextColor;

            const bgFill = pendingStampComment.colorMode === 'custom'
                ? (isDarkMode ? `${pendingStampComment.customColor}30` : `${pendingStampComment.customColor}15`)
                : pendingStampComment.score !== undefined
                    ? (pendingStampComment.score > 0 ? (isDarkMode ? '#064e3b' : '#10b98115') : pendingStampComment.score < 0 ? (isDarkMode ? '#7f1d1d' : '#ef444415') : 'rgba(255,255,255,0.7)')
                    : 'rgba(255,255,255,0.7)';

            const newAnn: TextAnnotation = {
                id: `ann_${Date.now()}`,
                type: 'text',
                text: pendingStampComment.text,
                x: actualPos.x,
                y: actualPos.y,
                color: textColor || defaultTextColor, // Fallback safety
                bgFill,
                fontSize: commentDefaultSize,
                score: pendingStampComment.score
            };

            const newAnnots = [...currentAnnotations, newAnn];
            if (!isErasingSessionRef.current) {
                setHistory(prev => [...prev.slice(-19), currentAnnotations]);
            }
            onUpdateAnnotations(currentStudent.id, currentExercise.id, newAnnots);
            setSelectedId(newAnn.id);
            setPendingStampComment(null);
            setTool('select');
            return;
        }

        if (tool === 'eraser') {
            isErasingSessionRef.current = false; // Reset for new session
            handleEraserAtPos(actualPos);
            setIsDrawing(true); // Treat eraser like drawing for drag support
            return;
        }

        if (tool === 'text') {
            const newId = `text_${Date.now()}`;
            setEditingTextNode({
                id: newId,
                text: '',
                x: actualX,
                y: actualY,
                width: 0,
                height: 0
            });
            setSelectedId(newId);
            setIsDrawing(true);
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
                color: activePreset ? activePreset.color : highlighterColor,
                presetId: activePreset?.id,
                points: activePreset?.points,
                label: activePreset?.label,
                fontSize: commentDefaultSize
            };
            updateAnnotationsWithHistory([...currentAnnotations, newAnnotation]);
        }
    };

    const handleMouseMove = (e: any) => {
        if (!isDrawing && tool !== 'eraser') return;

        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const transform = stage.getAbsoluteTransform().copy().invert();
        const actualPos = transform.point(pos);

        if (tool === 'eraser') {
            handleEraserAtPos(actualPos);
            return;
        }

        if (!isDrawing || tool === 'select') return;

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
        } else if (tool === 'text' && editingTextNode) {
            setEditingTextNode(prev => {
                if (!prev) return null;
                const startX = (prev as any).startX !== undefined ? (prev as any).startX : prev.x;
                const startY = (prev as any).startY !== undefined ? (prev as any).startY : prev.y;

                return {
                    ...prev,
                    startX: startX,
                    startY: startY,
                    x: Math.min(startX, actualPos.x),
                    y: Math.min(startY, actualPos.y),
                    width: Math.abs(actualPos.x - startX),
                    height: Math.abs(actualPos.y - startY)
                };
            });
            return; // Don't fall through to currentAnnotations update yet
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
        } else {
            handleMouseMove(e);
        }
    };

    const handleTouchEnd = () => {
        lastDistRef.current = 0;
        handleMouseUp();
    };

    const handleMouseUp = () => {
        if (isDrawing) {
            setIsDrawing(false);
            if (tool === 'text' && editingTextNode) {
                // If it was a tiny drag, give it a default minimum size
                if ((editingTextNode.width || 0) < 10 && (editingTextNode.height || 0) < 10) {
                    setEditingTextNode(prev => prev ? { ...prev, width: 200, height: 60 } : null);
                }
            }
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
                    width: editingTextNode.width,
                    height: editingTextNode.height,
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
        const isTextGroup = node.hasName('text-group');
        const isHighlighterGroup = node.hasName('highlighter-group');
        const isStampGroup = node.hasName('stamp-group');

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
                }

                if (isTextGroup && a.type === 'text') {
                    // Do not deform text: update width/height and position only
                    return {
                        ...a,
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(20, node.width() * scaleX),
                        height: Math.max(20, node.height() * scaleY),
                    } as TextAnnotation;
                }

                if (isHighlighterGroup && a.type === 'highlighter') {
                    return {
                        ...a,
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(5, (a.width || 0) * scaleX),
                        height: Math.max(5, (a.height || 0) * scaleY),
                    } as HighlighterAnnotation;
                }

                if (isStampGroup && a.type === 'text' && a.id === 'system_score_stamp') {
                    return {
                        ...a,
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(50, (a.width || 0) * scaleX),
                        height: Math.max(20, (a.height || 0) * scaleY),
                    } as TextAnnotation;
                }

                if (a.type === 'image') {
                    // For image we allow scaling uniformly
                    return {
                        ...a,
                        x: node.x(),
                        y: node.y(),
                        width: Math.abs((a.width || 100) * scaleX),
                        height: Math.abs((a.height || 100) * scaleY),
                    } as ImageAnnotation;
                }

                if (a.type === 'highlighter_legend') {
                    return {
                        ...a,
                        x: node.x(),
                        y: node.y(),
                        scale: (a.scale || 1) * scaleX,
                    } as HighlighterLegendAnnotation;
                }
            }
            return a;
        }) as Annotation[];

        node.scaleX(1);
        node.scaleY(1);
        updateAnnotationsWithHistory(newAnnots);
    };

    const handleTransform = (e: any) => {
        const node = e.target;
        const isTextGroup = node.hasName('text-group');
        const isHighlighterGroup = node.hasName('highlighter-group');

        const isStampGroup = node.hasName('stamp-group');

        if (isTextGroup || isHighlighterGroup || isStampGroup) {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);

            const newWidth = Math.max(20, node.width() * scaleX);
            const newHeight = Math.max(20, node.height() * scaleY);

            node.width(newWidth);
            node.height(newHeight);

            if (isTextGroup) {
                const textNodes = node.find('Text');
                textNodes.forEach((t: any) => t.width(newWidth));
                const rectNode = node.findOne('Rect');
                if (rectNode) {
                    rectNode.width(newWidth + 8);
                    rectNode.height(newHeight + 8);
                }
            } else if (isHighlighterGroup) {
                const rectNode = node.findOne('Rect');
                if (rectNode) {
                    rectNode.width(newWidth);
                    rectNode.height(newHeight);
                }
            }
        }
    };

    useEffect(() => {
        if (selectedId && transformerRef.current && stageRef.current) {
            const selectedNode = stageRef.current.findOne('#' + selectedId);
            if (selectedNode && selectedNode.getLayer()) {
                transformerRef.current.nodes([selectedNode]);
                transformerRef.current.getLayer()?.batchDraw();
            } else {
                transformerRef.current.nodes([]);
            }
        } else if (transformerRef.current) {
            transformerRef.current.nodes([]);
        }
    }, [selectedId, currentAnnotations]);


    if (!currentStudent || !currentExercise) {
        const hasNoExercises = exercises.length === 0;
        return (
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-primary)', position: 'relative', overflow: 'hidden'
            }}>
                {/* CSS Confetti - only if we actually finished */}
                {!hasNoExercises && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        {[...Array(50)].map((_, i) => (
                            <div key={i} className="confetti" style={{
                                left: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 3}s`,
                                background: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][Math.floor(Math.random() * 6)]
                            }} />
                        ))}
                    </div>
                )}

                <div style={{
                    textAlign: 'center', zIndex: 10, padding: '2rem', background: 'var(--bg-secondary)',
                    borderRadius: '2rem', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    animation: 'float 6s ease-in-out infinite'
                }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{hasNoExercises ? '📝' : '🏆'}</div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.5rem', background: 'linear-gradient(to right, #6366f1, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {hasNoExercises ? 'No hi ha exercicis' : 'HAS ACABAT!'}
                    </h1>
                    <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', maxWidth: '400px' }}>
                        {hasNoExercises
                            ? "Sembla que no has definit cap zona de l'examen per corregir."
                            : "Has completat tota la correcció. Tots els alumnes tenen els seus exercicis revisats!"}
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
                        {hasNoExercises ? (
                            <button onClick={onBack} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem' }}>
                                <ChevronLeft size={18} /> Definir zones
                            </button>
                        ) : (
                            <>
                                <button onClick={() => onUpdateStudentIdx(0)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem' }}>
                                    <RefreshCw size={18} /> Tornar a començar
                                </button>
                                {onBack && (
                                    <button onClick={onBack} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer' }}>
                                        Sortir
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <style>{`
                    @keyframes float {
                        0% { transform: translateY(0px); }
                        50% { transform: translateY(-20px); }
                        100% { transform: translateY(0px); }
                    }
                    .confetti {
                        position: absolute;
                        top: -10px;
                        width: 10px;
                        height: 10px;
                        opacity: 0.7;
                        border-radius: 2px;
                        animation: confettiFall 4s linear infinite;
                    }
                    @keyframes confettiFall {
                        0% { transform: rotate(0) translateY(0); }
                        100% { transform: rotate(720deg) translateY(100vh); }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', width: '100%', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            {/* Confirm Move Dialog Overlay */}
            {pendingStampChange && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    zIndex: 2000, display: 'flex', flexDirection: 'column', gap: '1rem', width: '320px',
                    animation: 'slideUp 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle style={{ color: 'var(--accent)' }} size={24} />
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Guardar Posició</h3>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        Vols que aquesta posició s'apliqui a tots els alumnes per defecte en aquest exercici?
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                            onClick={() => {
                                onUpdateExercise({
                                    ...currentExercise,
                                    stampX: pendingStampChange.x,
                                    stampY: pendingStampChange.y,
                                    stampScale: pendingStampChange.scale
                                });
                                setPendingStampChange(null);
                            }}
                            className="btn-primary"
                            style={{ padding: '0.6rem', fontSize: '0.85rem' }}
                        >
                            Per a TOTS els alumnes
                        </button>
                        <button
                            onClick={() => {
                                const newStorage: Annotation = {
                                    id: 'system_score_stamp',
                                    type: 'text',
                                    text: '',
                                    x: pendingStampChange.x,
                                    y: pendingStampChange.y,
                                    color: '#000',
                                    fontSize: scoreStampSize,
                                    width: 500 * pendingStampChange.scale,
                                    height: 100 * pendingStampChange.scale
                                };
                                const filtered = currentAnnotations.filter(a => a.id !== 'system_score_stamp');
                                updateAnnotationsWithHistory([...filtered, newStorage]);
                                setPendingStampChange(null);
                            }}
                            style={{
                                padding: '0.6rem', fontSize: '0.85rem', background: 'transparent',
                                border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            Només per a aquest alumne
                        </button>
                        <button
                            onClick={() => setPendingStampChange(null)}
                            style={{
                                padding: '0.4rem', fontSize: '0.75rem', background: 'transparent',
                                border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                                textDecoration: 'underline'
                            }}
                        >
                            Cancel·lar
                        </button>
                    </div>
                </div>
            )}

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
                        <button className="btn-icon" onClick={() => onUpdateExerciseIdx(Math.max(0, exerciseIdx - 1))} disabled={exerciseIdx === 0}>
                            <ChevronLeft />
                        </button>
                        <select
                            value={exerciseIdx}
                            onChange={(e) => onUpdateExerciseIdx(Number(e.target.value))}
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                        >
                            {gradableExercises.map((ex, i) => {
                                const isCurrent = i === exerciseIdx;
                                const isPages = ex.type === 'pages';
                                const pInfo = isPages
                                    ? (ex as any).pageIndexes.map((p: number) => p + 1).join(', ')
                                    : (ex as any).pageIndex + 1;

                                return (
                                    <option key={ex.id} value={i}>
                                        {isCurrent ? '👉 ' : ''}
                                        {ex.name || `Exercici ${i + 1}`}
                                        {` (Pàg${isPages ? 's' : ''}: ${pInfo})`}
                                    </option>
                                );
                            })}
                        </select>
                        <button className="btn-icon" onClick={() => onUpdateExerciseIdx(Math.min(gradableExercises.length - 1, exerciseIdx + 1))} disabled={exerciseIdx === gradableExercises.length - 1}>
                            <ChevronRight />
                        </button>
                    </div>
                    {currentExercise.type === 'pages' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', marginLeft: '0.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={(currentExercise as any).spansTwoPages || false}
                                    onChange={e => {
                                        const newVal = e.target.checked;
                                        if (renderedPages.length >= 2) {
                                            const pages = renderedPages;
                                            students.forEach(student => {
                                                const studentAnns = annotations[student.id]?.[currentExercise.id] || [];
                                                if (studentAnns.length === 0) return;

                                                const migrated = studentAnns.map(ann => {
                                                    const isPen = ann.type === 'pen';
                                                    const ax = isPen ? (ann as any).points[0] : (ann as any).x;
                                                    const ay = isPen ? (ann as any).points[1] : (ann as any).y;

                                                    let pageIdx = 0, localX = ax, localY = ay, found = false;
                                                    const wasSideBySide = !newVal;
                                                    let curY = 0;
                                                    for (let i = 0; i < pages.length; i++) {
                                                        const p = pages[i];
                                                        const isR = wasSideBySide && i % 2 !== 0;
                                                        const xOff = isR ? pages[i - 1].width + 20 : 0;
                                                        const yOff = curY;
                                                        if (ax >= xOff && ax < xOff + p.width + 10 && ay >= yOff && ay < yOff + p.height + 10) {
                                                            pageIdx = i; localX = ax - xOff; localY = ay - yOff; found = true; break;
                                                        }
                                                        if (!wasSideBySide || isR || i === pages.length - 1) curY += p.height + 20;
                                                    }
                                                    if (!found) return ann;

                                                    let targetY = 0, newXOff = 0, curYN = 0;
                                                    for (let i = 0; i <= pageIdx; i++) {
                                                        const p = pages[i];
                                                        const isR = newVal && i % 2 !== 0;
                                                        newXOff = isR ? pages[i - 1].width + 20 : 0;
                                                        targetY = curYN;
                                                        if (!newVal || isR || i === pages.length - 1) curYN += p.height + 20;
                                                    }
                                                    const nx = localX + newXOff, ny = localY + targetY;
                                                    if (isPen) {
                                                        const dx = nx - ax, dy = ny - ay;
                                                        return { ...ann, points: (ann as any).points.map((v: number, i: number) => i % 2 === 0 ? v + dx : v + dy) };
                                                    }
                                                    return { ...ann, x: nx, y: ny };
                                                });
                                                onUpdateAnnotations(student.id, currentExercise.id, migrated);
                                            });
                                        }

                                        let updatedExercise = { ...currentExercise, spansTwoPages: newVal };
                                        if (currentExercise.stampX !== undefined && currentExercise.stampY !== undefined && renderedPages.length >= 2) {
                                            const pages = renderedPages;
                                            const wasSideBySide = !newVal;
                                            let curY = 0, foundIdx = -1, lX = currentExercise.stampX, lY = currentExercise.stampY;
                                            for (let i = 0; i < pages.length; i++) {
                                                const p = pages[i];
                                                const isR = wasSideBySide && i % 2 !== 0;
                                                const xOff = isR ? pages[i - 1].width + 20 : 0;
                                                const yOff = curY;
                                                if (currentExercise.stampX >= xOff && currentExercise.stampX < xOff + p.width + 10 && currentExercise.stampY >= yOff && currentExercise.stampY < yOff + p.height + 10) {
                                                    foundIdx = i; lX = currentExercise.stampX - xOff; lY = currentExercise.stampY - yOff; break;
                                                }
                                                if (!wasSideBySide || isR || i === pages.length - 1) curY += p.height + 20;
                                            }
                                            if (foundIdx !== -1) {
                                                let tY = 0, tXOff = 0, cYN = 0;
                                                for (let i = 0; i <= foundIdx; i++) {
                                                    const p = pages[i];
                                                    const isR = newVal && i % 2 !== 0;
                                                    tXOff = isR ? pages[i - 1].width + 20 : 0;
                                                    tY = cYN;
                                                    if (!newVal || isR || i === pages.length - 1) cYN += p.height + 20;
                                                }
                                                updatedExercise.stampX = lX + tXOff; updatedExercise.stampY = lY + tY;
                                            }
                                        }
                                        onUpdateExercise(updatedExercise as any);
                                    }}
                                />
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)' }}>VISTA 2 PÀGS</span>
                            </label>
                        </div>
                    )}
                </div>

                {/* Center: Grade Tracker */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grade tracker</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-secondary)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Màxim:</span>
                            <NumericInput
                                value={targetMaxScore}
                                onChange={(v) => { if (v !== undefined) onUpdateTargetMaxScore(v); }}
                                style={{ width: '40px', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: 0 }}
                            />
                        </div>
                    </div>
                    {(() => {
                        const totalPossibleReal = gradableExercises.reduce((acc, ex) => acc + (ex.maxScore ?? 10), 0);
                        const currentFactor = totalPossibleReal > 0 ? targetMaxScore / totalPossibleReal : 1;
                        const scaledScore = Math.round(roundedTotalStudentScore * currentFactor * 100) / 100;

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' }}>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>Total: {roundedTotalStudentScore} / {totalPossibleReal} pt</span>
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
                        {/* Experimental Visual Snippet */}
                        {currentStudent?.nameCropUrl && (
                            <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', background: 'white' }}>
                                <img
                                    src={currentStudent.nameCropUrl}
                                    alt="Nom retallat"
                                    style={{ height: '36px', width: 'auto', display: 'block' }}
                                    title={`OCR: ${currentStudent.originalOcrName || (currentStudent.name.split(' (')[0])}`}
                                />
                                {currentStudent.originalOcrName && currentStudent.originalOcrName !== (currentStudent.name.split(' (')[0]) && (
                                    <div
                                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center' }}
                                        title={`OCR original: ${currentStudent.originalOcrName}`}
                                    >
                                        OCR?
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Alumne</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>{studentIdx + 1} / {students.length}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button className="btn-icon" onClick={() => onUpdateStudentIdx(Math.max(0, studentIdx - 1))} disabled={studentIdx === 0}>
                                <ChevronLeft />
                            </button>
                            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                <select
                                    value={studentIdx}
                                    onChange={(e) => onUpdateStudentIdx(Number(e.target.value))}
                                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.85rem', maxWidth: '200px' }}
                                >
                                    {students.map((st, i) => {
                                        // Clean up names that might contain (ID...)
                                        const cleanName = st.name.split(' (')[0] || `Alumne ${i + 1}`;
                                        return (
                                            <option key={st.id} value={i}>
                                                {cleanName}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <button className="btn-icon" onClick={() => onUpdateStudentIdx(Math.min(students.length - 1, studentIdx + 1))} disabled={studentIdx === students.length - 1}>
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
                                const totalPossible = gradableExercises.reduce((acc: number, ex: ExerciseDef) => acc + (ex.maxScore ?? 10), 0);
                                const currentFactor = totalPossible > 0 ? targetMaxScore / totalPossible : 1;
                                try {
                                    await exportAnnotatedPDF({
                                        pdfDoc, students, exercises, annotations, rubricCounts,
                                        scope: 'all',
                                        currentStudentIdx: studentIdx,
                                        scaleFactor: currentFactor,
                                        onProgress: (d: number, t: number) => setExportProgress({ done: d, total: t })
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
                                const totalPossible = gradableExercises.reduce((acc: number, ex: ExerciseDef) => acc + (ex.maxScore ?? 10), 0);
                                const currentFactor = totalPossible > 0 ? targetMaxScore / totalPossible : 1;
                                try {
                                    await exportOriginalLayoutPDF({
                                        pdfDoc, students, exercises, annotations, rubricCounts,
                                        scope: 'current',
                                        currentStudentIdx: studentIdx,
                                        scaleFactor: currentFactor,
                                        onProgress: (d: number, t: number) => setExportProgress({ done: d, total: t })
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
                                        onProgress: (d: number, t: number) => setExportProgress({ done: d, total: t })
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

                        {onFinish && (
                            <button
                                onClick={onFinish}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    padding: '0.4rem 0.75rem', borderRadius: '0.5rem',
                                    background: 'var(--success)',
                                    color: 'white', border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem', fontWeight: 700,
                                    marginLeft: '0.5rem',
                                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)'
                                }}
                                title="Finalitzar i enviar notes per correu"
                            >
                                <Send size={14} />
                                Finalitzar i Enviar
                            </button>
                        )}

                        <button
                            onClick={onToggleTheme}
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
                <div className="tool-sidebar" style={{ width: '6rem', background: 'var(--bg-secondary)', borderRight: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', alignContent: 'start', justifyItems: 'center', padding: '1rem 0.5rem', gap: '0.5rem', flexShrink: 0, overflowY: 'auto', minHeight: 0 }}>
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
                        { id: 'eraser' as ToolType, icon: <Trash2 size={18} />, label: 'X', title: 'Goma (X)', onClick: () => { setTool('eraser'); setSelectedId(null); } },
                        { id: 'text' as ToolType, icon: <Type size={18} />, label: 'T', title: 'Text (T)', onClick: () => { setTool('text'); setSelectedId(null); } },
                        { id: 'highlighter' as ToolType, icon: <Highlighter size={18} />, label: 'H', title: 'Destacador (H)', onClick: () => { setTool('highlighter'); setActivePresetId(null); setSelectedId(null); } },
                    ].map(btn => (
                        <button key={btn.id} className={`btn-icon ${tool === btn.id ? 'active' : ''}`}
                            onClick={btn.onClick} title={btn.title}
                            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '6px 4px', width: '100%', gridColumn: (btn.id === 'highlighter' || btn.id === 'eraser') ? 'span 1' : 'span 1' }}>
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
                                    onClick={() => {
                                        if (tool === 'highlighter') {
                                            const r = parseInt(presetColor.slice(1, 3), 16);
                                            const g = parseInt(presetColor.slice(3, 5), 16);
                                            const b = parseInt(presetColor.slice(5, 7), 16);
                                            setHighlighterColor(`rgba(${r}, ${g}, ${b}, 0.4)`);
                                        } else {
                                            setPenColor(presetColor as PenColor);
                                            setTool('pen');
                                        }
                                    }}
                                    style={{
                                        width: '24px', height: '24px', borderRadius: '50%', background: presetColor,
                                        border: (tool === 'pen' && penColor === presetColor) || (tool === 'highlighter' && highlighterColor.includes(presetColor.toLowerCase())) ? '2px solid var(--text-primary)' : '2px solid transparent',
                                        cursor: 'pointer',
                                        transition: 'transform 0.1s',
                                        transform: (penColor === presetColor && tool === 'pen') ? 'scale(1.15)' : 'scale(1)',
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

                    {/* Highlight custom color */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Hl</span>
                        <label style={{ position: 'relative', cursor: 'pointer' }} title="Custom highlight color">
                            <div style={{ width: '22px', height: '22px', borderRadius: '4px', background: highlighterColor, border: '2px solid var(--border)', cursor: 'pointer' }} />
                            <input
                                type="color"
                                value={(() => {
                                    if (highlighterColor.startsWith('#')) return highlighterColor;
                                    const m = highlighterColor.match(/\d+/g);
                                    if (m) return '#' + m.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
                                    return '#fde047';
                                })()}
                                onChange={(e) => {
                                    const hex = e.target.value;
                                    const r = parseInt(hex.slice(1, 3), 16);
                                    const g = parseInt(hex.slice(3, 5), 16);
                                    const b = parseInt(hex.slice(5, 7), 16);
                                    setHighlighterColor(`rgba(${r}, ${g}, ${b}, 0.4)`);
                                    setTool('highlighter');
                                    setActivePresetId(null);
                                }}
                                style={{ opacity: 0, position: 'absolute', top: 0, left: 0, width: '22px', height: '22px', cursor: 'pointer' }}
                            />
                        </label>
                    </div>


                    <div style={{ gridColumn: 'span 2', flex: 1 }}></div>

                    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: 'none', paddingTop: '0.8rem', marginTop: '0.5rem', width: '100%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0' }}>
                            <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'center' }}>Mida Text</span>
                            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                                <input type="number" value={commentDefaultSize} onChange={e => setCommentDefaultSize(Number(e.target.value))}
                                    style={{ width: '40px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 4px', fontSize: '0.75rem', textAlign: 'center' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0' }}>
                            <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'center' }}>Mida Nota</span>
                            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                                <input type="number" value={scoreStampSize} onChange={e => setScoreStampSize(Number(e.target.value))}
                                    style={{ width: '40px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 4px', fontSize: '0.75rem', textAlign: 'center' }} />
                            </div>
                        </div>
                        <button
                            onClick={() => { showConfirm('Eliminar anotacions', 'Vols eliminar TOTES les anotacions d\'aquest exercici?', () => { updateAnnotationsWithHistory([]); setSelectedId(null); }); }}
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
                            <>
                                <div
                                    className="canvas-container"
                                    style={{ width: '100%', flex: 1, minHeight: 0, position: 'relative', margin: 0, boxShadow: 'none', background: 'transparent', cursor: pendingStampComment ? 'crosshair' : (tool === 'select' ? 'default' : 'crosshair') }}
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
                                        preventDefault={true}
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
                                        style={{ cursor: tool === 'pen' ? 'crosshair' : tool === 'eraser' ? 'cell' : tool === 'highlighter' ? 'text' : tool === 'text' ? 'text' : tool === 'select' ? 'grab' : 'default' }}
                                    >
                                        <Layer key={`${currentStudent.id}_${currentExercise.id}`}>
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
                                                    strokeWidth={1 / baseScale}
                                                    dash={[15 / baseScale, 10 / baseScale]} opacity={0.6}
                                                    listening={false}
                                                />
                                            )}
                                            {currentAnnotations.filter(a => a.id !== 'system_score_stamp').map((ann) => {
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
                                                                strokeWidth={(ann.strokeWidth || 2) / baseScale}
                                                                lineCap="round"
                                                                lineJoin="round"
                                                                tension={0.5}
                                                                opacity={ann.opacity ?? 1}
                                                                hitStrokeWidth={10 / baseScale}
                                                            />
                                                            {isSelected && (
                                                                <Rect
                                                                    x={minX - 4 / baseScale} y={minY - 4 / baseScale}
                                                                    width={(maxX - minX) + 8 / baseScale} height={(maxY - minY) + 8 / baseScale}
                                                                    stroke="#6366f1"
                                                                    strokeWidth={1 / baseScale}
                                                                    dash={[4 / baseScale, 4 / baseScale]}
                                                                    strokeScaleEnabled={true}
                                                                    listening={false}
                                                                />
                                                            )}
                                                        </Group>
                                                    );
                                                } else if (ann.type === 'highlighter') {
                                                    const annFontSize = (ann.fontSize || commentDefaultSize) * FONT_SCALE;
                                                    const labelColor = ann.color.startsWith('rgba')
                                                        ? ann.color.replace(/[\d.]+\)$/, '1.0)')
                                                        : ann.color;

                                                    const labelX = (ann.labelOffsetX ?? 2);
                                                    const labelY = (ann.labelOffsetY ?? -(annFontSize + 4));

                                                    return (
                                                        <Group
                                                            key={ann.id}
                                                            id={ann.id}
                                                            name="highlighter-group"
                                                            x={ann.x}
                                                            y={ann.y}
                                                            width={ann.width || 100}
                                                            height={ann.height || 30}
                                                            draggable={tool === 'select' && isSelected}
                                                            onClick={handleSelect}
                                                            onTap={handleSelect}
                                                            onDragEnd={(e) => handleDragEnd(e, ann.id)}
                                                            onTransform={handleTransform}
                                                            onTransformEnd={(e) => handleTransformEnd(e, ann.id)}
                                                        >
                                                            <Rect
                                                                width={ann.width}
                                                                height={ann.height}
                                                                fill={ann.color}
                                                                stroke={isSelected ? 'var(--accent)' : undefined}
                                                                strokeWidth={isSelected ? 1 / baseScale : 0}
                                                            />{highlighterLabelMode === 'individual' && (ann.label || ann.points !== undefined) && (
                                                                <Text
                                                                    x={labelX}
                                                                    y={labelY}
                                                                    text={[
                                                                        ann.label || '',
                                                                        ann.points !== undefined ? formatScaledPoints(ann.points) : ''
                                                                    ].filter(Boolean).join(' ')}
                                                                    fill={labelColor}
                                                                    fontSize={annFontSize}
                                                                    fontFamily="Caveat"
                                                                    fontStyle="800"
                                                                    letterSpacing={0.5}
                                                                    align="left"
                                                                    draggable={tool === 'select' && isSelected}
                                                                    onDragEnd={(e) => {
                                                                        e.cancelBubble = true; // Stop group from dragging
                                                                        const newAnns = currentAnnotations.map(a =>
                                                                            a.id === ann.id ? {
                                                                                ...(a as HighlighterAnnotation),
                                                                                labelOffsetX: e.target.x(),
                                                                                labelOffsetY: e.target.y()
                                                                            } : a
                                                                        );
                                                                        onUpdateAnnotations(students[studentIdx].id, currentExercise.id, newAnns);
                                                                    }}
                                                                />
                                                            )}
                                                        </Group>
                                                    );
                                                } else if (ann.type === 'highlighter_legend') {
                                                    if (highlighterLabelMode !== 'legend') return null;
                                                    const usedPresetIds = new Set(currentAnnotations
                                                        .filter((a): a is HighlighterAnnotation => a.type === 'highlighter' && !!a.presetId)
                                                        .map(a => a.presetId));
                                                    const usedPresets = presets.filter(p => usedPresetIds.has(p.id));
                                                    if (usedPresets.length === 0) return null;

                                                    const legendFontSize = 14 * FONT_SCALE;
                                                    const padding = 10;
                                                    const itemHeight = legendFontSize + 10;

                                                    return (
                                                        <Group
                                                            key={ann.id}
                                                            id={ann.id}
                                                            x={ann.x}
                                                            y={ann.y}
                                                            scaleX={ann.scale || 1}
                                                            scaleY={ann.scale || 1}
                                                            draggable={tool === 'select' && isSelected}
                                                            onClick={handleSelect}
                                                            onTap={handleSelect}
                                                            onDragEnd={(e) => handleDragEnd(e, ann.id)}
                                                            onTransformEnd={(e) => handleTransformEnd(e, ann.id)}
                                                        >
                                                            {/* Clean selection indicator only when selected */}
                                                            {isSelected && (
                                                                <Rect
                                                                    width={250 / baseScale}
                                                                    height={(usedPresets.length * itemHeight + padding) / baseScale}
                                                                    stroke="#6366f1"
                                                                    strokeWidth={1 / baseScale}
                                                                    dash={[5 / baseScale, 5 / baseScale]}
                                                                />)}
                                                            {usedPresets.map((p, pi) => (
                                                                <Group key={p.id} y={pi * itemHeight}>
                                                                    <Rect
                                                                        width={legendFontSize}
                                                                        height={legendFontSize}
                                                                        fill={p.color}
                                                                        cornerRadius={2}
                                                                        opacity={0.8}
                                                                    />
                                                                    <Text
                                                                        x={legendFontSize + 12}
                                                                        y={2}
                                                                        text={p.label}
                                                                        fontSize={legendFontSize * 0.9}
                                                                        fill="var(--text-primary)"
                                                                        fontFamily="Caveat"
                                                                        fontStyle="bold"
                                                                    />
                                                                </Group>
                                                            ))}
                                                        </Group>
                                                    );
                                                } else if (ann.type === 'text') {
                                                    if (editingTextNode?.id === ann.id) return null;

                                                    const currentFontSize = (ann.fontSize || commentDefaultSize) * FONT_SCALE;
                                                    return (
                                                        <Group
                                                            key={ann.id}
                                                            id={ann.id}
                                                            name="text-group"
                                                            x={ann.x} y={ann.y}
                                                            width={ann.width || ((ann.text.length * (currentFontSize * 0.6)) + 8)}
                                                            height={ann.height || (currentFontSize + 8)}
                                                            draggable={tool === 'select' && isSelected}
                                                            onClick={handleSelect}
                                                            onTap={handleSelect}
                                                            onDblClick={handleDbClickText}
                                                            onDblTap={handleDbClickText}
                                                            onDragEnd={(e) => handleDragEnd(e, ann.id)}
                                                            onTransform={handleTransform}
                                                            onTransformEnd={(e) => handleTransformEnd(e, ann.id)}
                                                        >
                                                            <Text
                                                                text={ann.text}
                                                                fill={ann.color}
                                                                fontSize={currentFontSize}
                                                                fontFamily="Caveat"
                                                                width={ann.width || undefined}
                                                                wrap="word"
                                                            />
                                                            {ann.score !== undefined && (
                                                                <Text
                                                                    x={0}
                                                                    y={-(currentFontSize * 0.7)}
                                                                    text={formatScaledPoints(ann.score)}
                                                                    fill={ann.color}
                                                                    fontSize={currentFontSize * 0.65}
                                                                    fontFamily="'Caveat', cursive"
                                                                    fontStyle="bold"
                                                                />
                                                            )}
                                                            {isSelected && (
                                                                <Rect
                                                                    x={-4} y={-4}
                                                                    width={(ann.width || (ann.text.length * (currentFontSize * 0.6))) + 8}
                                                                    height={(ann.height || currentFontSize) + 8}
                                                                    stroke="#6366f1" dash={[4, 4]} strokeWidth={1} fill="transparent"
                                                                />
                                                            )}
                                                        </Group>
                                                    );
                                                } else if (ann.type === 'image') {
                                                    const img = new Image();
                                                    img.src = ann.dataUrl;
                                                    return (
                                                        <Group
                                                            key={ann.id}
                                                            id={ann.id}
                                                            x={ann.x} y={ann.y}
                                                            draggable={tool === 'select' && isSelected}
                                                            onClick={handleSelect}
                                                            onTap={handleSelect}
                                                            onDragEnd={(e) => handleDragEnd(e, ann.id)}
                                                            onTransformEnd={(e) => handleTransformEnd(e, ann.id)}
                                                        >
                                                            <KonvaImage image={img} width={ann.width} height={ann.height} />
                                                            {isSelected && (
                                                                <Rect width={ann.width} height={ann.height} stroke="var(--accent)" dash={[5 / baseScale, 5 / baseScale]} strokeWidth={1 / baseScale} />
                                                            )}
                                                        </Group>
                                                    );
                                                }
                                                return null;
                                            })}
                                            {selectedId && !editingTextNode && (
                                                <Transformer
                                                    ref={transformerRef}
                                                    rotateEnabled={false}
                                                    borderStroke="#6366f1"
                                                    borderStrokeWidth={1 / baseScale}
                                                    anchorFill="white"
                                                    anchorStroke="#6366f1"
                                                    anchorStrokeWidth={1.5 / baseScale}
                                                    anchorSize={5 / baseScale}
                                                    anchorCornerRadius={1 / baseScale}
                                                    padding={5 / baseScale}
                                                    enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
                                                />
                                            )}
                                            {scoreStampData && (
                                                <Group
                                                    id="system_score_stamp"
                                                    name="stamp-group"
                                                    key={`stamp_${currentExercise.id}_${currentStudent.id}`}
                                                    x={scoreStampData.x}
                                                    y={scoreStampData.y}
                                                    width={500}
                                                    height={scoreStampData.height}
                                                    scaleX={scoreStampData.scale}
                                                    scaleY={scoreStampData.scale}
                                                    draggable={tool === 'select' && selectedId === 'system_score_stamp'}
                                                    onClick={(e) => {
                                                        if (tool === 'select') {
                                                            e.cancelBubble = true;
                                                            setSelectedId('system_score_stamp');
                                                        }
                                                    }}
                                                    onTap={(e) => {
                                                        if (tool === 'select') {
                                                            e.cancelBubble = true;
                                                            setSelectedId('system_score_stamp');
                                                        }
                                                    }}
                                                    onDragEnd={(e) => {
                                                        const node = e.target;
                                                        setPendingStampChange({
                                                            x: node.x(),
                                                            y: node.y(),
                                                            scale: node.scaleX()
                                                        });
                                                    }}
                                                    onTransformEnd={(e) => {
                                                        const node = e.target;
                                                        const scaleX = node.scaleX();
                                                        node.scaleX(1);
                                                        node.scaleY(1);
                                                        setPendingStampChange({
                                                            x: node.x(),
                                                            y: node.y(),
                                                            scale: scaleX
                                                        });
                                                    }}
                                                >
                                                    <Text
                                                        text={`Nota: ${scoreStampData.scaledExScore} / ${Math.round(scoreStampData.scaledExMax * 100) / 100}`}
                                                        fontSize={scoreStampSize * 1.5}
                                                        fontFamily="'Caveat', cursive"
                                                        fontStyle="bold"
                                                        fill={(scoreStampData.scaledExScore >= (scoreStampData.scaledExMax / 2)) ? '#10b981' : '#ef4444'}
                                                        align="left"
                                                        width={500}
                                                        wrap="word"
                                                    />
                                                    {scoreStampData.lines.length > 0 && (
                                                        <Text
                                                            y={scoreStampSize * 1.7}
                                                            text={scoreStampData.lines.join('\n')}
                                                            fontSize={scoreStampSize * 0.75}
                                                            fontFamily="'Caveat', cursive"
                                                            fill="rgba(0,0,0,0.6)"
                                                            align="left"
                                                            width={500}
                                                            wrap="word"
                                                        />
                                                    )}
                                                    {selectedId === 'system_score_stamp' && (
                                                        <Rect
                                                            x={-4} y={-4}
                                                            width={500 + 8}
                                                            height={scoreStampData.height + 8}
                                                            stroke="#6366f1" dash={[4, 4]} strokeWidth={1} fill="transparent"
                                                        />
                                                    )}
                                                </Group>
                                            )}
                                            {/* Editing Text Bounding Box during draw */}
                                            {isDrawing && tool === 'text' && editingTextNode && (
                                                <Rect
                                                    x={editingTextNode.x}
                                                    y={editingTextNode.y}
                                                    width={editingTextNode.width}
                                                    height={editingTextNode.height}
                                                    stroke="var(--accent)"
                                                    dash={[5 / stageScale, 5 / stageScale]}
                                                    strokeWidth={2}
                                                />
                                            )}
                                        </Layer>
                                    </Stage>

                                    {/* HTML Overlay for Text Editing */}
                                    {editingTextNode && !isDrawing && (
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
                                                width: editingTextNode.width ? (editingTextNode.width * stageScale) : '200px',
                                                height: editingTextNode.height ? (editingTextNode.height * stageScale) : '60px',
                                                margin: 0,
                                                padding: 0,
                                                border: '1px dashed var(--accent)',
                                                background: 'transparent',
                                                outline: 'none',
                                                resize: 'none',
                                                overflow: 'hidden',
                                                color: defaultTextColor,
                                                fontSize: `${(activePresetId ? 18 : commentDefaultSize) * FONT_SCALE * stageScale}px`,
                                                fontFamily: 'Caveat',
                                                fontWeight: 800,
                                                lineHeight: 1.0,
                                                zIndex: 10
                                            }}
                                        />
                                    )}
                                </div>

                                {/* Floating Zoom Controls - Bottom Center */}
                                <div className="glass-zoom" style={{
                                    position: 'absolute', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 100,
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.4rem 1.25rem', borderRadius: '2.5rem',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                                    pointerEvents: 'auto'
                                }}>
                                    <button
                                        className="btn-icon"
                                        style={{ padding: '4px', opacity: 0.8 }}
                                        onClick={() => applyZoom(stageScale / 1.2)}
                                        title="Allunyar (-)"
                                    >
                                        <Minus size={18} />
                                    </button>

                                    <input
                                        type="range"
                                        min="0.1"
                                        max="5"
                                        step="0.1"
                                        value={stageScale}
                                        onChange={(e) => applyZoom(parseFloat(e.target.value))}
                                        style={{
                                            width: '140px', height: '4px', cursor: 'pointer',
                                            accentColor: 'var(--accent)'
                                        }}
                                    />

                                    <button
                                        className="btn-icon"
                                        style={{ color: 'white', padding: '4px', opacity: 0.8 }}
                                        onClick={() => applyZoom(stageScale * 1.2)}
                                        title="Apropar (+)"
                                    >
                                        <Plus size={18} />
                                    </button>

                                    <div style={{ borderLeft: '1px solid var(--border)', height: '24px', marginLeft: '0.5rem', paddingLeft: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, minWidth: '45px', textAlign: 'center' }}>
                                            {Math.round(stageScale * 100)}%
                                        </span>

                                        <button
                                            className="btn-icon"
                                            style={{ opacity: 0.7 }}
                                            title="Ajustar a la pàgina"
                                            onClick={() => {
                                                if (renderedPages.length > 0 && containerRef.current) {
                                                    const totalWidth = ((currentExercise.type === 'pages' && (currentExercise as any).spansTwoPages && renderedPages.length > 1)
                                                        ? renderedPages[0].width + (renderedPages[1].width || 0) + 20
                                                        : Math.max(...renderedPages.map(p => p.width)));
                                                    const totalHeight = Math.max(...renderedPages.map(p => p.yOffset + p.height));

                                                    const containerWidth = containerRef.current.clientWidth;
                                                    const containerHeight = containerRef.current.clientHeight;

                                                    const padding = 40;
                                                    const targetScaleX = (containerWidth - padding) / totalWidth;
                                                    const targetScaleY = (containerHeight - padding) / totalHeight;
                                                    const targetScale = Math.min(targetScaleX, targetScaleY, 1.2);

                                                    setStageScale(targetScale);
                                                    setBaseScale(targetScale);
                                                    setStagePos({
                                                        x: (containerWidth - (totalWidth * targetScale)) / 2,
                                                        y: Math.max(20, (containerHeight - (totalHeight * targetScale)) / 2)
                                                    });
                                                }
                                            }}
                                        >
                                            <RefreshCw size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Floating Toggle Comments - Bottom Left */}
                                <div
                                    onClick={() => setIsCommentBankExpanded(!isCommentBankExpanded)}
                                    style={{
                                        position: 'absolute',
                                        bottom: '1.5rem',
                                        left: '1.5rem',
                                        zIndex: 400,
                                        background: isCommentBankExpanded ? 'var(--bg-secondary)' : 'var(--accent)',
                                        border: '1px solid var(--border)',
                                        padding: '0.4rem 1rem',
                                        borderRadius: '2rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        color: isCommentBankExpanded ? 'var(--text-secondary)' : 'white',
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                                        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                                        pointerEvents: 'auto'
                                    }}
                                >
                                    {isCommentBankExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                    <span>{isCommentBankExpanded ? 'AMAGA COMENTARIS' : 'MOSTRA COMENTARIS'}</span>
                                </div>
                            </>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.5rem', padding: '2rem', textAlign: 'center' }}>
                                <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--border)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxWidth: '400px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                                        {isPageLoading ? (
                                            <Loader2 size={48} className="animate-spin" color="var(--accent)" />
                                        ) : (
                                            <AlertTriangle size={48} color="var(--danger)" />
                                        )}
                                    </div>
                                    <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontSize: '1.2rem', fontWeight: 700 }}>
                                        {isPageLoading ? "Carregant exercici..." : "No es pot carregar l'exercici"}
                                    </h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                        {currentStudent.pageIndexes.length === 0
                                            ? "Aquest alumne no té cap pàgina de PDF assignada."
                                            : `L'exercici requereix pàgines d'alumne que no estan disponibles. Pàgines de l'alumne: [${currentStudent.pageIndexes.join(', ')}].`}
                                    </p>
                                    <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>

                                        <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Detalls tècnics:</div>

                                        <div>Tipus exercici: <strong>{currentExercise.type}</strong></div>
                                        {currentExercise.type === 'pages' ? (
                                            <div>Pàgines requerides: <strong>{(currentExercise as any).pageIndexes.map((p: number) => p + 1).join(', ')}</strong></div>
                                        ) : (
                                            <div>Pàgina requerida: <strong>{(currentExercise as any).pageIndex + 1}</strong></div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button className="btn btn-secondary" onClick={onBack}>Tornar a Configuració</button>
                                    <button className="btn btn-primary" onClick={() => onUpdateStudentIdx((studentIdx + 1) % students.length)}>Provar següent alumne</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Comment Bar (Inside Center Column so Sidebars reach bottom) */}
                    <div className="bottom-comment-bank" style={{
                        height: isCommentBankExpanded ? `${commentBankHeight}px` : '0px',
                        background: 'var(--bg-secondary)',
                        padding: isCommentBankExpanded ? '0.4rem 0.75rem' : '0',
                        display: 'flex',
                        gap: '0.75rem',
                        flexShrink: 0,
                        position: 'relative',
                        zIndex: 200,
                        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                        overflow: isCommentBankExpanded ? 'visible' : 'hidden',
                        borderTop: isCommentBankExpanded ? '1px solid var(--border)' : 'none'
                    }}>

                        {/* Resize handle */}
                        {isCommentBankExpanded && (
                            <div
                                onMouseDown={startResizing}
                                style={{
                                    position: 'absolute', top: '-3px', left: 0, right: 0, height: '6px',
                                    cursor: 'ns-resize', zIndex: 30, display: 'flex', justifyContent: 'center'
                                }}
                            >
                                <div style={{ width: '32px', height: '3px', background: 'var(--border)', borderRadius: '2px', marginTop: '2px', opacity: 0.5 }} />
                            </div>
                        )}
                        {/* Left: Comment Bank Sections (Now Horizontal) */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: '1rem', overflowY: 'hidden', paddingRight: '0.5rem' }}>
                            {/* Generals */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5, paddingBottom: '2px' }}>
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
                                                <button onClick={(e) => { e.stopPropagation(); onUpdateCommentBank(commentBank.filter((_, i) => i !== idx)); if (isEditing) setEditingBankComment(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.4, fontSize: '1rem', marginLeft: '4px' }}>×</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Vertical Divider */}
                            <div style={{ width: '1px', background: 'var(--border)', height: '80%', alignSelf: 'center', opacity: 0.5 }} />

                            {/* Per Exercici */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 5, paddingBottom: '2px' }}>
                                    <div style={{ width: '3px', height: '9px', background: '#f59e0b', borderRadius: '1px' }} />
                                    <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ex. {exerciseIdx + 1}</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', paddingBottom: '0.5rem' }}>
                                    {commentBank.map((comment, idx) => {
                                        if (comment.exerciseId !== currentExercise.id) return null;
                                        const isSelectedStamp = pendingStampComment === comment;
                                        const isEditing = editingBankComment === idx;
                                        const bgColor = isEditing
                                            ? (isDarkMode ? '#451a03' : '#fef3c7')
                                            : isSelectedStamp
                                                ? 'rgba(99, 102, 241, 0.25)'
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
                                            : isSelectedStamp
                                                ? 'rgba(99, 102, 241, 0.8)'
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
                                            : isSelectedStamp
                                                ? (isDarkMode ? '#818cf8' : '#4f46e5')
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
                                                    cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
                                                    color: textColor,
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: isSelectedStamp ? '0 0 0 2px rgba(99,102,241,0.3)' : '0 1px 2px rgba(0,0,0,0.02)', userSelect: 'none',
                                                    transform: (isEditing || isSelectedStamp) ? 'scale(1.05)' : 'none'
                                                }}
                                                onClick={() => {
                                                    if (pendingStampComment === comment) {
                                                        setPendingStampComment(null);
                                                    } else {
                                                        setPendingStampComment(comment);
                                                    }
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
                                                <button onClick={(e) => { e.stopPropagation(); onUpdateCommentBank(commentBank.filter((_, i) => i !== idx)); if (isEditing) setEditingBankComment(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.4, fontSize: '1rem', marginLeft: '4px' }}>×</button>
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
                                                <NumericInput
                                                    placeholder="Pts"
                                                    value={selectedAnn.type === 'text' ? ((selectedAnn as TextAnnotation).score ?? undefined) : (selectedAnn.type === 'highlighter' ? ((selectedAnn as HighlighterAnnotation).points ?? undefined) : undefined)}
                                                    onChange={val => {
                                                        updateAnnotationsWithHistory(currentAnnotations.map(a =>
                                                            a.id === selectedId ? (a.type === 'text' ? { ...a, score: val } : (a.type === 'highlighter' ? { ...a, points: val } : a)) : a
                                                        ));
                                                    }}
                                                    style={{ width: '50px' }}
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
                                                        onUpdateCommentBank(b);
                                                        setEditingBankComment(null);
                                                    } else {
                                                        onUpdateCommentBank([...commentBank, {
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
                                                            onUpdateCommentBank(b);
                                                            setEditingBankComment(null);
                                                        } else {
                                                            onUpdateCommentBank([...commentBank, {
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
                <div className="grading-sidebar" style={{ width: '18rem', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0 }}>

                    {/* Properties for Selected Annotation */}
                    {selectedId && (
                        <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                                    {scaleValue(computedScore)} {currentExercise.scoringMode !== 'from_zero' && currentExercise.maxScore !== undefined && `/ ${scaleValue(currentExercise.maxScore)}`}
                                </span>
                            ) : (
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Sense nota</span>
                            )}
                        </div>

                        {/* Rubric panel — always shown if available, or with 'define' button if empty */}
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
                                                    {formatScaledPoints(item.points)}
                                                    {count > 0 && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> ={formatScaledPoints(contribution)}</span>}
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
                            {/* Summary breakdown */}
                            {currentExercise.rubric && Object.values(currentExRubricCounts).some(v => v > 0) && (
                                <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: 'none', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                    {currentExercise.rubric.filter(item => (currentExRubricCounts[item.id] ?? 0) > 0).map(item => {
                                        const count = currentExRubricCounts[item.id];
                                        const contribution = item.points * count;
                                        return (
                                            <span key={item.id} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                {count}× {item.label} → <strong style={{ color: contribution >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatScaledPoints(contribution)}</strong>
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
                                                        Highlights → <strong style={{ color: colorPoints >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatScaledPoints(colorPoints)}</strong>
                                                    </span>
                                                )}
                                                {textPoints !== 0 && (
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                        Comentaris → <strong style={{ color: textPoints >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatScaledPoints(textPoints)}</strong>
                                                    </span>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => exportOriginalLayoutPDF({ pdfDoc, students, exercises, annotations, rubricCounts, scope: 'current', currentStudentIdx: studentIdx, targetMaxScore })}
                                style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem' }}
                            >
                                <Download size={14} /> PDF ORIGINAL
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => exportAnnotatedPDF({ pdfDoc, students, exercises, annotations, rubricCounts, scope: 'current', currentStudentIdx: studentIdx, targetMaxScore })}
                                style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem' }}
                            >
                                <Download size={14} /> PDF RETALLS
                            </button>
                        </div>
                        <div style={{ marginTop: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>Penalty Highlights</h4>
                                <button
                                    onClick={() => setHighlighterLabelMode(highlighterLabelMode === 'legend' ? 'individual' : 'legend')}
                                    style={{
                                        background: highlighterLabelMode === 'legend' ? 'var(--accent)' : 'transparent',
                                        color: highlighterLabelMode === 'legend' ? 'white' : 'var(--text-secondary)',
                                        border: highlighterLabelMode === 'legend' ? 'none' : '1px solid var(--border)',
                                        borderRadius: '4px', padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                        transition: 'all 0.2s'
                                    }}
                                    title="Toggle Legend Mode"
                                >
                                    <Plus size={10} style={{ transform: highlighterLabelMode === 'legend' ? 'rotate(45deg)' : 'none' }} />
                                    LLEGENDA
                                </button>
                            </div>

                            {/* Highlighter Sections: Generals vs Exercise */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {/* Generals */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem' }}>
                                        <div style={{ width: '3px', height: '9px', background: 'var(--accent)', borderRadius: '1px' }} />
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Generals</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        {presets.filter(p => !p.exerciseId).map(preset => renderPresetHighlighter(preset))}
                                        <button
                                            onClick={() => {
                                                const newPreset: PresetHighlighter = { id: `preset_${Date.now()}`, label: 'Nou Highlight', color: 'rgba(239, 68, 68, 0.4)', points: -0.5 };
                                                onUpdatePresets([...presets, newPreset]);
                                                setEditingPresetId(newPreset.id);
                                                setPresetForm(newPreset);
                                                setTempColor('#ef4444');
                                            }}
                                            style={{ marginTop: '0.4rem', background: 'none', border: '1px dashed var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.65rem', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                        >
                                            <Plus size={10} /> Afegir General
                                        </button>
                                    </div>
                                </div>

                                {/* Per Exercici */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem' }}>
                                        <div style={{ width: '3px', height: '9px', background: '#f59e0b', borderRadius: '1px' }} />
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ex. {exerciseIdx + 1}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        {presets.filter(p => p.exerciseId === currentExercise.id).map(preset => renderPresetHighlighter(preset))}
                                        <button
                                            onClick={() => {
                                                const newPreset: PresetHighlighter = { id: `preset_${Date.now()}`, label: 'Highlight Exercici', color: 'rgba(239, 68, 68, 0.4)', points: -0.5, exerciseId: currentExercise.id };
                                                onUpdatePresets([...presets, newPreset]);
                                                setEditingPresetId(newPreset.id);
                                                setPresetForm(newPreset);
                                                setTempColor('#ef4444');
                                            }}
                                            style={{ marginTop: '0.4rem', background: 'none', border: '1px dashed var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.65rem', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                        >
                                            <Plus size={10} /> Afegir a l'Ex. {exerciseIdx + 1}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
