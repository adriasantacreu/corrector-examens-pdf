import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** La icona i les fonts no han de dependre de les fonts instal·lades a l'ordinador de qui obre l'app. */
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
    it('la «fg» de la icona és un traçat, no un text amb la cursiva del sistema', () => {
        const icon = /<link rel="icon"[^>]*href="([^"]+)"/.exec(html)![1];
        expect(icon).toContain('<path');
        expect(icon).not.toMatch(/<text|font-family/);
    });

    it('Caveat es carrega amb tot el rang de gruixos que fa servir el logo', () => {
        expect(html).toContain('family=Caveat:wght@400..700');
    });
});
