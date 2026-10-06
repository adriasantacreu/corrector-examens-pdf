/**
 * Llenç del corrector: pàgines de l'alumne, anotacions, segell de nota i totes les interaccions de dibuix.
 */
import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { FONT_SCALE } from '../../config/constants';
import { displayInk } from '../../domain/colors';
import { DEFAULT_TEXT_COLOR, droppedComment, eraseAt, newAnnotationId, stampComment } from '../../domain/annotations';
import { normalizeRect } from '../../domain/geometry';
import { formatScaledPoints, getHighlightPoints, SCORE_STAMP_ID } from '../../domain/scoring';
import type { StageViewport } from '../../hooks/useStageViewport';
import type {
    Annotation, AnnotationComment, GradableExercise, HighlighterAnnotation, ImageAnnotation, PenAnnotation, PresetHighlighter, Student,
} from '../../types';
import ZoomControls from '../common/ZoomControls';
import { HighlighterShape, ImageShape, LegendShape, PenShape, TextShape } from './AnnotationShapes';
import ScoreStamp, { type StampData } from './ScoreStamp';
import type { CorrectionTools } from './useCorrectionTools';
import type { ExerciseRender } from './useExerciseRender';
import type { StampPlacement } from '../../domain/stamp';

export interface EditingText {
    id: string;
    text: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    startX?: number;
    startY?: number;
}

interface Props {
    vp: StageViewport;
    render: ExerciseRender | null;
    isLoading: boolean;
    /** Error en pintar el retall: substitueix el motiu genèric i ofereix tornar-ho a provar. */
    renderError?: string | null;
    onRetryRender?: () => void;
    student: Student;
    exercise: GradableExercise;
    annotations: Annotation[];
    /** Canvi amb pas a l'historial. */
    apply: (anns: Annotation[], coalesce?: string) => void;
    /** Canvi sense pas a l'historial (p. ex. mentre s'esborra arrossegant). */
    commit: (anns: Annotation[]) => void;
    pushHistory: (snapshot: Annotation[]) => void;
    tools: CorrectionTools;
    presets: PresetHighlighter[];
    isDarkMode: boolean;
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
    editingText: EditingText | null;
    setEditingText: (t: EditingText | null | ((p: EditingText | null) => EditingText | null)) => void;
    commitTextEdit: () => void;
    pendingStampComment: AnnotationComment | null;
    clearPendingStampComment: () => void;
    onCommentDragEnd: () => void;
    stamp: StampData | null;
    stampSize: number;
    onStampMoved: (p: StampPlacement) => void;
    formatPoints: (p: number) => string;
    scaleFactor: number;
    onFit: () => void;
    isCommentBankExpanded: boolean;
    onToggleCommentBank: () => void;
    onBack: () => void;
    onTryNextStudent: () => void;
}

const MIN_HIGHLIGHT = 3;

export default function CorrectionCanvas(p: Props) {
    const { vp, render, isLoading, student, exercise, annotations, apply, commit, pushHistory, tools, presets, isDarkMode, selectedId, setSelectedId, editingText, setEditingText, commitTextEdit, stamp } = p;
    const { tool, setTool } = tools;
    const [isDrawing, setIsDrawing] = useState(false);
    const transformerRef = useRef<Konva.Transformer>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const draftLineRef = useRef<Konva.Line>(null);
    const draftRectRef = useRef<Konva.Rect>(null);
    const draft = useRef<{ pen?: PenAnnotation; highlight?: HighlighterAnnotation & { startX: number; startY: number } } >({});
    const erasing = useRef<{ active: boolean; snapshotTaken: boolean }>({ active: false, snapshotTaken: false });
    const latest = useRef(annotations);
    useEffect(() => { latest.current = annotations; }, [annotations]);

    // Transformer lligat a l'anotació seleccionada
    useEffect(() => {
        const tr = transformerRef.current;
        const stage = vp.stageRef.current;
        if (!tr || !stage) return;
        const node = selectedId ? stage.findOne('#' + selectedId) : null;
        tr.nodes(node && node.getLayer() ? [node] : []);
        tr.getLayer()?.batchDraw();
    }, [selectedId, annotations, stamp, vp.stageRef]);

    useEffect(() => { if (editingText && textareaRef.current) textareaRef.current.focus(); }, [editingText]);

    // Enganxar imatges (Ctrl+V) al punt on hi ha el ratolí
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            if (editingText) return;
            for (const item of Array.from(e.clipboardData?.items ?? [])) {
                if (!item.type.includes('image')) continue;
                const blob = item.getAsFile();
                if (!blob) continue;
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = reader.result as string;
                    const pos = vp.pointerToDocument() ?? { x: (50 - vp.stagePos.x) / vp.stageScale, y: (50 - vp.stagePos.y) / vp.stageScale };
                    const img = new Image();
                    img.onload = () => {
                        const ann: ImageAnnotation = { id: newAnnotationId('img'), type: 'image', x: pos.x, y: pos.y, width: img.width / 2, height: img.height / 2, dataUrl };
                        apply([...latest.current, ann]);
                        setTimeout(() => setSelectedId(ann.id), 50);
                    };
                    img.src = dataUrl;
                };
                reader.readAsDataURL(blob);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [editingText, vp, apply, setSelectedId]);

    const redrawDraft = () => draftLineRef.current?.getLayer()?.batchDraw();

    const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (editingText && tool !== 'text') { commitTextEdit(); return; }
        const stage = e.target.getStage();
        if (tool === 'select' && e.target === stage) { setSelectedId(null); return; }
        if (tool === 'select' && !p.pendingStampComment) return;
        const pos = vp.pointerToDocument();
        if (!pos) return;

        if (p.pendingStampComment) {
            const ann = stampComment(p.pendingStampComment, pos, tools.commentDefaultSize);
            apply([...annotations, ann]);
            setSelectedId(ann.id);
            p.clearPendingStampComment();
            setTool('select');
            return;
        }
        if (tool === 'eraser') {
            erasing.current = { active: true, snapshotTaken: false };
            eraseAtPoint(pos);
            setIsDrawing(true);
            return;
        }
        if (tool === 'text') {
            const id = newAnnotationId('text');
            setEditingText({ id, text: '', x: pos.x, y: pos.y, width: 0, height: 0 });
            setSelectedId(id);
            setIsDrawing(true);
            return;
        }
        setIsDrawing(true);
        setSelectedId(null);
        if (tool === 'pen') {
            draft.current.pen = { id: newAnnotationId('pen'), type: 'pen', points: [pos.x, pos.y], color: tools.penColor, strokeWidth: tools.penWidth, opacity: tools.penOpacity };
        } else if (tool === 'highlighter') {
            const preset = tools.activePresetId ? presets.find(pr => pr.id === tools.activePresetId) : undefined;
            draft.current.highlight = {
                id: newAnnotationId('hl'), type: 'highlighter', x: pos.x, y: pos.y, width: 0, height: 0, startX: pos.x, startY: pos.y,
                color: preset ? preset.color : tools.highlighterColor, presetId: preset?.id, points: preset?.points, label: preset?.label,
                fontSize: tools.commentDefaultSize,
            };
        }
    };

    const eraseAtPoint = (pos: { x: number; y: number }) => {
        const current = latest.current;
        const next = eraseAt(current, pos, 20 / vp.baseScale);
        if (next.length === current.length) return;
        if (!erasing.current.snapshotTaken) { pushHistory(current); erasing.current.snapshotTaken = true; }
        latest.current = next;
        commit(next);
    };

    const handleMouseMove = () => {
        if (!isDrawing) return;
        const pos = vp.pointerToDocument();
        if (!pos) return;
        if (tool === 'eraser' && erasing.current.active) { eraseAtPoint(pos); return; }
        if (tool === 'pen' && draft.current.pen) {
            draft.current.pen.points.push(pos.x, pos.y);
            draftLineRef.current?.points(draft.current.pen.points);
            redrawDraft();
        } else if (tool === 'highlighter' && draft.current.highlight) {
            const h = draft.current.highlight;
            Object.assign(h, normalizeRect({ x: h.startX, y: h.startY, width: pos.x - h.startX, height: pos.y - h.startY }));
            draftRectRef.current?.setAttrs({ x: h.x, y: h.y, width: h.width, height: h.height });
            draftRectRef.current?.getLayer()?.batchDraw();
        } else if (tool === 'text' && editingText) {
            setEditingText(prev => {
                if (!prev) return null;
                const startX = prev.startX ?? prev.x;
                const startY = prev.startY ?? prev.y;
                return { ...prev, startX, startY, ...normalizeRect({ x: startX, y: startY, width: pos.x - startX, height: pos.y - startY }) };
            });
        }
    };

    const handleMouseUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        erasing.current.active = false;
        const { pen, highlight } = draft.current;
        draft.current = {};
        if (pen) {
            const points = pen.points.length === 2 ? [...pen.points, ...pen.points] : pen.points;
            apply([...latest.current, { ...pen, points }]);
        }
        if (highlight) {
            const { startX: _sx, startY: _sy, ...ann } = highlight;
            // Un clic sense arrossegar ja no crea un fluorescent invisible que resta punts
            if (ann.width >= MIN_HIGHLIGHT && ann.height >= MIN_HIGHLIGHT) apply([...latest.current, ann]);
            else redrawDraft();
        }
        if (tool === 'text' && editingText && (editingText.width || 0) < 10 && (editingText.height || 0) < 10) {
            setEditingText(prev => (prev ? { ...prev, width: 200, height: 60 } : null));
        }
    };

    const onDragEnd = (e: KonvaEventObject<DragEvent>, id: string) => {
        if (e.target.id() !== id) return;
        const next = annotations.map(a => {
            if (a.id !== id) return a;
            if (a.type === 'pen') {
                const dx = e.target.x();
                const dy = e.target.y();
                e.target.position({ x: 0, y: 0 });
                return { ...a, points: a.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
            }
            return { ...a, x: e.target.x(), y: e.target.y() } as Annotation;
        });
        apply(next);
    };

    /** Durant el redimensionament, els textos i fluorescents canvien de mida en lloc d'escalar-se (no es deformen). */
    const onTransform = (e: KonvaEventObject<Event>) => {
        const node = e.target as Konva.Group;
        const isText = node.hasName('text-group');
        if (!isText && !node.hasName('highlighter-group') && !node.hasName('stamp-group')) return;
        const w = Math.max(20, node.width() * node.scaleX());
        const h = Math.max(20, node.height() * node.scaleY());
        node.scale({ x: 1, y: 1 });
        node.size({ width: w, height: h });
        if (isText) {
            node.find('Text').forEach(t => t.width(w));
            node.findOne('Rect')?.size({ width: w + 8, height: h + 8 });
        } else if (node.hasName('highlighter-group')) {
            node.findOne('Rect')?.size({ width: w, height: h });
        }
    };

    const onTransformEnd = (e: KonvaEventObject<Event>, id: string) => {
        const node = e.target;
        const sx = node.scaleX();
        const sy = node.scaleY();
        const next = annotations.map(a => {
            if (a.id !== id) return a;
            switch (a.type) {
                case 'pen': {
                    const ox = node.x();
                    const oy = node.y();
                    return { ...a, points: a.points.map((v, i) => (i % 2 === 0 ? ox + (v - ox) * sx : oy + (v - oy) * sy)) };
                }
                case 'text':
                    return { ...a, x: node.x(), y: node.y(), width: Math.max(20, node.width() * sx), height: Math.max(20, node.height() * sy) };
                case 'highlighter':
                    return { ...a, x: node.x(), y: node.y(), width: Math.max(5, node.width() * sx), height: Math.max(5, node.height() * sy) };
                case 'image':
                    return { ...a, x: node.x(), y: node.y(), width: Math.abs(a.width * sx), height: Math.abs(a.height * sy) };
                case 'highlighter_legend':
                    return { ...a, x: node.x(), y: node.y(), scale: (a.scale || 1) * sx };
            }
            return a;
        });
        node.scale({ x: 1, y: 1 });
        apply(next);
    };

    const onDropComment = (e: ReactDragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const payload = e.dataTransfer.getData('text/comment');
        const stage = vp.stageRef.current;
        if (!payload || !stage) return;
        let comment: Partial<AnnotationComment> & { text: string };
        try { comment = JSON.parse(payload); } catch { comment = { text: payload }; }
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = stage.getAbsoluteTransform().copy().invert().point({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        const ann = droppedComment(comment, pos, tools.commentDefaultSize);
        apply([...annotations, ann]);
        p.onCommentDragEnd();
        setTool('select');
        setTimeout(() => setSelectedId(ann.id), 50);
    };

    const select = (id: string) => (e: KonvaEventObject<Event>) => {
        if (tool !== 'select') return;
        e.cancelBubble = true;
        setSelectedId(id);
    };

    const usedLegendPresets = presets.filter(pr => annotations.some(a => a.type === 'highlighter' && a.presetId === pr.id));
    const pages = render?.pages ?? [];
    const cursor = p.pendingStampComment ? 'crosshair' : (tool === 'select' ? 'default' : 'crosshair');
    const stageCursor = tool === 'pen' ? 'crosshair' : tool === 'eraser' ? 'cell' : tool === 'highlighter' || tool === 'text' ? 'text' : tool === 'select' ? 'grab' : 'default';

    return (
        <div className="workspace" ref={vp.containerRef} style={{ background: 'transparent', display: 'flex', flexDirection: 'column', position: 'relative', flex: 1, overflow: 'hidden', minHeight: 0 }}>
            {pages.length > 0 && render ? (
                <>
                    <div
                        className="canvas-container"
                        style={{ width: '100%', flex: 1, minHeight: 0, position: 'relative', margin: 0, boxShadow: 'none', background: 'transparent', cursor }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={onDropComment}
                    >
                        <Stage
                            ref={vp.stageRef}
                            width={vp.containerSize.width || window.innerWidth}
                            height={vp.containerSize.height || window.innerHeight}
                            scaleX={vp.stageScale}
                            scaleY={vp.stageScale}
                            x={vp.stagePos.x}
                            y={vp.stagePos.y}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            onTouchStart={handleMouseDown}
                            onTouchMove={e => { if (!vp.handlePinch(e)) handleMouseMove(); }}
                            onTouchEnd={() => { vp.endPinch(); handleMouseUp(); }}
                            onWheel={vp.handleWheel}
                            onClick={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}
                            onTap={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}
                            draggable={tool === 'select'}
                            onDragEnd={e => { if (tool === 'select' && e.target === vp.stageRef.current) vp.setStagePos({ x: e.target.x(), y: e.target.y() }); }}
                            style={{ cursor: stageCursor }}
                        >
                            <Layer key={`${student.id}_${exercise.id}`}>
                                {pages.map(page => (
                                    <KonvaImage key={page.order} image={page.img} x={page.x} y={page.y} width={page.width} height={page.height} />
                                ))}
                                <Rect
                                    x={0} y={0} width={render.bounds.width} height={render.bounds.height}
                                    stroke="#ef4444" strokeWidth={1 / vp.baseScale} dash={[15 / vp.baseScale, 10 / vp.baseScale]} opacity={0.6} listening={false}
                                />
                                {annotations.filter(a => a.id !== SCORE_STAMP_ID).map(ann => {
                                    const isSelected = ann.id === selectedId;
                                    const common = {
                                        isSelected,
                                        draggable: tool === 'select' && isSelected,
                                        baseScale: vp.baseScale,
                                        isDark: isDarkMode,
                                        onSelect: select(ann.id),
                                        onDragEnd: (e: KonvaEventObject<DragEvent>) => onDragEnd(e, ann.id),
                                        onTransform,
                                        onTransformEnd: (e: KonvaEventObject<Event>) => onTransformEnd(e, ann.id),
                                    };
                                    switch (ann.type) {
                                        case 'pen':
                                            return <PenShape key={ann.id} ann={ann} {...common} />;
                                        case 'highlighter': {
                                            const pts = getHighlightPoints(ann, presets);
                                            const label = [ann.label || '', pts !== undefined ? formatScaledPoints(pts, p.scaleFactor) : ''].filter(Boolean).join(' ');
                                            return (
                                                <HighlighterShape
                                                    key={ann.id} ann={ann} {...common}
                                                    showLabel={tools.highlighterLabelMode === 'individual'}
                                                    labelText={label}
                                                    defaultFontSize={tools.commentDefaultSize}
                                                    onLabelMoved={(x, y) => apply(annotations.map(a => (a.id === ann.id ? { ...a, labelOffsetX: x, labelOffsetY: y } as Annotation : a)))}
                                                />
                                            );
                                        }
                                        case 'highlighter_legend':
                                            if (tools.highlighterLabelMode !== 'legend') return null;
                                            return <LegendShape key={ann.id} ann={ann} {...common} presets={usedLegendPresets} />;
                                        case 'text':
                                            if (editingText?.id === ann.id) return null;
                                            return (
                                                <TextShape
                                                    key={ann.id} ann={ann} {...common}
                                                    defaultFontSize={tools.commentDefaultSize}
                                                    formatPoints={p.formatPoints}
                                                    onEdit={e => {
                                                        if (tool !== 'select') return;
                                                        e.cancelBubble = true;
                                                        setEditingText({ id: ann.id, text: ann.text, x: ann.x, y: ann.y });
                                                    }}
                                                />
                                            );
                                        case 'image':
                                            return <ImageShape key={ann.id} ann={ann} {...common} />;
                                    }
                                    return null;
                                })}
                                {selectedId && !editingText && (
                                    <Transformer
                                        ref={transformerRef}
                                        rotateEnabled={false}
                                        borderStroke="#6366f1"
                                        borderStrokeWidth={1 / vp.baseScale}
                                        anchorFill="white"
                                        anchorStroke="#6366f1"
                                        anchorStrokeWidth={1.5 / vp.baseScale}
                                        anchorSize={5 / vp.baseScale}
                                        anchorCornerRadius={1 / vp.baseScale}
                                        padding={5 / vp.baseScale}
                                        enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
                                    />
                                )}
                                {stamp && (
                                    <ScoreStamp
                                        key={`stamp_${exercise.id}_${student.id}`}
                                        data={stamp}
                                        isDark={isDarkMode}
                                        size={p.stampSize}
                                        selectable={tool === 'select'}
                                        isSelected={selectedId === SCORE_STAMP_ID}
                                        onSelect={() => setSelectedId(SCORE_STAMP_ID)}
                                        onMoved={p.onStampMoved}
                                    />
                                )}
                                {isDrawing && tool === 'text' && editingText && (
                                    <Rect x={editingText.x} y={editingText.y} width={editingText.width} height={editingText.height} stroke="#3b82f6" dash={[5 / vp.stageScale, 5 / vp.stageScale]} strokeWidth={2} />
                                )}
                            </Layer>
                            <Layer listening={false}>
                                {isDrawing && tool === 'pen' && (
                                    <Line
                                        ref={draftLineRef}
                                        points={draft.current.pen?.points ?? []}
                                        stroke={displayInk(tools.penColor, isDarkMode)} strokeWidth={tools.penWidth / vp.baseScale}
                                        lineCap="round" lineJoin="round" tension={0.5} opacity={tools.penOpacity}
                                    />
                                )}
                                {isDrawing && tool === 'highlighter' && (
                                    <Rect ref={draftRectRef} x={0} y={0} width={0} height={0} fill={draft.current.highlight?.color ?? tools.highlighterColor} />
                                )}
                            </Layer>
                        </Stage>

                        {editingText && !isDrawing && (
                            <textarea
                                ref={textareaRef}
                                autoFocus
                                placeholder="Escriu aquí... (Enter per confirmar, Esc per cancel·lar)"
                                value={editingText.text}
                                onChange={e => setEditingText({ ...editingText, text: e.target.value })}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextEdit(); }
                                    else if (e.key === 'Escape') setEditingText(null);
                                    e.stopPropagation();
                                }}
                                style={{
                                    position: 'absolute',
                                    top: editingText.y * vp.stageScale + vp.stagePos.y,
                                    left: editingText.x * vp.stageScale + vp.stagePos.x,
                                    width: editingText.width ? editingText.width * vp.stageScale : '200px',
                                    height: editingText.height ? editingText.height * vp.stageScale : '60px',
                                    margin: 0, padding: 0, border: '1px dashed var(--accent)', background: 'transparent', outline: 'none', resize: 'none', overflow: 'hidden',
                                    color: DEFAULT_TEXT_COLOR,
                                    fontSize: `${(tools.activePresetId ? 18 : tools.commentDefaultSize) * FONT_SCALE * vp.stageScale}px`,
                                    fontFamily: 'Caveat', fontWeight: 800, lineHeight: 1.0, zIndex: 10,
                                }}
                            />
                        )}
                    </div>

                    <ZoomControls variant="correction" scale={vp.stageScale} onZoom={vp.applyZoom} onFit={p.onFit} />

                    <div
                        onClick={p.onToggleCommentBank}
                        style={{
                            position: 'absolute', bottom: '1.5rem', left: '1.5rem', zIndex: 400,
                            background: p.isCommentBankExpanded ? 'var(--bg-secondary)' : 'var(--accent)',
                            border: '1px solid var(--border)', padding: '0.4rem 1rem', borderRadius: '2rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            color: p.isCommentBankExpanded ? 'var(--text-secondary)' : 'white',
                            fontSize: '0.65rem', fontWeight: 800, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', pointerEvents: 'auto',
                        }}
                    >
                        {p.isCommentBankExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        <span>{p.isCommentBankExpanded ? 'AMAGA COMENTARIS' : 'MOSTRA COMENTARIS'}</span>
                    </div>
                </>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1.5rem', padding: '2rem', textAlign: 'center' }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--border)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxWidth: '400px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                            {isLoading ? <Loader2 size={48} className="animate-spin" color="var(--accent)" /> : <AlertTriangle size={48} color="var(--danger)" />}
                        </div>
                        <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontSize: '1.2rem', fontWeight: 700 }}>
                            {isLoading ? 'Carregant exercici...' : "No es pot carregar l'exercici"}
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                            {!isLoading && p.renderError
                                ? `No s'ha pogut pintar la pàgina del PDF (${p.renderError}).`
                                : student.pageIndexes.length === 0
                                ? 'Aquest alumne no té cap pàgina de PDF assignada.'
                                : `L'exercici requereix pàgines d'alumne que no estan disponibles. Pàgines de l'alumne: [${student.pageIndexes.join(', ')}].`}
                        </p>
                        <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '0.5rem', textAlign: 'left', fontSize: '0.8rem' }}>
                            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Detalls tècnics:</div>
                            <div>Tipus exercici: <strong>{exercise.type}</strong></div>
                            {exercise.type === 'pages'
                                ? <div>Pàgines requerides: <strong>{exercise.pageIndexes.map(x => x + 1).join(', ')}</strong></div>
                                : <div>Pàgina requerida: <strong>{exercise.pageIndex + 1}</strong></div>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {!isLoading && p.renderError && p.onRetryRender && (
                            <button className="btn btn-primary" onClick={p.onRetryRender}>Torna-ho a provar</button>
                        )}
                        <button className="btn btn-secondary" onClick={p.onBack}>Tornar a Configuració</button>
                        <button className="btn btn-primary" onClick={p.onTryNextStudent}>Provar següent alumne</button>
                    </div>
                </div>
            )}
        </div>
    );
}

