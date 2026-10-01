/**
 * Dibuix de les anotacions sobre un canvas 2D (per a l'exportació a PDF).
 * Ha de reproduir el que es veu al corrector (react-konva).
 */
import { FONT_SCALE, RENDER_SCALE } from '../../config/constants';
import { formatScaledPoints, getHighlightPoints } from '../../domain/scoring';
import type {
    Annotation, HighlighterAnnotation, HighlighterLegendAnnotation, ImageAnnotation, PenAnnotation, PresetHighlighter, TextAnnotation,
} from '../../types';

export interface PaintContext {
    presets: PresetHighlighter[];
    scaleFactor: number;
    /** Si l'exercici fa servir llegenda, les etiquetes individuals dels fluorescents no es dibuixen. */
    useLegend: boolean;
    /** Totes les anotacions de l'exercici (la llegenda mostra els presets usats a qualsevol pàgina). */
    exerciseAnnotations: Annotation[];
    /** Imatges enganxades ja carregades (per id d'anotació). */
    images: Map<string, HTMLImageElement>;
}

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
    const c = color.replace('#', '');
    if (c.length >= 6) return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16), a: 1 };
    return { r: 0, g: 0, b: 0, a: 1 };
}

const rgb = ({ r, g, b }: { r: number; g: number; b: number }) => `rgb(${r},${g},${b})`;

function drawPen(ctx: CanvasRenderingContext2D, ann: PenAnnotation) {
    if (ann.points.length < 2) return;
    const c = parseColor(ann.color);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ann.points[0], ann.points[1]);
    for (let i = 2; i < ann.points.length; i += 2) {
        const [px, py, x, y] = [ann.points[i - 2], ann.points[i - 1], ann.points[i], ann.points[i + 1]];
        ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
    }
    ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${ann.opacity ?? c.a})`;
    ctx.lineWidth = (ann.strokeWidth || 2) * RENDER_SCALE * 0.9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
}

function drawHighlighter(ctx: CanvasRenderingContext2D, ann: HighlighterAnnotation, pc: PaintContext) {
    const c = parseColor(ann.color);
    ctx.save();
    ctx.globalAlpha = c.a;
    ctx.fillStyle = rgb(c);
    ctx.fillRect(Math.min(ann.x, ann.x + ann.width), Math.min(ann.y, ann.y + ann.height), Math.abs(ann.width), Math.abs(ann.height));
    ctx.globalAlpha = 1;
    if (!pc.useLegend) {
        const pts = getHighlightPoints(ann, pc.presets);
        const text = [ann.label || '', pts !== undefined ? formatScaledPoints(pts, pc.scaleFactor) : ''].filter(Boolean).join(' ');
        if (text) {
            const fontSize = (ann.fontSize || 18) * FONT_SCALE;
            ctx.font = `bold ${fontSize}px Caveat, cursive`;
            ctx.textBaseline = 'top';
            ctx.fillText(text, ann.x + (ann.labelOffsetX ?? 2), ann.y + (ann.labelOffsetY ?? -(fontSize + 4)));
        }
    }
    ctx.restore();
}

function drawLegend(ctx: CanvasRenderingContext2D, ann: HighlighterLegendAnnotation, pc: PaintContext) {
    const used = new Set(pc.exerciseAnnotations.filter((a): a is HighlighterAnnotation => a.type === 'highlighter' && !!a.presetId).map(a => a.presetId));
    const presets = pc.presets.filter(p => used.has(p.id));
    if (!presets.length) return;
    const scale = ann.scale || 1;
    const size = 14 * FONT_SCALE * scale;
    const itemHeight = size + 10 * scale;
    ctx.save();
    presets.forEach((p, i) => {
        const y = ann.y + i * itemHeight;
        const c = parseColor(p.color);
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a})`;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(ann.x, y, size, size, 2 * scale);
        else ctx.rect(ann.x, y, size, size);
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.font = `bold ${size * 0.9}px Caveat, cursive`;
        ctx.textBaseline = 'top';
        ctx.fillText(`${p.label} (${formatScaledPoints(p.points, pc.scaleFactor)})`, ann.x + size + 12 * scale, y + 2 * scale);
    });
    ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, width?: number): string[] {
    const lines: string[] = [];
    for (const base of text.split('\n')) {
        if (!width) { lines.push(base); continue; }
        let current = '';
        for (const word of base.split(' ')) {
            const candidate = current ? `${current} ${word}` : word;
            if (ctx.measureText(candidate).width <= width || !current) current = candidate;
            else { lines.push(current); current = word; }
        }
        lines.push(current);
    }
    return lines;
}

function drawText(ctx: CanvasRenderingContext2D, ann: TextAnnotation, pc: PaintContext) {
    const c = parseColor(ann.color);
    const fontSize = (ann.fontSize || 18) * FONT_SCALE;
    ctx.save();
    ctx.font = `${ann.fontWeight || 'normal'} ${fontSize}px Caveat, cursive`;
    ctx.textAlign = ann.align || 'left';
    ctx.textBaseline = ann.baseline || 'top';
    // Al corrector el text d'un comentari es parteix per paraules quan té amplada
    const lines = wrapLines(ctx, ann.text || '', ann.width && ann.width > 0 ? ann.width : undefined);
    const lineHeight = fontSize * 1.1;

    if (ann.bgFill && lines.length) {
        const pad = 4;
        const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
        const total = lineHeight * lines.length;
        let bx = ann.x;
        let by = ann.y;
        if (ctx.textAlign === 'right') bx -= maxWidth;
        if (ctx.textAlign === 'center') bx -= maxWidth / 2;
        if (ctx.textBaseline === 'bottom') by -= total;
        if (ctx.textBaseline === 'middle') by -= total / 2;
        ctx.fillStyle = ann.bgFill;
        ctx.fillRect(bx - pad, by - pad, maxWidth + pad * 2, total + pad * 2);
    }

    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a})`;
    lines.forEach((line, i) => ctx.fillText(line, ann.x, ann.y + i * lineHeight));

    if (ann.score !== undefined) {
        ctx.font = `bold ${fontSize * 0.65}px Caveat, cursive`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(formatScaledPoints(ann.score, pc.scaleFactor), ann.x, ann.y);
    }
    ctx.restore();
}

function drawImage(ctx: CanvasRenderingContext2D, ann: ImageAnnotation, pc: PaintContext) {
    const img = pc.images.get(ann.id);
    if (img) ctx.drawImage(img, ann.x, ann.y, ann.width, ann.height);
}

export function paintAnnotations(ctx: CanvasRenderingContext2D, annotations: Annotation[], pc: PaintContext): void {
    for (const ann of annotations) {
        switch (ann.type) {
            case 'pen': drawPen(ctx, ann); break;
            case 'highlighter': drawHighlighter(ctx, ann, pc); break;
            case 'text': drawText(ctx, ann, pc); break;
            case 'image': drawImage(ctx, ann, pc); break;
            case 'highlighter_legend': drawLegend(ctx, ann, pc); break;
        }
    }
}

/** Carrega (i espera) totes les imatges enganxades abans de dibuixar-les. */
export async function preloadImages(annotations: Annotation[]): Promise<Map<string, HTMLImageElement>> {
    const map = new Map<string, HTMLImageElement>();
    await Promise.all(annotations.filter((a): a is ImageAnnotation => a.type === 'image').map(a => new Promise<void>(resolve => {
        const img = new Image();
        img.onload = () => { map.set(a.id, img); resolve(); };
        img.onerror = () => resolve();
        img.src = a.dataUrl;
    })));
    return map;
}
