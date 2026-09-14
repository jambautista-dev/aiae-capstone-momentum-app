import associateConsultant from "./levels/associate-consultant-export.json";
import consultant from "./levels/consultant-export.json";
import seniorConsultant from "./levels/senior-consultant-export.json";
import principal from "./levels/principal-export.json";
import seniorPrincipal from "./levels/senior-principal-export.json";
import director from "./levels/director-export.json";
import seniorDirector from "./levels/senior-director-export.json";
import managingDirector from "./levels/managing-director-export.json";

export type CompetencyExpectation = {
  category: string;
  expectation: string;
};

export type LevelData = {
  trackTitle: string;
  trackDescription: string;
  jobTitle: string;
  jobTitleSummary: string;
  competencyExpectations: Record<string, CompetencyExpectation[]>;
  quantitativeExpectations: string[];
};

// Order matters here — it defines the promotion sequence within the
// Client Delivery track. This release only covers these 8 titles, per spec.
export const LEVEL_LADDER: LevelData[] = [
  associateConsultant,
  consultant,
  seniorConsultant,
  principal,
  seniorPrincipal,
  director,
  seniorDirector,
  managingDirector,
] as LevelData[];

export function nextLevel(currentTitle: string): LevelData | null {
  const idx = LEVEL_LADDER.findIndex((l) => l.jobTitle === currentTitle);
  if (idx === -1 || idx === LEVEL_LADDER.length - 1) return null;
  return LEVEL_LADDER[idx + 1];
}

export function pillarSummary(level: LevelData, pillar: string): string {
  const items = level.competencyExpectations[pillar] || [];
  return items.map((i) => `- (${i.category}) ${i.expectation.trim()}`).join("\n");
}
