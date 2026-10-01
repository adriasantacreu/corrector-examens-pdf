/** Dibuix (react-konva) de cada tipus d'anotació al corrector. */
import { useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { FONT_SCALE } from '../../config/constants';
import { opaqueColor } from '../../domain/annotations';
import type {
    HighlighterAnnotation, HighlighterLegendAnnotation, ImageAnnotation, PenAnnotation, PresetHighlighter, TextAnnotation,
} from '../../types';

type KEvent = KonvaEventObject<Event>;
type DragEvt = KonvaEventObject<DragEvent>;

/** Color de selecció (Konva no entén variables CSS com `var(--accent)`, que abans deixaven la selecció invisible). */
const SELECTION = '#6366f1';
const ACCENT = '#3b82f6';

export interface ShapeHandlers {
    isSelected: boolean;
    draggable: boolean;
    baseScale: number;
    onSelect: (e: KEvent) => void;
    onDragEnd: (e: DragEvt) => void;
    onTransform?: (e: KEvent) => void;
    onTransformEnd: (e: KEvent) => void;
}

export function PenShape({ ann, isSelected, draggable, baseScale, onSelect, onDragEnd, onTransformEnd }: ShapeHandlers & { ann: PenAnnotation }) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < ann.points.length; i += 2) {
        minX = Math.min(minX, ann.points[i]); maxX = Math.max(maxX, ann.points[i]);
        minY = Math.min(minY, ann.points[i + 1]); maxY = Math.max(maxY, ann.points[i + 1]);
    }
    return (
        <Group id={ann.id} draggable={draggable} onDragEnd={onDragEnd} onClick={onSelect} onTap={onSelect} onTransformEnd={onTransformEnd}>
            <Line
                points={ann.points} stroke={ann.color} strokeWidth={(ann.strokeWidth || 2) / baseScale}
                lineCap="round" lineJoin="round" tension={0.5} opacity={ann.opacity ?? 1} hitStrokeWidth={10 / baseScale}
            />
            {isSelected && (
                <Rect
                    x={minX - 4 / baseScale} y={minY - 4 / baseScale}
                    width={(maxX - minX) + 8 / baseScale} height={(maxY - minY) + 8 / baseScale}
                    stroke={SELECTION} strokeWidth={1 / baseScale} dash={[4 / baseScale, 4 / baseScale]} strokeScaleEnabled={true} listening={false}
                />
            )}
        </Group>
    );
}

export function HighlighterShape({ ann, isSelected, draggable, baseScale, onSelect, onDragEnd, onTransform, onTransformEnd, showLabel, labelText, defaultFontSize, onLabelMoved }: ShapeHandlers & {
    ann: HighlighterAnnotation;
    showLabel: boolean;
    labelText: string;
    defaultFontSize: number;
    onLabelMoved: (x: number, y: number) => void;
}) {
    const fontSize = (ann.fontSize || defaultFontSize) * FONT_SCALE;
    return (
        <Group
            id={ann.id} name="highlighter-group" x={ann.x} y={ann.y} width={ann.width || 100} height={ann.height || 30}
            draggable={draggable} onClick={onSelect} onTap={onSelect} onDragEnd={onDragEnd} onTransform={onTransform} onTransformEnd={onTransformEnd}
        >
            <Rect width={ann.width} height={ann.height} fill={ann.color} stroke={isSelected ? ACCENT : undefined} strokeWidth={isSelected ? 1 / baseScale : 0} />
            {showLabel && labelText && (
                <Text
                    x={ann.labelOffsetX ?? 2} y={ann.labelOffsetY ?? -(fontSize + 4)}
                    text={labelText} fill={opaqueColor(ann.color)} fontSize={fontSize} fontFamily="Caveat" fontStyle="800" letterSpacing={0.5} align="left"
                    draggable={draggable}
                    onDragEnd={e => { e.cancelBubble = true; onLabelMoved(e.target.x(), e.target.y()); }}
                />
            )}
        </Group>
    );
}

export function LegendShape({ ann, isSelected, draggable, baseScale, onSelect, onDragEnd, onTransformEnd, presets }: ShapeHandlers & {
    ann: HighlighterLegendAnnotation;
    presets: PresetHighlighter[];
}) {
    if (!presets.length) return null;
    const size = 14 * FONT_SCALE;
    const padding = 10;
    const itemHeight = size + 10;
    return (
        <Group id={ann.id} x={ann.x} y={ann.y} scaleX={ann.scale || 1} scaleY={ann.scale || 1} draggable={draggable} onClick={onSelect} onTap={onSelect} onDragEnd={onDragEnd} onTransformEnd={onTransformEnd}>
            {isSelected && <Rect width={250 / baseScale} height={(presets.length * itemHeight + padding) / baseScale} stroke={SELECTION} strokeWidth={1 / baseScale} dash={[5 / baseScale, 5 / baseScale]} />}
            {presets.map((p, i) => (
                <Group key={p.id} y={i * itemHeight}>
                    <Rect width={size} height={size} fill={p.color} cornerRadius={2} opacity={0.8} />
                    <Text x={size + 12} y={2} text={p.label} fontSize={size * 0.9} fill="#1e293b" fontFamily="Caveat" fontStyle="bold" />
                </Group>
            ))}
        </Group>
    );
}

export function TextShape({ ann, isSelected, draggable, onSelect, onDragEnd, onTransform, onTransformEnd, onEdit, defaultFontSize, formatPoints }: ShapeHandlers & {
    ann: TextAnnotation;
    defaultFontSize: number;
    onEdit: (e: KEvent) => void;
    formatPoints: (p: number) => string;
}) {
    const fontSize = (ann.fontSize || defaultFontSize) * FONT_SCALE;
    const autoWidth = ann.text.length * (fontSize * 0.6);
    return (
        <Group
            id={ann.id} name="text-group" x={ann.x} y={ann.y}
            width={ann.width || autoWidth + 8} height={ann.height || fontSize + 8}
            draggable={draggable} onClick={onSelect} onTap={onSelect} onDblClick={onEdit} onDblTap={onEdit}
            onDragEnd={onDragEnd} onTransform={onTransform} onTransformEnd={onTransformEnd}
        >
            <Text text={ann.text} fill={ann.color} fontSize={fontSize} fontFamily="Caveat" width={ann.width || undefined} wrap="word" />
            {ann.score !== undefined && (
                <Text x={0} y={-(fontSize * 0.7)} text={formatPoints(ann.score)} fill={ann.color} fontSize={fontSize * 0.65} fontFamily="'Caveat', cursive" fontStyle="bold" />
            )}
            {isSelected && (
                <Rect x={-4} y={-4} width={(ann.width || autoWidth) + 8} height={(ann.height || fontSize) + 8} stroke={SELECTION} dash={[4, 4]} strokeWidth={1} fill="transparent" />
            )}
        </Group>
    );
}

/** Carrega una imatge un sol cop (abans es creava un `new Image()` a cada render i no sempre es veia). */
function useImageElement(src: string): HTMLImageElement | null {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    useEffect(() => {
        const el = new Image();
        el.onload = () => setImg(el);
        el.src = src;
        return () => { el.onload = null; };
    }, [src]);
    return img;
}

export function ImageShape({ ann, isSelected, draggable, baseScale, onSelect, onDragEnd, onTransformEnd }: ShapeHandlers & { ann: ImageAnnotation }) {
    const img = useImageElement(ann.dataUrl);
    return (
        <Group id={ann.id} x={ann.x} y={ann.y} draggable={draggable} onClick={onSelect} onTap={onSelect} onDragEnd={onDragEnd} onTransformEnd={onTransformEnd}>
            {img && <KonvaImage image={img} width={ann.width} height={ann.height} />}
            {isSelected && <Rect width={ann.width} height={ann.height} stroke={ACCENT} dash={[5 / baseScale, 5 / baseScale]} strokeWidth={1 / baseScale} />}
        </Group>
    );
}
