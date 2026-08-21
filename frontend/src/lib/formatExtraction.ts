import type { JournalEntry } from "../types";

export function extractionParts(aiExtracted: JournalEntry["aiExtracted"]): string[] {
  if (!aiExtracted) return [];
  const parts: string[] = [];
  if (aiExtracted.waterMl !== null) parts.push(`water ${aiExtracted.waterMl}ml`);
  if (aiExtracted.exerciseMinutes !== null) parts.push(`exercise ${aiExtracted.exerciseMinutes}min`);
  if (aiExtracted.stepsCount !== null) {
    parts.push(
      `${aiExtracted.stepsCount} steps${aiExtracted.distanceKm !== null ? ` (from ${aiExtracted.distanceKm}km)` : ""}`,
    );
  }
  if (aiExtracted.food !== null) {
    parts.push(
      `food: ${aiExtracted.food.description}${aiExtracted.food.mealType ? ` (${aiExtracted.food.mealType})` : ""}`,
    );
  }
  if (aiExtracted.sleep !== null) {
    const { bedTime, wakeTime } = aiExtracted.sleep;
    if (bedTime !== null && wakeTime !== null) parts.push(`sleep ${bedTime}–${wakeTime}`);
    else if (wakeTime !== null) parts.push(`woke up ${wakeTime}`);
    else if (bedTime !== null) parts.push(`bedtime ${bedTime}`);
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
