export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  userId: string;
  taskId: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  estimatedHours?: number;
  voiceInput?: boolean;
  priority: TaskPriority;
  prioritySource: "manual" | "ai";
  status: TaskStatus;
  scheduleTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryExtraction {
  waterMl: number | null;
  exerciseMinutes: number | null;
  stepsCount: number | null;
  distanceKm: number | null;
  food: { description: string; mealType: "breakfast" | "lunch" | "dinner" | "snack" | null } | null;
  sleep: { bedTime: string | null; wakeTime: string | null } | null;
  weightKg: number | null;
  moodRating: 1 | 2 | 3 | 4 | 5 | null;
  medicationNamesTaken: string[];
  routineStepsCompleted: string[];
  cycleEvent: "period_start" | "period_end" | "symptom" | null;
  calls: { personName: string; durationMinutes: number | null; note: string | null }[];
  expenses: { category: string; amount: number | null; note: string | null }[];
}

export interface JournalEntry {
  userId: string;
  date: string;
  text: string;
  voiceInput: boolean;
  aiExtracted?: JournalEntryExtraction;
  createdAt: string;
  updatedAt: string;
}

export type HabitType = "water" | "exercise" | "steps";
export type HabitStatus = "done" | "missed" | "skipped";
export type HabitUnit = "ml" | "minutes" | "steps";

export interface HabitLog {
  userId: string;
  dateHabitType: string;
  date: string;
  habitType: HabitType;
  status: HabitStatus;
  value?: number;
  unit?: HabitUnit;
  source: "manual" | "ai-journal";
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Schedule {
  date: string;
  tasks: Task[];
  habits: HabitLog[];
}

export interface Medication {
  userId: string;
  medicationId: string;
  name: string;
  dosage?: string;
  notes?: string;
  timeOfDay?: string;
  startDate: string;
  durationDays: number;
  endDate: string;
  // Days this is taken on: 0=Sun..6=Sat. Absent or empty means every day.
  daysOfWeek?: number[];
  createdAt: string;
}

export type MedicationLogStatus = "taken" | "missed";

export interface MedicationLog {
  userId: string;
  dateMedicationId: string;
  date: string;
  medicationId: string;
  status: MedicationLogStatus;
  source: "manual" | "ai-journal";
  createdAt: string;
  updatedAt: string;
}

export type LogType =
  | "food"
  | "sleep"
  | "weight"
  | "bodyFat"
  | "mood"
  | "call"
  | "expense"
  | "cycle";

export interface LogEntry {
  userId: string;
  logId: string;
  logType: LogType;
  date: string;
  data: Record<string, unknown>;
  source: "manual" | "ai-journal";
  createdAt: string;
  updatedAt: string;
}

// The three built-in presets a picker can offer — not an exhaustive list of valid values.
// RoutineTemplate.category itself is a free-text string so a user can type their own (e.g.
// "bodycare") instead of being stuck with "custom" as a generic, unnamed catch-all.
export type RoutineCategory = "skinCare" | "hairCare" | "dailyRoutine";

export interface RoutineTemplate {
  userId: string;
  routineId: string;
  category: string;
  name: string;
  steps: string[];
  // Days this routine runs on: 0=Sun..6=Sat (JS Date#getDay() convention). Absent or empty
  // means every day.
  daysOfWeek?: number[];
  createdAt: string;
}

export type RoutineStepStatus = "done" | "skipped";

export interface RoutineStepLog {
  userId: string;
  dateRoutineStep: string;
  date: string;
  routineId: string;
  stepIndex: number;
  status: RoutineStepStatus;
  source: "manual" | "ai-journal";
  createdAt: string;
  updatedAt: string;
}

export interface Insights {
  summary: string;
  highlights: string[];
  suggestions: string[];
}

export interface ProgressSummary {
  todaysDate: string;
  wishes: {
    title: string;
    targetDate: string;
    progressPercent: number | null;
    elapsedPercent: number | null;
    fallingBehind: boolean;
  }[];
  habits: {
    habitType: "water" | "exercise" | "steps";
    currentStreakDays: number;
    missedInLast7Days: number;
    missedInLast30Days: number;
  }[];
  budgets: {
    category: ExpenseCategory;
    monthlyLimit: number;
    spentSoFar: number;
    remainingThisMonth: number;
    projectedMonthEndTotal: number;
    projectedOverBy: number;
  }[];
}

export type ExpenseCategory =
  | "food"
  | "groceries"
  | "transport"
  | "shopping"
  | "bills"
  | "entertainment"
  | "health"
  | "rent"
  | "other";

export interface Expense {
  userId: string;
  expenseId: string;
  category: ExpenseCategory;
  amount: number;
  note?: string;
  date: string;
  source: "manual" | "ai-journal";
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  userId: string;
  category: ExpenseCategory;
  monthlyLimit: number;
  createdAt: string;
  updatedAt: string;
}

export type GoalMetric = "water" | "exercise" | "steps" | "weight";

export interface Goal {
  userId: string;
  metric: GoalMetric;
  targetValue: number;
  updatedAt: string;
}

export type MemoryCategory = "health" | "financial" | "emotional" | "consistency" | "general" | "style";

export interface UserMemory {
  userId: string;
  memoryId: string;
  text: string;
  category: MemoryCategory;
  createdAt: string;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealPlanSlot {
  userId: string;
  dateMealType: string;
  date: string;
  mealType: MealType;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanTemplate {
  userId: string;
  dayMealType: string;
  dayOfWeek: number;
  mealType: MealType;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export type UserSex = "male" | "female" | "unspecified";

export type AssistantModel = "claude-haiku-4-5" | "claude-sonnet-5" | "claude-opus-5";

export type AssistantTone = "warm" | "direct" | "playful";

export interface UserProfile {
  userId: string;
  heightCm?: number;
  monthlyBudget?: number;
  sex?: UserSex;
  assistantModel?: AssistantModel;
  preferredName?: string;
  assistantTone?: AssistantTone;
  location?: string;
  onboardingCompletedAt?: string;
  updatedAt?: string;
}

export type WishType =
  | "learning"
  | "travel"
  | "savings"
  | "health"
  | "shopping"
  | "creative"
  | "personal_growth"
  | "achievement";

export type WishProgressMode = "percentage" | "milestone" | "habit_linked" | "time_based" | "quantity";
export type WishStatus = "active" | "completed" | "abandoned";
export type WishHabitType = "water" | "exercise" | "steps";

export interface WishMilestone {
  id: string;
  text: string;
  targetDate?: string;
  done: boolean;
}

export interface Wish {
  userId: string;
  wishId: string;
  title: string;
  type: WishType;
  progressMode: WishProgressMode;
  status: WishStatus;
  targetDate?: string;
  percentage?: number;
  milestones?: WishMilestone[];
  quantityTarget?: number;
  quantityCurrent?: number;
  quantityUnit?: string;
  linkedHabitType?: WishHabitType;
  habitLinkTargetValue?: number;
  habitLinkedProgress?: number | null;
  imageKeys?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WishImage {
  key: string;
  url: string;
}

export interface Badge {
  key: string;
  label: string;
  description: string;
  emoji: string;
  earnedAt: string | null;
  justUnlocked: boolean;
}
