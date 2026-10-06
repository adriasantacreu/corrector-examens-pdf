/**
 * Pinta l'informe de correcció (bloc C) amb pdf-lib, tot al navegador: pàgines A4 amb la capçalera, el resum i
 * el detall de cada exercici (`domain/report.ts`), seguides de l'examen corregit (el mateix que el «PDF corregit»).
 * Estètica `adria`: Noto Sans, blau fosc, taules amb filets, coma decimal.
 */
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import regularUrl from '../../assets/fonts/NotoSans-Regular.ttf?url';
import boldUrl from '../../assets/fonts/NotoSans-Bold.ttf?url';
import { formatNumber, formatPoints, type ReportExercise, type ReportModel, type Tone } from '../../domain/report';

const A4 = { width: 595.28, height: 841.89 };
const M = 48; // Marge
const W = A4.width - 2 * M;

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
    blue: hex('#194b87'),       // blaufosc d'adria.sty
    blueSoft: hex('#eaf1fb'),
    highlight: hex('#cfe0f5'),  // «fluorescent» sota els títols (\hlcurrent)
    text: hex('#1f2328'),
    muted: hex('#6b7280'),
    rule: hex('#9ca3af'),
    hair: hex('#e5e7eb'),
    track: hex('#eef0f3'),
    green: hex('#1a7f37'),
    greenSoft: hex('#e8f5ec'),
    amber: hex('#b7791f'),
    red: hex('#c81414'),
    redSoft: hex('#fdecec'),
};
const TONE: Record<Tone, RGB> = { full: C.green, partial: C.amber, zero: C.red };
const pointsColor = (p: number) => (p > 0 ? C.green : p < 0 ? C.red : C.muted);

interface Fonts { regular: PDFFont; bold: PDFFont }

let fontBytes: Promise<[ArrayBuffer, ArrayBuffer]> | null = null;
const loadFontBytes = () => (fontBytes ??= Promise.all([regularUrl, boldUrl].map(u => fetch(u).then(r => r.arrayBuffer()))) as Promise<[ArrayBuffer, ArrayBuffer]>);

// Símbols que Noto Sans no té: equivalent llegible en lloc d'un quadret buit
const FALLBACK: Record<string, string> = { '−': '–', '≤': '<=', '≥': '>=', '≠': '!=', '√': 'arrel ', '∞': 'infinit' };
const charsets = new WeakMap<PDFFont, Set<number>>();

/** Canvia els caràcters que la font no pot pintar (fórmules dels comentaris, emojis…). */
export function printable(text: string, font: PDFFont): string {
    let set = charsets.get(font);
    if (!set) charsets.set(font, set = new Set(font.getCharacterSet()));
    let out = '';
    for (const ch of text) {
        if (set.has(ch.codePointAt(0)!) || ch === '\n') out += ch;
        else out += [...(FALLBACK[ch] ?? '?')].every(c => set!.has(c.codePointAt(0)!)) ? (FALLBACK[ch] ?? '?') : '?';
    }
    return out;
}

/** Talla un text en línies que caben a `width` (per paraules; una paraula massa llarga es parteix). */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of printable(text, font).split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/).filter(Boolean)) {
            const next = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
            if (line) out.push(line);
            let rest = word;
            while (font.widthOfTextAtSize(rest, size) > width) {
                let n = rest.length - 1;
                while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
                out.push(rest.slice(0, n));
                rest = rest.slice(n);
            }
            line = rest;
        }
        out.push(line);
    }
    return out;
}

/** Cursor de maquetació: escriu de dalt a baix i obre pàgina nova quan no hi cap. */
class Layout {
    page!: PDFPage;
    y = 0;
    readonly pages: PDFPage[] = [];
    private doc: PDFDocument;
    readonly f: Fonts;
    constructor(doc: PDFDocument, f: Fonts) { this.doc = doc; this.f = f; this.newPage(); }

    newPage() {
        this.page = this.doc.addPage([A4.width, A4.height]);
        this.pages.push(this.page);
        this.y = A4.height - M;
    }
    ensure(h: number) { if (this.y - h < M + 24) this.newPage(); }

    text(s: string, x: number, size: number, o: { bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center'; width?: number } = {}) {
        const font = o.bold ? this.f.bold : this.f.regular;
        s = printable(s, font);
        const w = font.widthOfTextAtSize(s, size);
        const left = o.align === 'right' ? x - w : o.align === 'center' ? x + ((o.width ?? 0) - w) / 2 : x;
        this.page.drawText(s, { x: left, y: this.y, size, font, color: o.color ?? C.text });
        return w;
    }
    rule(thickness: number, color = C.rule, x = M, width = W) {
        this.page.drawRectangle({ x, y: this.y, width, height: thickness, color });
    }
    /** Títol de secció amb el «fluorescent» a sota, com `\parttitle` d'adria.sty. */
    section(title: string) {
        this.ensure(48);
        this.y -= 26;
        const size = 13;
        const w = this.f.bold.widthOfTextAtSize(title, size);
        this.page.drawRectangle({ x: M - 3, y: this.y - 3, width: w + 6, height: 9, color: C.highlight });
        this.text(title, M, size, { bold: true, color: C.blue });
        this.y -= 14;
    }
}

function header(L: Layout, r: ReportModel) {
    const { page } = L;
    L.text('INFORME DE CORRECCIÓ', M, 8.5, { bold: true, color: C.blue });
    L.text(r.date, A4.width - M, 8.5, { color: C.muted, align: 'right' });
    L.y -= 30;
    for (const line of wrapText(r.title || 'Examen', L.f.bold, 22, W - 150).slice(0, 2)) {
        L.text(line, M, 22, { bold: true, color: C.blue });
        L.y -= 27;
    }
    const afterTitle = L.y + 27;

    // Targeta de la nota final, a la dreta
    const card = { w: 132, h: 74 };
    const top = A4.height - M - 22;
    const soft = r.pass ? C.greenSoft : C.redSoft;
    const tone = r.pass ? C.green : C.red;
    page.drawRectangle({ x: A4.width - M - card.w, y: top - card.h, width: card.w, height: card.h, color: soft, borderColor: tone, borderWidth: 1.2, opacity: 1 });
    const saveY = L.y;
    L.y = top - 18;
    L.text('NOTA FINAL', A4.width - M - card.w, 8, { bold: true, color: tone, align: 'center', width: card.w });
    L.y = top - 54;
    const big = formatNumber(r.score);
    const of = ` / ${formatNumber(r.max)}`;
    const wBig = L.f.bold.widthOfTextAtSize(big, 30);
    const wOf = L.f.regular.widthOfTextAtSize(of, 12);
    const x0 = A4.width - M - card.w + (card.w - wBig - wOf) / 2;
    L.text(big, x0, 30, { bold: true, color: tone });
    L.text(of, x0 + wBig, 12, { color: C.muted });
    // L'alumne, alineat a baix amb la targeta (o sota el títol si és de dues línies)
    L.y = Math.min(saveY, afterTitle - 34, top - card.h + 24);
    L.text('ALUMNE/A', M, 8, { bold: true, color: C.muted });
    L.y -= 20;
    L.text(r.student, M, 15, { bold: true });
    L.y = Math.min(L.y, top - card.h) - 14;
    L.rule(0.6, C.hair);
}

function summary(L: Layout, r: ReportModel) {
    L.section('Resum');
    const colPts = M + W - 70, colMax = M + W, bar = { x: M + W * 0.52, w: W * 0.26 };
    L.rule(1.1, C.text);
    L.y -= 14;
    L.text('Exercici', M, 9.5, { bold: true });
    L.text('Punts', colPts, 9.5, { bold: true, align: 'right' });
    L.text('Màxim', colMax, 9.5, { bold: true, align: 'right' });
    L.y -= 7;
    L.rule(0.5);
    for (const ex of r.exercises) {
        L.ensure(24);
        L.y -= 17;
        const title = wrapText(ex.title, L.f.regular, 10, bar.x - M - 12)[0];
        L.text(title + (title === ex.title ? '' : '…'), M, 10);
        // Barra de progrés de l'exercici
        L.page.drawRectangle({ x: bar.x, y: L.y + 1, width: bar.w, height: 6, color: C.track });
        if (ex.max > 0) L.page.drawRectangle({ x: bar.x, y: L.y + 1, width: bar.w * Math.max(0, Math.min(1, ex.score / ex.max)), height: 6, color: TONE[ex.tone] });
        L.text(formatNumber(ex.score), colPts, 10, { bold: true, color: TONE[ex.tone], align: 'right' });
        L.text(formatNumber(ex.max), colMax, 10, { color: C.muted, align: 'right' });
        L.y -= 6;
        L.rule(0.4, C.hair);
    }
    L.y -= 1;
    L.rule(0.5);
    L.y -= 16;
    L.text('Total', M, 10.5, { bold: true });
    L.text(formatNumber(r.score), colPts, 10.5, { bold: true, color: r.pass ? C.green : C.red, align: 'right' });
    L.text(formatNumber(r.max), colMax, 10.5, { bold: true, align: 'right' });
    L.y -= 7;
    L.rule(1.1, C.text);
}

const KIND_LABEL: Record<string, string> = { rubric: 'Rúbrica', highlight: 'Marca', comment: 'Comentari' };

function exerciseDetail(L: Layout, ex: ReportExercise) {
    const lineH = 14;
    L.ensure(52 + Math.min(ex.rows.length, 3) * lineH);
    L.y -= 28;
    // Capçalera de l'exercici en una franja suau
    L.page.drawRectangle({ x: M, y: L.y - 6, width: W, height: 20, color: C.blueSoft });
    L.page.drawRectangle({ x: M, y: L.y - 6, width: 3, height: 20, color: TONE[ex.tone] });
    const score = `${formatNumber(ex.score)} / ${formatNumber(ex.max)}`;
    const scoreW = L.f.bold.widthOfTextAtSize(score, 10.5);
    const title = wrapText(ex.title, L.f.bold, 10.5, W - scoreW - 40)[0];
    L.text(title, M + 10, 10.5, { bold: true, color: C.blue });
    L.text(score, M + W - 8, 10.5, { bold: true, color: TONE[ex.tone], align: 'right' });
    L.y -= 10;

    if (!ex.rows.length && !ex.notes.length) {
        L.y -= lineH;
        L.text(ex.score >= ex.max ? 'Tot correcte.' : 'Sense observacions.', M + 10, 9.5, { color: C.muted });
        return;
    }
    const labelX = M + 70, labelW = W - 70 - 60;
    for (const row of ex.rows) {
        const lines = wrapText(row.label + (row.count > 1 ? `  ×${row.count}` : ''), L.f.regular, 9.5, labelW);
        L.ensure(lines.length * 12 + 6);
        L.y -= lineH;
        L.text(KIND_LABEL[row.kind], M + 10, 8, { color: C.muted });
        L.text(formatPoints(row.points), M + W - 8, 9.5, { bold: true, color: pointsColor(row.points), align: 'right' });
        lines.forEach((ln, i) => { if (i) L.y -= 12; L.text(ln, labelX, 9.5); });
    }
    if (ex.notes.length) {
        const lines = wrapText(ex.notes.map(n => `«${n}»`).join('  ·  '), L.f.regular, 9, labelW);
        L.ensure(lines.length * 12 + 6);
        L.y -= lineH;
        L.text('Comentaris', M + 10, 8, { color: C.muted });
        lines.forEach((ln, i) => { if (i) L.y -= 12; L.text(ln, labelX, 9, { color: C.muted }); });
    }
}

function footers(L: Layout, firstPage: number, total: number) {
    L.pages.forEach((page, i) => {
        page.drawText('FlowGrading', { x: M, y: 26, size: 7.5, font: L.f.regular, color: C.muted });
        const n = String(firstPage + i);
        const label = `${n} / ${total}`;
        const w = L.f.bold.widthOfTextAtSize(label, 7.5);
        page.drawText(label, { x: A4.width - M - w, y: 26, size: 7.5, font: L.f.bold, color: C.muted });
    });
}

/** Pàgines de l'informe + examen corregit (cada pàgina escalada a A4). */
export async function buildReportPdf(model: ReportModel, correctedPdf: Blob | null): Promise<Blob> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const [reg, bold] = await loadFontBytes();
    const f: Fonts = { regular: await doc.embedFont(reg, { subset: true }), bold: await doc.embedFont(bold, { subset: true }) };
    doc.setTitle(`Informe de correcció · ${model.student}`);
    doc.setCreator('FlowGrading');

    const L = new Layout(doc, f);
    header(L, model);
    summary(L, model);
    L.section('Detall per exercici');
    for (const ex of model.exercises) exerciseDetail(L, ex);

    if (correctedPdf) {
        const src = await PDFDocument.load(await correctedPdf.arrayBuffer());
        const embedded = await doc.embedPages(src.getPages());
        for (const ep of embedded) {
            const page = doc.addPage([A4.width, A4.height]);
            const s = Math.min(A4.width / ep.width, A4.height / ep.height);
            page.drawPage(ep, { x: (A4.width - ep.width * s) / 2, y: (A4.height - ep.height * s) / 2, xScale: s, yScale: s });
        }
    }
    footers(L, 1, L.pages.length);
    return new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' });
}
