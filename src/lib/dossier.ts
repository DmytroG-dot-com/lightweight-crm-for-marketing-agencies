import { DOSSIER_SECTIONS } from "@/lib/constants";
import { ONBOARDING_GROUPS, type OnboardingQuestion } from "@/lib/onboarding";

type DossierSection = (typeof DOSSIER_SECTIONS)[number];

const sectionQuestions = Object.fromEntries(
  DOSSIER_SECTIONS.map((section) => [
    section,
    ONBOARDING_GROUPS.flatMap((group) => group.questions).filter(
      (question) => question.target === section,
    ),
  ]),
) as Record<DossierSection, readonly OnboardingQuestion[]>;

export const DOSSIER_SECTION_QUESTIONS = sectionQuestions;

export function dossierQuestionFieldName(questionKey: string) {
  return `dossier__${questionKey}`;
}

export function dossierSectionNotesFieldName(section: DossierSection) {
  return `dossier__${section}__notes`;
}

export function dossierSectionPreservedFieldName(section: DossierSection) {
  return `dossier__${section}__preserved`;
}
