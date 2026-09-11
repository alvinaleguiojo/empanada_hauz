export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  language: string | null;
  languageProbability: number | null;
  duration: number | null;
  segments: TranscriptionSegment[];
  model: string;
}
