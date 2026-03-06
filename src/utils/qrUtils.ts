import jsQR from "jsqr";
import type { PDFDocumentProxy } from "./pdfUtils";
import { renderPDFPageToCanvas } from "./pdfUtils";

export interface ParsedQR {
    studentId: string;
    pageNum: number;
}

/**
 * Parses a QR string like "M4E01-01" into its parts.
 */
export function parseQRString(qrText: string): ParsedQR | null {
    if (!qrText || typeof qrText !== 'string') return null;
    qrText = qrText.trim();

    // We expect a format like [StudentCode]-[PageNumber]. 
    // Wait, the user said they use things like "M4E01-13" or "M4E22-13" (where 13 is the page).
    // Let's use a regex that captures everything before the last dash as StudentID and the last part as a number.
    const match = qrText.match(/^(.*)-(\d+)$/);
    if (match) {
        return {
            studentId: match[1],
            pageNum: parseInt(match[2], 10)
        };
    }

    // Fallback if no dash is found but we still want to read something out of it
    // It's technically invalid for our exact spec, but we might just return the whole text as ID and page 1
    return null;
}

/**
 * Renders a PDF page to a canvas and uses jsQR to find a QR code.
 * If a region is provided, it only scans that specific area.
 */
export async function scanQRCode(
    pdfDoc: PDFDocumentProxy,
    pageIndex: number,
    region?: { x: number, y: number, width: number, height: number }
): Promise<ParsedQR | null> {
    const scale = 2.5; // Must match TemplateDefiner and pdfExport scale to keep coordinates aligned
    try {
        const fullCanvas = document.createElement("canvas");
        const dims = await renderPDFPageToCanvas(pdfDoc, pageIndex, fullCanvas, scale);

        if (!dims) return null;

        let scanX = 0, scanY = 0, scanW = dims.width, scanH = dims.height;

        if (region) {
            scanX = region.x;
            scanY = region.y;
            scanW = region.width;
            scanH = region.height;
        } else {
            // Fallback: bottom half of the page
            scanY = Math.floor(dims.height / 2);
            scanH = Math.floor(dims.height / 2);
        }

        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = scanW;
        cropCanvas.height = scanH;
        const ctx = cropCanvas.getContext("2d");
        if (!ctx) return null;

        // PDF is transparent, fill white so QR code has contrast
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, scanW, scanH);

        // Draw ONLY the target region
        ctx.drawImage(
            fullCanvas,
            scanX, scanY, scanW, scanH,
            0, 0, scanW, scanH
        );

        const imageData = ctx.getImageData(0, 0, scanW, scanH);

        // Use jsQR
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert" // standard exams are black QR on white paper
        });

        if (code && code.data) {
            console.log(`Page ${pageIndex} QR detected:`, code.data);
            return parseQRString(code.data);
        }

        return null;
    } catch (err) {
        console.error(`Failed to scan QR code on page ${pageIndex}:`, err);
        return null;
    }
}
