export type ScanFrameInput = {
  id: string;
  imageBase64: string;
  mimeType: string;
};

export type AppraisalGender = 'male' | 'female' | 'unknown';
export type AppraisalConfidence = 'high' | 'medium' | 'low';

export type AppraisalReading = {
  id: string;
  readable: boolean;
  reason: string | null;
  speciesName: string | null;
  formHints: string[];
  attackIv: number | null;
  defenseIv: number | null;
  hpIv: number | null;
  cp: number | null;
  hp: number | null;
  gender: AppraisalGender;
  isShadow: boolean;
  isShiny: boolean;
  isCostume: boolean;
  isTraded: boolean;
  isMaxBattle: boolean;
  confidence: AppraisalConfidence;
  uncertainFields: string[];
};

export type ScanAppraisalResponse = {
  results: AppraisalReading[];
};
