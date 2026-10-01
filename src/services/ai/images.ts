/** Utilitats per preparar imatges abans d'enviar-les a la IA (mida i pes controlats). */

export async function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No s\'ha pogut carregar la imatge'));
        img.src = src;
    });
}

/** Redueix un canvas o imatge perquè el costat llarg no passi de `maxSide` i el retorna com a JPEG. */
export function toJpegDataUrl(source: HTMLCanvasElement | HTMLImageElement, maxSide = 1600, quality = 0.85): string {
    const w = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
    const h = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
}

export async function shrinkDataUrl(dataUrl: string, maxSide = 1600, quality = 0.85): Promise<string> {
    return toJpegDataUrl(await loadImage(dataUrl), maxSide, quality);
}
