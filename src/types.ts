export type IVs = [number, number, number];
export type League = 'GL' | 'UL' | 'ML';
export type BaseStats = { atk: number; def: number; hp: number };
export type Ranking = {
  rank: number;
  score: number;
  moves: { name: string; elite: boolean; legacy: boolean }[];
  source: string;
};
export type Evolution = {
  to: string;
  kind: 'evolution' | 'temporary' | 'form' | 'fusion';
  requirements: string[];
  source: string;
  gender?: 'male' | 'female';
  eventOnly?: boolean;
  random?: boolean;
  highestIV?: 0 | 1 | 2;
  review?: boolean;
};
export type RaidRole = {
  tier: 'strong' | 'budget' | 'unverified';
  types: string[];
  evidence: string;
  source: string;
  reviewed: string;
  moves?: string[];
};
export type Species = {
  id: string;
  dex: number;
  name: string;
  aliases: string[];
  types: string[];
  baseStats: BaseStats | null;
  shadow: boolean;
  temporary: boolean;
  tradable: boolean | null;
  minLevel: number;
  eligible: Record<League, boolean>;
  rankings: Partial<Record<League, Ranking>>;
  evolutions: Evolution[];
  raid: RaidRole[];
  availability: { status: 'unverified' | 'documented'; note: string; source?: string };
  notes: string[];
  csv: {
    status: string;
    uses: string[];
    pvp: { league: League; targetId: string | null; rank: number; ideal: string }[];
    raidTargetId: string | null;
    raidLabel: string;
  } | null;
};
export type Source = {
  id: string;
  name: string;
  url: string;
  retrieved: string;
  commit?: string;
  date?: string;
  license?: string;
  files?: { path: string; sha256: string }[];
};
export type Catalog = {
  schema: 1;
  version: string;
  retrieved: string;
  calculatorVersion: string;
  sources: Source[];
  species: Species[];
  cpm: number[];
  counts: { forms: number; dexSpecies: number; additionalTargets: number };
  audit: {
    warnings: string[];
    missingStats: string[];
    missingEvolutionRules: string[];
    rejectedEdges: { from: string; to: string; reason: string }[];
    csvRankChanges: number;
    csvRaidClaims: number;
    unknownRelease: number;
  };
};
export type Settings = {
  maxLevel: number;
  bestBuddy: boolean;
  currentLevel?: number;
  floor: number;
  threshold: number;
  gender: 'unknown' | 'male' | 'female';
  eventPaths: boolean;
};
export type CollectionFlags = {
  shiny: boolean;
  costume: boolean;
  rare: boolean;
  sentimental: boolean;
  maxBattle: boolean;
  ordinaryExtra: boolean;
  alreadyTraded: boolean;
};
export type Reachable = {
  species: Species;
  path: string[];
  requirements: string[];
  conditional: boolean;
};
export type BattleStats = {
  level: number;
  cp: number;
  atk: number;
  def: number;
  hp: number;
  product: number;
};
export type RankedSpread = BattleStats & { ivs: IVs; rank: number; key: number };
export type Distribution = {
  poolSize: number;
  spreads: RankedSpread[];
  ideals: RankedSpread[];
  bestProduct: number;
};
export type IVResult = {
  stats: BattleStats | null;
  rank: number | null;
  percentile: number | null;
  idealPercent: number | null;
  poolSize: number;
  ideals: RankedSpread[];
  overCap: boolean;
  aboveMax: boolean;
  inPool: boolean;
  currentCP: number | null;
  reason?: string;
};
export type Option = Reachable & {
  key: string;
  role: League | 'Raid';
  ranking?: Ranking;
  raid?: RaidRole;
  result?: IVResult;
};
