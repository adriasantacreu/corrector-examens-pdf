import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { openCorrectionAt, openDemo, openSession, SESSIONS } from './helpers';

/** Informe de correcció (bloc C): diu el mateix que la pantalla i el format triat es recorda. */

const num = (s: string) => Number(s.replace(',', '.'));

async function pdfText(path: string) {
    const doc = await getDocument({ data: new Uint8Array(await readFile(path)) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const content = await doc.getPage(i).then(p => p.getTextContent());
        pages.push(content.items.map(it => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' '));
    }
    return { pages, numPages: doc.numPages };
}

test("l'informe d'un alumne té les notes de la pantalla i l'examen corregit al darrere", async ({ page }) => {
    await openDemo(page);
    await openCorrectionAt(page, 1); // Laia: exercici 1 amb fluorescent i comentari
    const [shown] = (await page.getByTestId('nota-exercici').innerText()).replace(/\s+/g, ' ').trim().split(' / ');

    await page.getByRole('button', { name: 'Finalitzar' }).click();
    await expect(page.getByText('Resultats i Exportació')).toBeVisible();
    const finalShown = num(await page.getByTestId('nota-alumne').first().innerText());

    await page.getByTestId('export-format').selectOption('report');
    await expect(page.getByRole('button', { name: 'Baixar tots els informes' })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTitle('Baixar informe').first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('informe_Laia_Puig_Serra.pdf');

    await download.saveAs(test.info().outputPath('informe.pdf')); // per revisar-lo a mà
    const { pages, numPages } = await pdfText((await download.path())!);
    const first = pages[0];
    expect(first).toContain('INFORME DE CORRECCIÓ');
    expect(first).toContain('Laia Puig Serra');
    expect(first).toContain('Exercici 1 — Producte i determinant');
    // Nota final: la de Resultats
    const final = first.match(/NOTA FINAL ([\d,]+) \/ 10/);
    expect(final, first).not.toBeNull();
    expect(num(final![1])).toBeCloseTo(finalShown, 2);
    // Nota de l'exercici 1 (resum i detall): la del corrector
    const ex1 = first.match(/Exercici 1 — Producte i determinant ([\d,]+) \/ ([\d,]+)/);
    expect(ex1, first).not.toBeNull();
    expect(num(ex1![1])).toBeCloseTo(num(shown), 2);
    // Les pàgines corregides (imatges, sense text) van al darrere
    expect(numPages).toBeGreaterThan(1);

    // La tria es recorda en tornar a la sessió
    await page.waitForTimeout(1500);
    await page.goto('/');
    await openSession(page, SESSIONS.correction);
    await expect(page.getByTestId('export-format')).toHaveValue('report');
});
