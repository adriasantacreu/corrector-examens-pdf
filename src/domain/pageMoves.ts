/**
 * Operacions de l'organitzador de pàgines: moure pàgines entre alumnes, en cascada o d'una en una.
 * Són funcions pures (no modifiquen l'entrada) i es poden provar sense interfície.
 */
import type { Student } from '../types';

const clone = (groups: Student[]) => groups.map(g => ({ ...g, pageIndexes: [...g.pageIndexes] }));

/** Cascada avall: l'última pàgina de cada alumne (des de `from`) passa a ser la primera del següent. */
export function ripplePushForward(groups: Student[], from: number): Student[] {
    const next = clone(groups);
    for (let i = from; i < next.length - 1; i++) {
        const page = next[i].pageIndexes.pop();
        if (page !== undefined) next[i + 1].pageIndexes.unshift(page);
    }
    return next;
}

/** Cascada amunt: la primera pàgina de cada alumne (des de `from + 1`) passa al final de l'anterior. */
export function ripplePullBackward(groups: Student[], from: number): Student[] {
    const next = clone(groups);
    for (let i = from; i < next.length - 1; i++) {
        if (!next[i + 1].pageIndexes.length) break;
        next[i].pageIndexes.push(next[i + 1].pageIndexes.shift()!);
    }
    return next;
}

export function shiftOneDown(groups: Student[], gi: number): Student[] {
    if (gi >= groups.length - 1 || !groups[gi].pageIndexes.length) return groups;
    const next = clone(groups);
    next[gi + 1].pageIndexes.unshift(next[gi].pageIndexes.pop()!);
    return next;
}

export function shiftOneUp(groups: Student[], gi: number): Student[] {
    if (gi <= 0 || !groups[gi].pageIndexes.length) return groups;
    const next = clone(groups);
    next[gi - 1].pageIndexes.push(next[gi].pageIndexes.shift()!);
    return next;
}

export function removePage(groups: Student[], gi: number, pi: number): Student[] {
    const next = clone(groups);
    const [removed] = next[gi].pageIndexes.splice(pi, 1);
    next[gi].ignoredPageIndexes = (next[gi].ignoredPageIndexes ?? []).filter(p => p !== removed);
    return next;
}

export function swapPages(groups: Student[], gi: number, a: number, b: number): Student[] {
    const next = clone(groups);
    const pages = next[gi].pageIndexes;
    [pages[a], pages[b]] = [pages[b], pages[a]];
    return next;
}

export function toggleIgnoredPage(groups: Student[], gi: number, page: number): Student[] {
    return groups.map((g, i) => {
        if (i !== gi) return g;
        const ignored = g.ignoredPageIndexes ?? [];
        return { ...g, ignoredPageIndexes: ignored.includes(page) ? ignored.filter(p => p !== page) : [...ignored, page] };
    });
}

export function moveGroup(groups: Student[], idx: number, delta: -1 | 1): Student[] {
    const target = idx + delta;
    if (target < 0 || target >= groups.length) return groups;
    const next = [...groups];
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
}

export type PageSource = number | 'solution';

/**
 * Arrossegar una pàgina d'un alumne (o del solucionari) a un altre: es treu de l'origen i s'afegeix al final
 * del destí, en una sola actualització (abans es feia en dos passos amb un setTimeout).
 */
export function movePage(
    groups: Student[], solution: number[], from: PageSource, fromIndex: number, to: PageSource,
): { groups: Student[]; solution: number[] } {
    if (from === to) return { groups, solution };
    const nextGroups = clone(groups);
    const nextSolution = [...solution];
    const page = from === 'solution' ? nextSolution.splice(fromIndex, 1)[0] : nextGroups[from].pageIndexes.splice(fromIndex, 1)[0];
    if (page === undefined) return { groups, solution };
    if (from !== 'solution') {
        nextGroups[from].ignoredPageIndexes = (nextGroups[from].ignoredPageIndexes ?? []).filter(p => p !== page);
    }
    if (to === 'solution') nextSolution.push(page);
    else nextGroups[to].pageIndexes.push(page);
    return { groups: nextGroups, solution: nextSolution };
}

/**
 * Ordre en què es carreguen les miniatures: primer la pàgina 1 de tots els alumnes, després l'última,
 * després la 2... (així l'usuari veu de seguida les portades i els finals, que és on hi ha errors d'ordre).
 */
export function thumbnailOrder(groups: Student[], pagesPerExam: number, totalPages: number): number[] {
    const order: number[] = [];
    const seen = new Set<number>();
    const add = (p: number | undefined) => { if (p && !seen.has(p)) { seen.add(p); order.push(p); } };
    for (let p = 0; p < pagesPerExam; p++) {
        groups.forEach(g => add(g.pageIndexes[p]));
        const last = pagesPerExam - 1 - p;
        if (last > p) groups.forEach(g => add(g.pageIndexes[last]));
    }
    for (let i = 1; i <= totalPages; i++) add(i);
    return order;
}
