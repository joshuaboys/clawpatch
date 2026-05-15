import { FeatureRecord, TrustBoundary } from "../types.js";

export type FeatureSeed = {
  title: string;
  summary: string;
  kind: FeatureRecord["kind"];
  source: string;
  confidence: FeatureRecord["confidence"];
  entryPath: string;
  symbol: string | null;
  route: string | null;
  command: string | null;
  tags: string[];
  trustBoundaries: TrustBoundary[];
  testCommand?: string | null;
  testPrefixes?: string[];
};

export type FeatureMapper = {
  name: string;
  map(root: string): Promise<FeatureSeed[]>;
};
