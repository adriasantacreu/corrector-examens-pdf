import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group, Text, Transformer } from 'react-konva';
import { ChevronLeft, ChevronRight, Check, Trash2, MousePointer2, Square, Plus, File, Award, TextSelect, Settings, FileText, Moon, Sun, LogOut, RefreshCw } from 'lucide-react';
import type { PDFDocumentProxy } from '../utils/pdfUtils';
import { renderPDFPageToCanvas } from '../utils/pdfUtils';
import type { ExerciseDef, CropExercise, PagesExercise } from '../types';
import FlowGradingLogo from './FlowGradingLogo';
import Highlighter from './Highlighter';
import HandwrittenTitle from './HandwrittenTitle';

interface Props {
    pdfDoc: PDFDocumentProxy;
    pagesPerExam: number;
    initialExercises: ExerciseDef[];
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
    pdfDoc, pagesPerExam, initialExercises, onComplete, onBack, theme, onToggleTheme,
    accessToken, userEmail, userPicture, onAuthorize, onLogout, onRunOCR, ocrCompleted
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
    const [mode, setMode] = useState<'select' | 'draw' | 'draw_qr' | 'draw_ocr' | 'draw_total_score'>('select');
    const [selectedId, setSelectedId] = useState<string | null>(null);

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
                const finalType = mode === 'draw' ? 'crop' : mode === 'draw_qr' ? 'qr_code' : mode === 'draw_ocr' ? 'ocr_name' : 'total_score';
                const newId = `ex_${Date.now()}`;
                const finalCrop: any = { id: newId, type: finalType, pageIndex: currentPageIndex, x, y, width, height };
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

    const currentPageRegions = exercises.filter(c => c.type !== 'pages' && c.pageIndex === currentPageIndex) as any[];

    const getRegionStyle = (type: string) => {
        switch (type) {
            case 'qr_code': return { fill: 'rgba(16, 185, 129, 0.2)', stroke: '#10b981', label: 'Àrea QR' };
            case 'ocr_name': return { fill: 'rgba(234, 179, 8, 0.2)', stroke: '#eab308', label: 'Nom OCR' };
            case 'total_score': return { fill: 'rgba(239, 68, 68, 0.2)', stroke: '#ef4444', label: 'Nota final' };
            // LIGHT BLUE FOR EXERCISES (Works better in dark mode)
            default: return { fill: 'rgba(96, 165, 250, 0.2)', stroke: '#60a5fa', label: 'Retall ex' };
        }
    };

    return (
        <div style={{ display: 'flex', width: '100%', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            {/* Unified Header */}
            <header className="header" style={{ flexShrink: 0 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    {onBack && (
                        <button className="btn-icon" onClick={onBack} title="Enrere">
                            <ChevronLeft size={28} />
                        </button>
                    )}
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                    <FlowGradingLogo size="2.2rem" />
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
                    <button className="btn btn-primary" onClick={() => onComplete(exercises)}>
                        <Check size={18} /> Finalitzar
                    </button>
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <div className="sidebar" style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: '1.25rem' }}>
                    <div style={{ paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <HandwrittenTitle size="1.5rem" color="purple" noMargin={true}>Definir plantilla</HandwrittenTitle>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>
                            Pàgina {currentPageIndex + 1} de {pagesPerExam}
                        </p>
                    </div>

                    <div style={{ padding: '0.75rem 0', display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                        <button className={`btn-icon ${mode === 'select' ? 'active' : ''}`} onClick={() => setMode('select')} title="Seleccionar/moure"><MousePointer2 size={18} /></button>
                        <button className={`btn-icon ${mode === 'draw' ? 'active' : ''}`} onClick={() => setMode('draw')} title="Dibuixar exercici"><Square size={18} /></button>
                        <button className={`btn-icon ${mode === 'draw_ocr' ? 'active' : ''}`} onClick={() => setMode('draw_ocr')} title="Definir nom (OCR)" style={{ color: mode === 'draw_ocr' ? '#eab308' : undefined }}><TextSelect size={18} /></button>
                        <button className={`btn-icon ${mode === 'draw_total_score' ? 'active' : ''}`} onClick={() => setMode('draw_total_score')} title="Definir nota final" style={{ color: mode === 'draw_total_score' ? '#ef4444' : undefined }}><Award size={18} /></button>
                    </div>

                    <div style={{ padding: '1rem 0', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Cap exercici definit.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {exercises.filter(ex => ex.type === 'crop' || ex.type === 'pages').map((ex, idx) => {
                                        const isCurrentPageInvolved = ex.type === 'pages' ? (ex as PagesExercise).pageIndexes.includes(currentPageIndex) : (ex as any).pageIndex === currentPageIndex;
                                        const isSelectedInList = ex.id === selectedId;
                                        return (
                                            <div key={ex.id} onClick={() => { if (ex.type === 'crop') setCurrentPageIndex((ex as any).pageIndex); setSelectedId(ex.id); }} style={{ padding: '0.75rem', background: isSelectedInList ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)', borderRadius: '0.5rem', border: isSelectedInList ? '2px solid var(--accent)' : (isCurrentPageInvolved ? '1px solid var(--accent)' : '1px solid var(--border)'), display: 'flex', flexDirection: 'column', gap: '0.5rem', transition: 'all 0.2s ease', cursor: 'pointer' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                                                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: ex.type === 'pages' ? 'var(--accent)' : '#6366f1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800 }}>{idx + 1}</div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '2px' }}>
                                                            <span style={{ fontSize: '0.55rem', fontWeight: 800, color: ex.type === 'pages' ? 'var(--accent)' : '#6366f1' }}>{ex.type === 'pages' ? 'Exercici de pàgina' : 'Exercici de retall'}</span>
                                                            <input ref={(el) => { inputRefs.current[ex.id] = el; }} type="text" value={ex.name || ''} placeholder="Nom exercici" onChange={e => updateExerciseMeta(ex.id, { name: e.target.value })} style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem' }} />
                                                        </div>
                                                    </div>
                                                    <button onClick={(e) => { e.stopPropagation(); removeExercise(ex.id); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1.5rem' }}>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Màx:</span>
                                                    <NumericInput value={ex.maxScore} onChange={val => updateExerciseMeta(ex.id, { maxScore: val })} style={{ width: '40px' }} />
                                                    <div style={{ flex: 1 }}></div>
                                                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                                                        {(['from_max', 'from_zero'] as const).map(m => (
                                                            <button key={m} onClick={(e) => { e.stopPropagation(); updateExerciseMeta(ex.id, { scoringMode: m }); }} style={{ fontSize: '0.65rem', padding: '2px 5px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: (ex.scoringMode ?? 'from_max') === m ? 'var(--accent)' : 'var(--bg-primary)', color: (ex.scoringMode ?? 'from_max') === m ? 'white' : 'var(--text-secondary)' }}>{m === 'from_max' ? 'Max' : 'Rúb'}</button>
                                                        ))}
                                                    </div>
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
