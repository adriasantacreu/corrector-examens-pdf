import type { Annotation, AnnotationComment, HighlighterAnnotation, TextAnnotation } from '../types';
import type { Point } from './geometry';
import { pointInRect } from './geometry';

export const newAnnotationId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

/** Indica si la goma (un cercle de radi `radius`) toca l'anotació. */
export function eraserHits(ann: Annotation, pos: Point, radius: number): boolean {
    switch (ann.type) {
        case 'pen':
            for (let i = 0; i < ann.points.length; i += 2) {
                if (Math.hypot(ann.points[i] - pos.x, ann.points[i + 1] - pos.y) < radius) return true;
            }
            return false;
        case 'highlighter':
        case 'image':
            return pointInRect(pos, ann);
        case 'text': {
            const fontSize = (ann.fontSize || 18) * 1.5;
            return pos.x >= ann.x && pos.x <= ann.x + ann.text.length * fontSize * 0.6 &&
                pos.y >= ann.y - fontSize && pos.y <= ann.y + fontSize;
        }
        default:
            return false;
    }
}

export const eraseAt = (anns: Annotation[], pos: Point, radius: number): Annotation[] =>
    anns.filter(a => !eraserHits(a, pos, radius));

/** Converteix un color #rrggbb en rgba amb l'opacitat que fan servir els fluorescents. */
export function hexToHighlighterRgba(hex: string, alpha = 0.4): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Converteix un color rgba(...) o #hex a #rrggbb (per als selectors de color). */
export function colorToHex(color: string, fallback = '#fde047'): string {
    if (color.startsWith('#')) return color.slice(0, 7);
    const m = color.match(/\d+/g);
    if (!m || m.length < 3) return fallback;
    return '#' + m.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
}

/** Color opac equivalent a un color de fluorescent (per a les etiquetes). */
export const opaqueColor = (color: string): string =>
    color.startsWith('rgba') ? color.replace(/[\d.]+\)$/, '1.0)') : color;

export interface CommentColors {
    text: string;
    background: string;
    border: string;
}

/** Colors d'un comentari del banc segons el mode (neutre, per nota o personalitzat) i el tema. */
export function commentColors(comment: Pick<AnnotationComment, 'colorMode' | 'customColor' | 'score'>, isDark: boolean): CommentColors {
    if (comment.colorMode === 'custom' && comment.customColor) {
        const c = comment.customColor;
        return { text: c, background: isDark ? `${c}30` : `${c}15`, border: isDark ? `${c}60` : `${c}40` };
    }
    if (comment.score !== undefined && comment.score !== 0) {
        return comment.score > 0
            ? { text: isDark ? '#34d399' : '#059669', background: isDark ? '#064e3b' : '#10b98115', border: isDark ? '#05966960' : '#10b98140' }
            : { text: isDark ? '#f87171' : '#dc2626', background: isDark ? '#7f1d1d' : '#ef444415', border: isDark ? '#dc262660' : '#ef444440' };
    }
    return { text: 'var(--text-primary)', background: 'var(--bg-secondary)', border: 'var(--border)' };
}

export const DEFAULT_TEXT_COLOR = '#111827';

/** Anotació de text creada en "segellar" un comentari del banc al document. */
export function stampComment(comment: AnnotationComment, pos: Point, fontSize: number): TextAnnotation {
    // Sempre colors de paper (els del PDF): el mode fosc els adapta només en pintar-los a la pantalla
    const paper = commentColors(comment, false);
    const color = paper.text.startsWith('var(') ? DEFAULT_TEXT_COLOR : paper.text;
    const bgFill = paper.background.startsWith('var(') ? 'rgba(255,255,255,0.7)' : paper.background;
    return {
        id: newAnnotationId('ann'),
        type: 'text',
        text: comment.text,
        x: pos.x,
        y: pos.y,
        color,
        bgFill,
        fontSize,
        score: comment.score,
        commentBankId: comment.id,
    };
}

/** Anotació de text creada en arrossegar un comentari del banc sobre el document. */
export function droppedComment(comment: Partial<AnnotationComment> & { text: string }, pos: Point, fontSize: number): TextAnnotation {
    let color = DEFAULT_TEXT_COLOR;
    const mode = comment.colorMode || 'neutral';
    if (mode === 'score') color = comment.score !== undefined && comment.score > 0 ? '#10b981' : '#ef4444';
    else if (mode === 'custom' && comment.customColor) color = comment.customColor;
    return {
        id: newAnnotationId('text'),
        type: 'text',
        x: pos.x,
        y: pos.y,
        text: comment.text,
        color,
        fontSize,
        score: comment.score,
        commentBankId: comment.id,
    };
}

/**
 * En editar a mà els punts d'un fluorescent lligat a un preset, deixa de seguir el preset
 * (si no, el canvi no tindria cap efecte a la nota, que sempre llegeix els punts del preset).
 */
export function detachFromPreset(ann: HighlighterAnnotation, points: number | undefined): HighlighterAnnotation {
    const rest = { ...ann };
    delete rest.presetId;
    return { ...rest, points };
}
