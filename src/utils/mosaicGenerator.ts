/**
 * MosaicGenerator handles the stitching of multiple small images into a single grid mosaic.
 * This is used to batch multiple OCR requests into a single API call.
 */
export class MosaicGenerator {
    private images: HTMLImageElement[] = [];
    private cellWidth: number;
    private cellHeight: number;
    private columns: number;
    private padding: number;

    constructor(cellWidth: number = 200, cellHeight: number = 50, columns: number = 5, padding: number = 10) {
        this.cellWidth = cellWidth;
        this.cellHeight = cellHeight;
        this.columns = columns;
        this.padding = padding;
    }

    /**
     * Adds an image to the mosaic.
     * @param dataUrl The image data URL.
     */
    async addImage(dataUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images.push(img);
                resolve();
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    /**
     * Generates the mosaic canvas.
     * @returns A canvas containing the grid of images.
     */
    generateCanvas(): HTMLCanvasElement {
        const rows = Math.ceil(this.images.length / this.columns);
        const totalWidth = this.columns * (this.cellWidth + this.padding) + this.padding;
        const totalHeight = rows * (this.cellHeight + this.padding) + this.padding;

        const canvas = document.createElement('canvas');
        canvas.width = totalWidth;
        canvas.height = totalHeight;
        const ctx = canvas.getContext('2d')!;

        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        this.images.forEach((img, index) => {
            const col = index % this.columns;
            const row = Math.floor(index / this.columns);

            const x = this.padding + col * (this.cellWidth + this.padding);
            const y = this.padding + row * (this.cellHeight + this.padding);

            // Draw image scaled to cell size if necessary, but maintaining white space around
            ctx.drawImage(img, x, y, this.cellWidth, this.cellHeight);

            // Draw index number for visual identification (as suggested in the plan)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.font = '10px Arial';
            ctx.fillText((index + 1).toString(), x + 2, y + 10);
            
            // Draw border around cell
            ctx.strokeStyle = '#eeeeee';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, this.cellWidth, this.cellHeight);
        });

        return canvas;
    }

    /**
     * Generates a Blob from the mosaic.
     * @param quality Image quality (0-1).
     * @returns A Promise resolving to a Blob.
     */
    async generateBlob(quality: number = 0.85): Promise<Blob> {
        const canvas = this.generateCanvas();
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to generate mosaic blob'));
            }, 'image/jpeg', quality);
        });
    }
}
