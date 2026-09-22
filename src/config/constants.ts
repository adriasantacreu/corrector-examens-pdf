/**
 * Constants compartides per tota l'app. Cap mòdul hauria de repetir aquests valors.
 */

/** Escala amb què es rasteritzen les pàgines del PDF. Totes les coordenades de retalls i anotacions hi van lligades. */
export const RENDER_SCALE = 2.5;

/** Factor de les mides de lletra de les anotacions (punts → coordenades d'alta resolució). */
export const FONT_SCALE = 2.5;

/** Separació vertical/horitzontal (en coordenades de document) entre pàgines d'un exercici de tipus "pàgines". */
export const PAGE_GAP = 20;

/** Nota màxima que s'assumeix quan un exercici antic no en té cap de definida. */
export const DEFAULT_EXERCISE_MAX_SCORE = 10;

export const STORAGE_KEYS = {
    sessionPrefix: 'flowgrading_session_',
    global: 'flowgrading_global',
    lastTool: 'correction-last-tool',
    lastPenColor: 'correction-last-pen-color',
    lastHighlighterColor: 'correction-last-h-color',
    lastPenWidth: 'correction-last-pen-width',
    lastPenOpacity: 'correction-last-pen-opacity',
    emailTemplate: 'flowgrading_email_template',
} as const;

export const GOOGLE_OAUTH = {
    localClientId: '89755629853-3i114l0ocgkpv5cla6d86n8ufuammvii.apps.googleusercontent.com',
    productionClientId: '89755629853-b6o9a5052s8t84bu3nahath37itesf3l.apps.googleusercontent.com',
    scopes: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.rosters.readonly',
        'https://www.googleapis.com/auth/classroom.profile.emails',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/drive.appdata',
    ],
} as const;

/**
 * Model de visió per defecte. El servidor (api/groq.ts) el pot substituir amb la variable GROQ_VISION_MODEL,
 * de manera que quan Groq retiri un model n'hi ha prou de canviar la variable d'entorn.
 */
export const AI_VISION_MODEL = 'qwen/qwen3.8-27b';
export const AI_ENDPOINT = '/api/groq';

/** Colors de boli (i les tecles de drecera corresponents) de la barra d'eines del corrector. */
export const PEN_PALETTE: { color: string; key: string }[] = [
    { color: '#ef4444', key: 'Q' },
    { color: '#10b981', key: 'W' },
    { color: '#3b82f6', key: 'E' },
    { color: '#f59e0b', key: 'R' },
    { color: '#8b5cf6', key: 'A' },
    { color: '#000000', key: 'S' },
];

export const DEFAULT_PRESETS = [
    { id: 'h1', label: 'Error Procediment', color: 'rgba(239, 68, 68, 0.4)', points: -0.5 },
    { id: 'h2', label: 'Error Càlcul', color: 'rgba(249, 115, 22, 0.4)', points: -0.25 },
    { id: 'h3', label: 'Concepte Erroni', color: 'rgba(225, 29, 72, 0.4)', points: -1.0 },
];

export const DEFAULT_COMMENT_BANK = [
    { id: 'cb_default1', text: 'Excel·lent!', score: 1, colorMode: 'score' as const },
    { id: 'cb_default2', text: 'Molt bé', score: 0.5, colorMode: 'score' as const },
    { id: 'cb_default3', text: 'Revisa aquest concepte', score: -0.5, colorMode: 'neutral' as const },
    { id: 'cb_default4', text: 'Falta justificar la resposta', score: -1, colorMode: 'neutral' as const },
];
