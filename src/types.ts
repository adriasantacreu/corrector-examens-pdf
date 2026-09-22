export type ExerciseType = 'crop' | 'pages' | 'qr_code' | 'ocr_name' | 'total_score';

export type ScoringMode = 'from_max' | 'from_zero';

export interface RubricItem {
  id: string;
  label: string;
  points: number; // positive or negative
}

export interface BaseExercise {
  id: string;
  type: ExerciseType;
  label?: string;
  name?: string;
  maxScore?: number;
  scoringMode?: ScoringMode; // 'from_max' is default
  rubric?: RubricItem[];
  autoDistribute?: boolean; // Repartir la nota màxima entre els criteris de la rúbrica
  aiInstructions?: string;  // Indicacions per a la precorrecció amb IA (enunciat, solució, criteris...)
  stampX?: number; // Global stamp position override
  stampY?: number;
  stampScale?: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropExercise extends BaseExercise, Rect {
  type: 'crop';
  pageIndex: number;
}

export interface PagesExercise extends BaseExercise {
  type: 'pages';
  pageIndexes: number[];
  spansTwoPages?: boolean;
}

export interface QrCodeRegion extends BaseExercise, Rect {
  type: 'qr_code';
  pageIndex: number;
}

export interface OcrNameRegion extends BaseExercise, Rect {
  type: 'ocr_name';
  pageIndex: number;
  skipOcr?: boolean; // If true, only the image crop is saved, no text recognition is performed
}

export interface TotalScoreRegion extends BaseExercise, Rect {
  type: 'total_score';
  pageIndex: number;
}

export type RegionExercise = CropExercise | QrCodeRegion | OcrNameRegion | TotalScoreRegion;
export type GradableExercise = CropExercise | PagesExercise;
export type ExerciseDef = CropExercise | PagesExercise | QrCodeRegion | OcrNameRegion | TotalScoreRegion;

export interface Student {
  id: string;
  name: string;
  email?: string;
  originalOcrName?: string;
  nameCropUrl?: string;
  pageIndexes: number[]; // Pàgines absolutes (base 1). pageIndexes[0] és la pàgina 1 de l'examen de l'alumne
  ignoredPageIndexes?: number[]; // Pàgines absolutes marcades com a buides
}

export type ToolType = 'select' | 'pen' | 'highlighter' | 'text' | 'eraser';
export type PenColor = string;

export interface PenAnnotation {
  id: string;
  type: 'pen';
  points: number[];
  color: string;
  strokeWidth: number;
  opacity?: number; // 0-1, defaults to 1
}

export interface PresetHighlighter {
  id: string;
  label: string;
  color: string;
  points: number;
  exerciseId?: string; // If present, only shows up for this specific exercise
  capEnabled?: boolean; // If true, total contribution from this preset is capped
  capTotal?: number;    // Cap value (negative = max penalty, positive = max bonus)
}

export interface HighlighterAnnotation {
  id: string;
  type: 'highlighter';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  presetId?: string;
  points?: number;
  label?: string;
  fontSize?: number;
  labelOffsetX?: number;
  labelOffsetY?: number;
}

export interface HighlighterLegendAnnotation {
  id: string;
  type: 'highlighter_legend';
  x: number;
  y: number;
  scale?: number;
}

export interface ImageAnnotation {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface TextAnnotation {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  wrap?: 'word' | 'char' | 'none';
  text: string;
  color: string;
  fontSize: number;
  score?: number; // optional score contribution (from comment bank)
  bgFill?: string;
  fontWeight?: string;
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle' | 'bottom';
  commentBankId?: string; // If set, links this annotation to an AnnotationComment.id (for cap grouping)
}

export type Annotation = PenAnnotation | HighlighterAnnotation | ImageAnnotation | TextAnnotation | HighlighterLegendAnnotation;

/** [studentId][exerciseId] = anotacions */
export type AnnotationStore = Record<string, Record<string, Annotation[]>>;

export interface AnnotationComment {
  id: string;
  text: string;
  score?: number;
  colorMode?: 'neutral' | 'score' | 'custom';
  customColor?: string;
  exerciseId?: string; // If present, only shows up for this specific exercise
  capEnabled?: boolean;
  capTotal?: number;
}

/** [studentId][exerciseId][rubricItemId] = vegades aplicat */
export type RubricCountStore = Record<string, Record<string, Record<string, number>>>;

/** Alumne tal com el retorna l'API de Classroom (només els camps que fem servir). */
export interface ClassroomStudent {
  userId?: string;
  profile?: {
    name?: { fullName?: string };
    emailAddress?: string;
  };
}

export interface ClassroomCourse {
  id: string;
  name: string;
}

/** Proposta de correcció generada per la IA per a un alumne i un exercici. */
export interface AiSuggestion {
  rubricCounts: Record<string, number>;
  comment: string;
  confidence?: number; // 0-1
  suggestedScore?: number; // Només informatiu quan l'exercici no té rúbrica
  model: string;
  createdAt: string;
  status: 'pending' | 'applied' | 'dismissed' | 'error';
  error?: string;
}

/** [studentId][exerciseId] = proposta */
export type AiSuggestionStore = Record<string, Record<string, AiSuggestion>>;

export type AppMode = 'upload' | 'setup' | 'organize_pages' | 'configure_crops' | 'correction' | 'results';

export type ThemeMode = 'light' | 'dark';
