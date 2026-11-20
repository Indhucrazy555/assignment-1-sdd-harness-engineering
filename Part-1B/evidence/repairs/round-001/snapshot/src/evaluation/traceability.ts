const requirements = [
  "FR-001",
  "FR-002",
  "FR-003",
  "FR-004",
  "FR-005",
  "FR-006",
  "FR-007",
  "FR-008",
  "FR-009",
  "FR-010",
  "FR-011",
  "FR-012",
  "FR-013",
  "FR-014",
  "FR-015",
  "FR-016",
  "FR-017",
  "FR-018",
  "FR-019",
  "FR-020",
  "FR-021",
  "FR-022",
  "FR-023",
  "FR-024",
  "FR-025",
  "FR-026",
  "FR-027",
] as const;

export type FunctionalRequirementId = (typeof requirements)[number];

function caseRange(start: number, end: number): string[] {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    return `EVAL-${String(start + index).padStart(3, "0")}`;
  });
}

const allCases = caseRange(1, 27);
const inputCases = [
  ...caseRange(1, 6),
  "EVAL-018",
  "EVAL-022",
  "EVAL-023",
  ...caseRange(25, 27),
];
const responseCases = [...caseRange(1, 23), ...caseRange(25, 27)];
const dateCases = [
  ...caseRange(1, 14),
  "EVAL-016",
  "EVAL-018",
  ...caseRange(25, 27),
];
const safetyCases = [...caseRange(15, 23), "EVAL-025"];
const providerCases = caseRange(1, 24);
const feedbackCases = ["EVAL-023", "EVAL-024"];

export const requirementToEvaluationCases: Record<
  FunctionalRequirementId,
  readonly string[]
> = {
  "FR-001": inputCases,
  "FR-002": inputCases,
  "FR-003": inputCases,
  "FR-004": inputCases,
  "FR-005": responseCases,
  "FR-006": responseCases,
  "FR-007": responseCases,
  "FR-008": responseCases,
  "FR-009": responseCases,
  "FR-010": dateCases,
  "FR-011": dateCases,
  "FR-012": dateCases,
  "FR-013": dateCases,
  "FR-014": dateCases,
  "FR-015": safetyCases,
  "FR-016": safetyCases,
  "FR-017": providerCases,
  "FR-018": providerCases,
  "FR-019": responseCases,
  "FR-020": responseCases,
  "FR-021": allCases,
  "FR-022": allCases,
  "FR-023": allCases,
  "FR-024": feedbackCases,
  "FR-025": feedbackCases,
  "FR-026": allCases,
  "FR-027": allCases,
};

export function requirementsForCase(
  caseId: string,
  failedCaseIds: readonly string[] = [],
): FunctionalRequirementId[] {
  const knownCases = new Set(allCases);
  if (!knownCases.has(caseId)) {
    throw new Error(`Unknown evaluation case ID: ${caseId}.`);
  }
  if (failedCaseIds.some((failedCaseId) => !knownCases.has(failedCaseId))) {
    throw new Error("Failure traceability contains an unknown evaluation case ID.");
  }

  return requirements.filter((requirementId) => {
    const mappedCases = requirementToEvaluationCases[requirementId];
    if (mappedCases.includes(caseId)) {
      return true;
    }
    return (
      (requirementId === "FR-024" || requirementId === "FR-025") &&
      failedCaseIds.includes(caseId)
    );
  });
}
