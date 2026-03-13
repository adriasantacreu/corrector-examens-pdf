import { MosaicGenerator } from './mosaicGenerator';

/**
 * Funció auxiliar per convertir el Blob de la imatge a Base64
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * Performs a batch OCR on a list of images using Groq API.
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

        const mosaicBlob = await mosaic.generateBlob();
        
        console.log("[OCR DEBUG] Preparant la imatge per a Groq...");
        const base64Image = await blobToBase64(mosaicBlob);
        
        const contextText = studentNames.length > 0 
            ? `Llista d'alumnes vàlids: ${studentNames.join(", ")}.` 
            : "No hi ha llista de referència.";
            
        const prompt = `Ets un expert en lectura de noms manuscrits. Analitza el mosaic d'imatges numerades. ${contextText} Identifica cada nom i retorna un objecte JSON on les claus són els números i els valors els noms.`;

        console.log("[OCR DEBUG] Enviant petició a Groq (Llama 4 Scout)...");

        const response = await fetch("/api/groq", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: base64Image } }
                        ]
                    }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1,
                max_completion_tokens: 2048
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error de Groq: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const resultText = data.choices[0].message.content;
        
        console.log("[OCR DEBUG] Resposta de Groq rebuda:", resultText);
        return JSON.parse(resultText);

    } catch (error) {
        console.error("[OCR DEBUG] Error processant amb Groq:", error);
        throw error;
    }
}
