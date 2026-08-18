import { z } from "zod";
import type { LogType } from "./types";

const FoodSchema = z.object({
  description: z.string().trim().min(1),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
});

// Both optional so AI extraction can record a wake-up or bed time mentioned alone (e.g. "woke
// up at 9am") without requiring the other half of the pair to have been mentioned too.
const SleepSchema = z
  .object({
    bedTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    wakeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })
  .refine((data) => data.bedTime !== undefined || data.wakeTime !== undefined, {
    message: "At least one of bedTime or wakeTime is required",
  });

const WeightSchema = z.object({
  valueKg: z.number().positive(),
});

const BodyFatSchema = z.object({
  percentage: z.number().min(0).max(100),
});

const MoodSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  note: z.string().trim().optional(),
});

const CallSchema = z.object({
  personName: z.string().trim().min(1),
  durationMinutes: z.number().positive().optional(),
  note: z.string().trim().optional(),
});

const ExpenseSchema = z.object({
  category: z.string().trim().min(1),
  note: z.string().trim().optional(),
  amount: z.number().nonnegative().optional(),
});

const CycleSchema = z.object({
  event: z.enum(["period_start", "period_end", "symptom"]),
  note: z.string().trim().optional(),
});

export const LOG_ENTRY_SCHEMAS: Record<LogType, z.ZodTypeAny> = {
  food: FoodSchema,
  sleep: SleepSchema,
  weight: WeightSchema,
  bodyFat: BodyFatSchema,
  mood: MoodSchema,
  call: CallSchema,
  expense: ExpenseSchema,
  cycle: CycleSchema,
};

export const LOG_TYPES = Object.keys(LOG_ENTRY_SCHEMAS) as LogType[];

// Sleep/weight/mood/cycle are naturally one-value-per-day concepts, so both manual saves
// and AI-journal writes target the same deterministic logId (date + logType) instead of a
// random one — otherwise a manual entry and an AI-extracted entry for the same day become
// two separate items, and which one displays becomes an arbitrary query-order coin flip.
export const SINGULAR_LOG_TYPES: LogType[] = ["sleep", "weight", "mood", "cycle"];
