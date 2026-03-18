export type ExerciseType = 'crop' | 'pages' | 'qr_code' | 'ocr_name' | 'total_score';

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
  scoringMode?: 'from_max' | 'from_zero'; // 'from_max' is default
  rubric?: RubricItem[]; // used when scoringMode === 'from_zero'
  stampX?: number; // Global stamp position override
  stampY?: number;
  stampScale?: number;
}

export interface CropExercise extends BaseExercise {
  type: 'crop';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PagesExercise extends BaseExercise {
  type: 'pages';
  pageIndexes: number[];
  spansTwoPages?: boolean;
}

export interface QrCodeRegion extends BaseExercise {
  type: 'qr_code';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrNameRegion extends BaseExercise {
  type: 'ocr_name';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  skipOcr?: boolean; // If true, only the image crop is saved, no text recognition is performed
}

export interface TotalScoreRegion extends BaseExercise {
  type: 'total_score';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ExerciseDef = CropExercise | PagesExercise | QrCodeRegion | OcrNameRegion | TotalScoreRegion;

export interface Student {
  id: string; // studentId from QR code
  name: string; // can default to studentId, or "Codi: studentId"
  email?: string; // Optional email for sending results
  originalOcrName?: string; // Experimental: Store the raw OCR result before fuzzy matching
  nameCropUrl?: string;     // Experimental: DataURL of the cropped name area
  pageIndexes: number[]; // Index array where pageIndexes[0] is the absolute PDF page for the student's exam page 1
  ignoredPageIndexes?: number[]; // Absolute PDF page indexes that are ignored
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
  width?: number; // optional width for wrapping/sizing
  height?: number; // optional height
  wrap?: 'word' | 'char' | 'none';
  text: string;
  color: string;
  fontSize: number;
  score?: number; // optional score contribution (from comment bank)
  bgFill?: string; // used for PDF layout summary text backgrounds
  fontWeight?: string; // used for PDF layout summary text weight
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle' | 'bottom';
  commentBankId?: string; // If set, links this annotation to an AnnotationComment.id (for cap grouping)
}

export type Annotation = PenAnnotation | HighlighterAnnotation | ImageAnnotation | TextAnnotation | HighlighterLegendAnnotation;

export type AnnotationStore = Record<string, Record<string, Annotation[]>>;

export interface AnnotationComment {
  id: string;           // Stable identifier for grouping linked TextAnnotations
  text: string;
  score?: number;
  colorMode?: 'neutral' | 'score' | 'custom';
  customColor?: string;
  exerciseId?: string; // If present, only shows up for this specific exercise
  capEnabled?: boolean; // If true, total contribution from this comment type is capped
  capTotal?: number;    // Cap value (negative = max penalty, positive = max bonus)
}

// [studentId][exerciseId][rubricItemId] = count applied
export type RubricCountStore = Record<string, Record<string, Record<string, number>>>;
