import { Client } from "@gradio/client";
import { MosaicGenerator } from './mosaicGenerator';

const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || '';
const SPACE_ID = "adriasantacreu/ocr-noms-alumnes";

/**
 * Performs a batch OCR on a list of images using a Hugging Face Space via Gradio Client.
 * @param imageUrls List of data URLs for the images to process.
 * @param studentNames List of possible student names to match against.
 * @returns A mapping of index (1-based) to identified student name.
 */
export async function processBatchOCR(
    imageUrls: string[],
    studentNames: string[]
): Promise<Record<string, string>> {
    if (imageUrls.length === 0) return {};

    try {
        const mosaic = new MosaicGenerator();
        for (const url of imageUrls) {
            await mosaic.addImage(url);
        }

        const blob = await mosaic.generateBlob();
        const file = new File([blob], "mosaic.jpg", { type: "image/jpeg" });

        console.log('[OCR DEBUG] Connecting to Gradio Space...');
        const app = await Client.connect(SPACE_ID, {
            token: HF_TOKEN as any
        });

        const context = studentNames.length > 0 ? studentNames.join(", ") : "No disponible (fia't del teu criteri visual)";
        
        console.log('[OCR DEBUG] Submitting to IA (Waiting for result)...');

        // New Gradio Client API: app.predict returns a promise with the result directly
        const result: any = await app.predict("/ocr_mosaic_qwen35", [
            file,
            context,
        ]);

        console.log('[OCR DEBUG] IA Response received:', result);

        if (result && result.data && result.data[0]) {
            try {
                const parsed = JSON.parse(result.data[0] as string);
                return parsed;
            } catch (e) {
                console.error('[OCR DEBUG] JSON Parse Error:', result.data[0]);
                throw new Error("Failed to parse IA response: " + result.data[0]);
            }
        }

        throw new Error("No data returned from HF Space");
    } catch (err) {
        console.error('Batch OCR via Gradio failed:', err);
        throw err;
    }
}
