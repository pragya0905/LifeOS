import { z } from "zod";
import type { LogType } from "./types";

const FoodSchema = z.object({
  description: z.string().trim().min(1),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
});

const SleepSchema = z.object({
  bedTime: z.string().regex(/^\d{2}:\d{2}$/),
  wakeTime: z.string().regex(/^\d{2}:\d{2}$/),
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
