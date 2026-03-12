import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group, Text, Transformer } from 'react-konva';
import { ChevronLeft, ChevronRight, Check, Trash2, MousePointer2, Square, Plus, Award, TextSelect, Sun, Moon, LogOut, RefreshCw, X, Pencil, FileText } from 'lucide-react';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas } from '../utils/pdfUtils';
import type { ExerciseDef, CropExercise, PagesExercise, RubricItem } from '../types';
import FlowGradingLogo from './FlowGradingLogo';
import HandwrittenTitle from './HandwrittenTitle';

interface Props {
    pdfDoc: PDFDocumentProxy;
    pagesPerExam: number;
    initialExercises: ExerciseDef[];
    currentFileName: string | null;
    sessionAlias: string | null;
    onUpdateSessionAlias: (alias: string | null) => void;
    onComplete: (crops: ExerciseDef[]) => void;
    onBack?: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    accessToken: string | null;
    userEmail: string | null;
    userPicture: string | null;
    onAuthorize: () => void;
    onLogout: () => void;
    onRunOCR: () => void;
    ocrCompleted: boolean;
    showAlert: (title: string, message: string) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void) => void;
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

export default function TemplateDefiner({ 
    pdfDoc, pagesPerExam, initialExercises, 
    currentFileName, sessionAlias, onUpdateSessionAlias,
    onComplete, onBack, theme, onToggleTheme,
    accessToken, userEmail, userPicture, onAuthorize, onLogout, onRunOCR, ocrCompleted,
    showAlert, showConfirm
}: Props) {
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [stageScale, setStageScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [exercises, setExercises] = useState<ExerciseDef[]>(initialExercises);
    const [lastAddedId, setLastAddedId] = useState<string | null>(null);

    // Drawing state
    const [isDrawing, setIsDrawing] = useState(false);
    const [newCropRef, setNewCropRef] = useState<Partial<CropExercise> | null>(null);
    const [mode, setMode] = useState<'select' | 'draw' | 'draw_pages' | 'draw_ocr' | 'draw_total_score'>('select');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isEditingHeaderAlias, setIsEditingHeaderAlias] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const stageRef = useRef<any>(null);
    const lastDistRef = useRef<number>(0);

    const isDarkMode = theme === 'dark';

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
            const dimensions = await renderPDFPageToCanvas(pdfDoc, currentPageIndex + 1, canvas, 2.5, isDarkMode);

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
        setTimeout(loadPage, 100);
    }, [currentPageIndex, pdfDoc, isDarkMode]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            
            const key = e.key.toLowerCase();
            if (key === 'v') setMode('select');
            if (key === 'r') setMode('draw');
            if (key === 'p') setMode('draw_pages');
            if (key === 'n') setMode('draw_ocr');
            if (key === 's') setMode('draw_total_score');

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
                showConfirm('Eliminar exercici', 'Vols eliminar aquest exercici?', () => {
                    setExercises(prev => prev.filter(ex => ex.id !== selectedId));
                    setSelectedId(null);
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, showConfirm]);

    const handleMouseDown = (e: any) => {
        if (mode === 'select') return;
        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const x = (pos.x - stage.x()) / stageScale;
        const y = (pos.y - stage.y()) / stageScale;

        setIsDrawing(true);
        setNewCropRef({ x, y, width: 0, height: 0, pageIndex: currentPageIndex });
    };

    const handleMouseMove = (e: any) => {
        if (!isDrawing || !newCropRef || mode === 'select') return;
        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        const currentX = (pos.x - stage.x()) / stageScale;
        const currentY = (pos.y - stage.y()) / stageScale;

        setNewCropRef(prev => ({ ...prev, width: currentX - (prev?.x || 0), height: currentY - (prev?.y || 0) }));
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

    const handleTouchEnd = () => {
        lastDistRef.current = 0;
        handleMouseUp();
    };

    const handleMouseUp = () => {
        if (isDrawing && newCropRef && mode !== 'select') {
            let { x, y, width, height } = newCropRef as any;
            if (width < 0) { x += width; width = Math.abs(width); }
            if (height < 0) { y += height; height = Math.abs(height); }
            if (bgImage) {
                if (x < 0) { width += x; x = 0; }
                if (y < 0) { height += y; y = 0; }
                if (x + width > bgImage.width) width = bgImage.width - x;
                if (y + height > bgImage.height) height = bgImage.height - y;
            }
            if (width > 20 && height > 20) {
                const finalType = mode === 'draw' ? 'crop' : mode === 'draw_ocr' ? 'ocr_name' : 'total_score';
                const newId = `ex_${Date.now()}`;
                const finalCrop: any = { 
                    id: newId, 
                    type: finalType, 
                    pageIndex: currentPageIndex, 
                    x, y, width, height,
                    scoringMode: 'from_zero', // Default to rubric mode starting from zero
                    rubric: []
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

    const updateExerciseMeta = (id: string, updates: Partial<ExerciseDef>) => {
        setExercises(prev => prev.map(ex => ex.id === id ? { ...ex, ...updates } as ExerciseDef : ex));
    };

    const addRubricItem = (exId: string) => {
        setExercises(prev => prev.map(ex => {
            if (ex.id === exId) {
                const items = ex.rubric || [];
                return { ...ex, rubric: [...items, { id: `r_${Date.now()}`, label: '', points: 0 }] };
            }
            return ex;
        }));
    };

    const updateRubricItem = (exId: string, itemId: string, updates: Partial<RubricItem>) => {
        setExercises(prev => prev.map(ex => {
            if (ex.id === exId) {
                const items = (ex.rubric || []).map(item => item.id === itemId ? { ...item, ...updates } : item);
                return { ...ex, rubric: items };
            }
            return ex;
        }));
    };

    const removeRubricItem = (exId: string, itemId: string) => {
        setExercises(prev => prev.map(ex => {
            if (ex.id === exId) {
                return { ...ex, rubric: (ex.rubric || []).filter(i => i.id !== itemId) };
            }
            return ex;
        }));
    };

    const currentPageRegions = exercises.filter(c => c.type !== 'pages' && c.pageIndex === currentPageIndex) as any[];

    const getRegionStyle = (type: string) => {
        switch (type) {
            case 'qr_code': return { fill: 'rgba(16, 185, 129, 0.2)', stroke: '#10b981', label: 'Àrea QR' };
            case 'ocr_name': return { fill: 'rgba(234, 179, 8, 0.2)', stroke: '#eab308', label: 'Nom OCR' };
            case 'total_score': return { fill: 'rgba(239, 68, 68, 0.2)', stroke: '#ef4444', label: 'Nota final' };
            default: return { fill: 'rgba(96, 165, 250, 0.2)', stroke: '#60a5fa', label: 'Retall ex' };
        }
    };

    return (
        <div style={{ display: 'flex', width: '100%', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            {/* Unified Header */}
            <header className="header" style={{ flexShrink: 0 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                    {onBack && (
                        <button className="btn-icon" onClick={onBack} title="Enrere" style={{ color: 'var(--text-primary)', padding: '0.5rem', background: 'transparent', border: 'none', flexShrink: 0 }}>
                            <ChevronLeft size={28} />
                        </button>
                    )}
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
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                    <FlowGradingLogo size="2.2rem" animate={false} />
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '1.25rem', alignItems: 'center' }}>
                    <button onClick={onToggleTheme} className="btn-icon" title="Tema">
                        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
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
                        <button className="btn-google" onClick={onAuthorize}>
                            <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" style={{ width: '18px' }} />
                            <span style={{ fontWeight: 700 }}>Connecta</span>
                        </button>
                    )}
                    <button 
                        className="btn btn-primary" 
                        onClick={() => (exercises.some(e => e.type === 'crop' || e.type === 'pages')) && onComplete(exercises)}
                        disabled={!exercises.some(e => e.type === 'crop' || e.type === 'pages')}
                        style={{ 
                            opacity: !exercises.some(e => e.type === 'crop' || e.type === 'pages') ? 0.5 : 1,
                            cursor: !exercises.some(e => e.type === 'crop' || e.type === 'pages') ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <Check size={18} /> Finalitzar
                    </button>
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <div className="sidebar" style={{ width: '24rem', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: '1.25rem' }}>
                    <div style={{ paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <HandwrittenTitle size="1.5rem" color="purple" noMargin={true}>Definir plantilla</HandwrittenTitle>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>
                            Pàgina {currentPageIndex + 1} de {pagesPerExam}
                        </p>
                    </div>

                    <div style={{ padding: '1rem 0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                        <button 
                            className={`btn-icon ${mode === 'select' ? 'active' : ''}`} 
                            onClick={() => setMode('select')} 
                            title="Seleccionar / Moure (V)"
                            style={{ width: '100%', height: '40px', borderRadius: '0.5rem', position: 'relative' }}
                        >
                            <MousePointer2 size={20} />
                            <span style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '0.5rem', fontWeight: 900, opacity: 0.5 }}>V</span>
                        </button>
                        <button 
                            className={`btn-icon ${mode === 'draw' ? 'active' : ''}`} 
                            onClick={() => setMode('draw')} 
                            title="Dibuixar zona (R)"
                            style={{ width: '100%', height: '40px', borderRadius: '0.5rem', position: 'relative' }}
                        >
                            <Square size={20} />
                            <span style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '0.5rem', fontWeight: 900, opacity: 0.5 }}>R</span>
                        </button>
                        <button 
                            className={`btn-icon ${mode === 'draw_pages' ? 'active' : ''}`} 
                            onClick={() => {
                                const newId = `ex_page_${Date.now()}`;
                                setExercises(prev => [...prev, {
                                    id: newId,
                                    type: 'pages',
                                    name: 'Pàgina completa',
                                    pageIndexes: [currentPageIndex],
                                    scoringMode: 'from_zero',
                                    rubric: []
                                } as PagesExercise]);
                                setLastAddedId(newId);
                            }} 
                            title="Afegir pàgina completa (P)"
                            style={{ width: '100%', height: '40px', borderRadius: '0.5rem', position: 'relative' }}
                        >
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={20} />
                                <div style={{ 
                                    position: 'absolute', top: '-2px', right: '-2px', 
                                    background: mode === 'draw_pages' ? 'white' : 'var(--accent)', 
                                    color: mode === 'draw_pages' ? 'var(--accent)' : 'white',
                                    borderRadius: '50%', width: '12px', height: '12px', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '10px', fontWeight: 900, border: '1px solid currentColor'
                                }}>+</div>
                            </div>
                            <span style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '0.5rem', fontWeight: 900, opacity: 0.5 }}>P</span>
                        </button>
                        <button 
                            className={`btn-icon ${mode === 'draw_ocr' ? 'active' : ''}`} 
                            onClick={() => setMode('draw_ocr')} 
                            title="Àrea de Nom OCR (N)"
                            style={{ width: '100%', height: '40px', borderRadius: '0.5rem', color: mode === 'draw_ocr' ? '#eab308' : undefined, position: 'relative' }}
                        >
                            <TextSelect size={20} />
                            <span style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '0.5rem', fontWeight: 900, opacity: 0.5 }}>N</span>
                        </button>
                        <button 
                            className={`btn-icon ${mode === 'draw_total_score' ? 'active' : ''}`} 
                            onClick={() => setMode('draw_total_score')} 
                            title="Àrea de Nota Final (S)"
                            style={{ width: '100%', height: '40px', borderRadius: '0.5rem', color: mode === 'draw_total_score' ? '#ef4444' : undefined, position: 'relative' }}
                        >
                            <Award size={20} />
                            <span style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '0.5rem', fontWeight: 900, opacity: 0.5 }}>S</span>
                        </button>
                    </div>

                    <div style={{ padding: '1rem 0', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <section>
                            <HandwrittenTitle size="1.3rem" color="yellow" noMargin={true} style={{ marginBottom: '0.5rem' }}>Regions de control</HandwrittenTitle>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {['ocr_name', 'total_score'].map(type => {
                                    const reg = exercises.find(ex => ex.type === type);
                                    const label = type === 'ocr_name' ? '👤 Àrea del nom' : '📊 Àrea de la nota';
                                    const color = type === 'ocr_name' ? '#eab308' : '#ef4444';
                                    return (
                                        <div key={type} style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: reg ? `${color}10` : 'var(--bg-tertiary)', border: reg ? `1px solid ${color}` : '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: reg ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
                                                {reg && <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>Pàg. {(reg as any).pageIndex + 1}</span>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                {reg && type === 'ocr_name' && (
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
                            <HandwrittenTitle size="1.3rem" color="green" noMargin={true} style={{ marginBottom: '0.5rem' }}>Exercicis corregibles</HandwrittenTitle>
                            {exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages').length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>Cap exercici definit.</p>
                                    {exercises.length > 0 && (
                                        <div style={{ 
                                            fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700, 
                                            background: 'var(--danger-light)', padding: '0.6rem 0.8rem', 
                                            borderRadius: '0.5rem', border: '1px solid var(--danger)',
                                            lineHeight: '1.2', animation: 'pulse 2s infinite'
                                        }}>
                                            Has de marcar com a mínim un exercici (retall o pàgines) per poder continuar.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages').map((ex, idx) => {
                                        const isCurrentPageInvolved = ex.type === 'pages' ? (ex as PagesExercise).pageIndexes.includes(currentPageIndex) : (ex as any).pageIndex === currentPageIndex;
                                        const isSelectedInList = ex.id === selectedId;
                                        return (
                                            <div key={ex.id} onClick={() => { if (ex.type === 'crop') setCurrentPageIndex((ex as any).pageIndex); setSelectedId(ex.id); }} style={{ padding: '0.75rem', background: isSelectedInList ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-tertiary)', borderRadius: '0.75rem', border: isSelectedInList ? '2px solid var(--accent)' : (isCurrentPageInvolved ? '1px solid var(--accent)' : '1px solid var(--border)'), display: 'flex', flexDirection: 'column', gap: '0.75rem', transition: 'all 0.2s ease', cursor: 'pointer' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: ex.type === 'pages' ? 'var(--accent)' : '#6366f1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>{idx + 1}</div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '2px' }}>
                                                            <input ref={(el) => { inputRefs.current[ex.id] = el; }} type="text" value={ex.name || ''} placeholder="Nom exercici" onChange={e => updateExerciseMeta(ex.id, { name: e.target.value })} style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', padding: '2px 0', fontSize: '0.85rem', fontWeight: 700 }} onClick={e => e.stopPropagation()} />
                                                        </div>
                                                    </div>
                                                    <button onClick={(e) => { e.stopPropagation(); removeExercise(ex.id); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)' }}>MÀX:</span>
                                                        <NumericInput value={ex.maxScore} onChange={val => updateExerciseMeta(ex.id, { maxScore: val })} style={{ width: '45px', textAlign: 'center', fontWeight: 800 }} />
                                                    </div>
                                                    
                                                    <div style={{ flex: 1 }}></div>
                                                    
                                                    {/* Segmented Control / Switch for Scoring Mode */}
                                                    <div style={{ display: 'flex', background: 'var(--bg-primary)', borderRadius: '0.5rem', padding: '2px', border: '1px solid var(--border)', height: '28px' }}>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); updateExerciseMeta(ex.id, { scoringMode: 'from_zero' }); }}
                                                            style={{ 
                                                                padding: '0 8px', fontSize: '0.6rem', fontWeight: 800, borderRadius: '0.35rem', border: 'none', cursor: 'pointer',
                                                                background: (ex.scoringMode ?? 'from_max') === 'from_zero' ? 'var(--accent)' : 'transparent',
                                                                color: (ex.scoringMode ?? 'from_max') === 'from_zero' ? 'white' : 'var(--text-secondary)'
                                                            }}
                                                        >0</button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); updateExerciseMeta(ex.id, { scoringMode: 'from_max' }); }}
                                                            style={{ 
                                                                padding: '0 8px', fontSize: '0.6rem', fontWeight: 800, borderRadius: '0.35rem', border: 'none', cursor: 'pointer',
                                                                background: (ex.scoringMode ?? 'from_max') === 'from_max' ? 'var(--accent)' : 'transparent',
                                                                color: (ex.scoringMode ?? 'from_max') === 'from_max' ? 'white' : 'var(--text-secondary)'
                                                            }}
                                                        >MAX</button>
                                                    </div>
                                                </div>

                                                {/* Page Management for 'pages' type */}
                                                {ex.type === 'pages' && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)' }}>PÀGINES ASSIGNADES</span>
                                                            <button 
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    if (!ex.pageIndexes.includes(currentPageIndex)) {
                                                                        updateExerciseMeta(ex.id, { pageIndexes: [...ex.pageIndexes, currentPageIndex].sort((a,b) => a-b) });
                                                                    }
                                                                }}
                                                                className="btn btn-secondary"
                                                                style={{ fontSize: '0.6rem', height: '20px', padding: '0 0.4rem' }}
                                                                disabled={ex.pageIndexes.includes(currentPageIndex)}
                                                            >
                                                                + Afegir pàg. {currentPageIndex + 1}
                                                            </button>
                                                        </div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                            {ex.pageIndexes.map(pIdx => (
                                                                <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                                                    <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>P{pIdx + 1}</span>
                                                                    <button 
                                                                        onClick={(e) => { 
                                                                            e.stopPropagation();
                                                                            if (ex.pageIndexes.length > 1) {
                                                                                updateExerciseMeta(ex.id, { pageIndexes: ex.pageIndexes.filter(p => p !== pIdx) });
                                                                            } else {
                                                                                showAlert("Error", "Un exercici de pàgina ha de tenir almenys una pàgina.");
                                                                            }
                                                                        }}
                                                                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                updateExerciseMeta(ex.id, { spansTwoPages: !ex.spansTwoPages });
                                                            }}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.2rem' }}
                                                        >
                                                            <div style={{ width: '14px', height: '14px', border: '1px solid var(--border)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ex.spansTwoPages ? 'var(--accent)' : 'transparent' }}>
                                                                {ex.spansTwoPages && <Check size={10} color="white" />}
                                                            </div>
                                                            <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Dues pàgines en paral·lel</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Rubric Items Editor */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Criteris de rúbrica</span>
                                                        <button onClick={(e) => { e.stopPropagation(); addRubricItem(ex.id); }} className="btn btn-icon" style={{ padding: '2px', height: '20px', width: '20px', color: 'var(--accent)' }}>
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                    
                                                    {(ex.rubric || []).map((item) => (
                                                        <div key={item.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                            <input 
                                                                type="text" 
                                                                value={item.label} 
                                                                placeholder="Concepte..." 
                                                                onChange={e => updateRubricItem(ex.id, item.id, { label: e.target.value })}
                                                                style={{ flex: 1, fontSize: '0.7rem', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                                                                onClick={e => e.stopPropagation()}
                                                            />
                                                            <NumericInput 
                                                                value={item.points} 
                                                                onChange={val => updateRubricItem(ex.id, item.id, { points: val || 0 })} 
                                                                style={{ width: '40px', textAlign: 'center' }} 
                                                            />
                                                            <button onClick={(e) => { e.stopPropagation(); removeRubricItem(ex.id, item.id); }} style={{ padding: '4px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {(ex.rubric || []).length === 0 && (
                                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Clica + per afegir criteris</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>
                </div>

                {/* Editor Main Canvas */}
                <div className="workspace" ref={containerRef} style={{ background: 'var(--bg-tertiary)', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minHeight: 0, position: 'relative', margin: 0, padding: 0 }}>
                    {/* Floating Pagination controls */}
                    <div className="glass-dark" style={{ position: 'absolute', top: '1rem', zIndex: 10, display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', borderRadius: '2rem' }}>
                        <button className="btn-icon" style={{ color: 'white' }} disabled={currentPageIndex === 0} onClick={() => setCurrentPageIndex(p => Math.max(0, p - 1))}><ChevronLeft size={20} /></button>
                        <span style={{ color: 'white', fontWeight: 700 }}>Pàgina {currentPageIndex + 1} / {pagesPerExam}</span>
                        <button className="btn-icon" style={{ color: 'white' }} disabled={currentPageIndex === pagesPerExam - 1} onClick={() => setCurrentPageIndex(p => Math.min(pagesPerExam - 1, p + 1))}><ChevronRight size={20} /></button>
                    </div>

                    {bgImage ? (
                        <div className="canvas-container" style={{ width: '100%', height: '100%', cursor: mode !== 'select' ? 'crosshair' : 'grab' }}>
                            <Stage ref={stageRef} width={containerRef.current?.clientWidth || 800} height={containerRef.current?.clientHeight || 600} scaleX={stageScale} scaleY={stageScale} x={stagePos.x} y={stagePos.y} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={handleWheel} onTouchStart={handleMouseDown} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} draggable={mode === 'select'} onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}>
                                <Layer>
                                    <KonvaImage image={bgImage} x={0} y={0} width={bgImage.width} height={bgImage.height} />
                                    {currentPageRegions.map((region) => {
                                        const { fill, stroke, label } = getRegionStyle(region.type);
                                        const isSelected = region.id === selectedId;
                                        return (
                                            <Group key={region.id} draggable={mode === 'select'} onClick={(e) => { if (mode === 'select') { e.cancelBubble = true; setSelectedId(region.id); } }} onTap={(e) => { if (mode === 'select') { e.cancelBubble = true; setSelectedId(region.id); } }} onDragEnd={(e) => { const x = e.target.x(); const y = e.target.y(); setExercises(prev => prev.map(ex => ex.id === region.id ? { ...ex, x, y } : ex)); e.target.x(0); e.target.y(0); }} x={region.x} y={region.y}>
                                                <Rect name="regionRect" x={0} y={0} width={region.width} height={region.height} fill={fill} stroke={stroke} strokeWidth={2 / stageScale} />
                                                <Rect x={0} y={-(24 / stageScale)} width={Math.max(80, label.length * 8 + 16) / stageScale} height={24 / stageScale} fill={stroke} />
                                                <Text text={label} fill="white" x={8 / stageScale} y={-(18 / stageScale)} fontSize={12 / stageScale} fontStyle="bold" />
                                                {isSelected && mode === 'select' && (
                                                    <Transformer rotateEnabled={false} keepRatio={false} boundBoxFunc={(oldBox, newBox) => { if (newBox.width < 10 || newBox.height < 10) return oldBox; return newBox; }} onTransformEnd={(e) => { const node = e.target; const sX = node.scaleX(), sY = node.scaleY(); setExercises(prev => prev.map(ex => ex.id === region.id ? { ...ex, width: Math.max(10, node.width() * sX), height: Math.max(10, node.height() * sY) } : ex)); node.scaleX(1); node.scaleY(1); }} />
                                                )}
                                            </Group>
                                        );
                                    })}
                                    {isDrawing && newCropRef && (() => {
                                        const { fill, stroke } = getRegionStyle(mode === 'draw' ? 'crop' : mode === 'draw_ocr' ? 'ocr_name' : 'total_score');
                                        return <Rect x={newCropRef.x} y={newCropRef.y} width={newCropRef.width} height={newCropRef.height} fill={fill} stroke={stroke} strokeWidth={2 / stageScale} dash={[5, 5]} />;
                                    })()}
                                </Layer>
                            </Stage>
                        </div>
                    ) : <div className="loader" />}
                </div>
            </div>
        </div>
    );
}
