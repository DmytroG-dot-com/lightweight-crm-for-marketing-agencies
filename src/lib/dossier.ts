import { DOSSIER_SECTIONS } from "@/lib/constants";
import { ONBOARDING_GROUPS, type OnboardingQuestion } from "@/lib/onboarding";

type DossierSection = (typeof DOSSIER_SECTIONS)[number];

const allQuestions = ONBOARDING_GROUPS.flatMap((group) => group.questions);

const sectionQuestions = DOSSIER_SECTIONS.reduce<Record<DossierSection, readonly OnboardingQuestion[]>>(
  (acc, section) => {
    acc[section] = allQuestions.filter((question) => question.target === section);
    return acc;
  },
  {} as Record<DossierSection, readonly OnboardingQuestion[]>,
);

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
