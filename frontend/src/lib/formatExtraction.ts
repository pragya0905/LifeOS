import type { JournalEntry } from "../types";

export function extractionParts(aiExtracted: JournalEntry["aiExtracted"]): string[] {
  if (!aiExtracted) return [];
  const parts: string[] = [];
  if (aiExtracted.waterMl !== null) parts.push(`water ${aiExtracted.waterMl}ml`);
  if (aiExtracted.exerciseMinutes !== null) parts.push(`exercise ${aiExtracted.exerciseMinutes}min`);
  if (aiExtracted.meditationMinutes !== null) parts.push(`meditation ${aiExtracted.meditationMinutes}min`);
  if (aiExtracted.food !== null) parts.push(`food: ${aiExtracted.food}`);
  if (aiExtracted.sleep !== null) {
    parts.push(`sleep ${aiExtracted.sleep.bedTime}–${aiExtracted.sleep.wakeTime}`);
  }
  if (aiExtracted.weightKg !== null) parts.push(`weight ${aiExtracted.weightKg}kg`);
  if (aiExtracted.moodRating !== null) parts.push(`mood ${aiExtracted.moodRating}/5`);
  if (aiExtracted.cycleEvent !== null) parts.push(`cycle: ${aiExtracted.cycleEvent.replace("_", " ")}`);
  for (const medication of aiExtracted.medicationNamesTaken) parts.push(`took ${medication}`);
  for (const step of aiExtracted.routineStepsCompleted) parts.push(`routine: ${step}`);
  for (const call of aiExtracted.calls) {
    parts.push(
      `call with ${call.personName}${call.durationMinutes !== null ? ` (${call.durationMinutes}min)` : ""}`,
    );
  }
  for (const expense of aiExtracted.expenses) {
    parts.push(`expense: ${expense.category}${expense.amount !== null ? ` (${expense.amount})` : ""}`);
  }
  return parts;
}

export function formatDetection(aiExtracted: JournalEntry["aiExtracted"]): string | null {
  const parts = extractionParts(aiExtracted);
  return parts.length > 0 ? `Detected: ${parts.join(", ")}` : null;
}
