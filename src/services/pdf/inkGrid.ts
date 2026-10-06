/**
 * Graella de tinta (C5) a partir de les pàgines pintades. La tinta és el que s'allunya del color de fons
 * (el més freqüent), de manera que surt igual amb les pàgines invertides del mode fosc.
 */
import type { InkGrid } from '../../domain/freeSpot';
import type { Size } from '../../domain/geometry';

/** Un tros del contingut: el rectangle (x, y, width, height) surt del canvas a partir del píxel (sx, sy), a escala 1. */
export interface InkSource {
    canvas: HTMLCanvasElement;
    sx: number;
    sy: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export const INK_CELL = 16;
const STEP = 2; // un píxel de cada 2×2 n'hi ha prou i és 4 vegades més ràpid
const INK_DISTANCE = 64;

export function inkGrid(sources: InkSource[], bounds: Size, cell = INK_CELL): InkGrid {
    const cols = Math.max(1, Math.ceil(bounds.width / cell)), rows = Math.max(1, Math.ceil(bounds.height / cell));
    const inkCount = new Float32Array(cols * rows), seen = new Float32Array(cols * rows);
    for (const s of sources) {
        const w = Math.round(s.width), h = Math.round(s.height);
        if (w <= 0 || h <= 0) continue;
        const data = s.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(Math.round(s.sx), Math.round(s.sy), w, h).data;
        const lum = (i: number) => (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        const hist = new Uint32Array(32);
        for (let y = 0; y < h; y += STEP * 4) for (let x = 0; x < w; x += STEP * 4) hist[Math.min(31, lum((y * w + x) * 4) >> 3)]++;
        const background = hist.indexOf(Math.max(...hist)) * 8 + 4;
        for (let y = 0; y < h; y += STEP) {
            const row = Math.floor((s.y + y) / cell);
            if (row < 0 || row >= rows) continue;
            for (let x = 0; x < w; x += STEP) {
                const col = Math.floor((s.x + x) / cell);
                if (col < 0 || col >= cols) continue;
                const k = row * cols + col;
                seen[k]++;
                if (Math.abs(lum((y * w + x) * 4) - background) > INK_DISTANCE) inkCount[k]++;
            }
        }
    }
    const ink = new Float32Array(cols * rows);
    for (let k = 0; k < ink.length; k++) ink[k] = seen[k] ? inkCount[k] / seen[k] : 1;
    return { cell, cols, rows, ink };
}
