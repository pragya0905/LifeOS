export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "todo" | "in_progress" | "done";
export type PrioritySource = "manual" | "ai";

export interface Task {
  userId: string;
  taskId: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  dueAtUtc?: string;
  estimatedHours?: number;
  voiceInput?: boolean;
  priority: TaskPriority;
  prioritySource: PrioritySource;
  status: TaskStatus;
  scheduleTime?: string;
  reminderSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserSex = "male" | "female" | "unspecified";

export interface UserProfile {
  userId: string;
  heightCm?: number;
  monthlyBudget?: number;
  sex?: UserSex;
  lastWeeklyDigestSentAt?: string;
  onboardingCompletedAt?: string;
  updatedAt: string;
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
  // percentage mode
  percentage?: number;
  // milestone mode
  milestones?: WishMilestone[];
  // quantity mode
  quantityTarget?: number;
  quantityCurrent?: number;
  quantityUnit?: string;
  // habit_linked mode — progress is computed on read from habit logs since createdAt,
  // not stored, so it always reflects the live total rather than going stale.
  linkedHabitType?: WishHabitType;
  habitLinkTargetValue?: number;
  imageKeys?: string[];
  deadlineReminderSentAt?: string;
  fallBehindWarningSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscription {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

export interface JournalEntryExtraction {
  waterMl: number | null;
  exerciseMinutes: number | null;
  stepsCount: number | null;
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
export type HabitSource = "manual" | "ai-journal";
export type HabitUnit = "ml" | "minutes" | "steps";

export interface HabitLog {
  userId: string;
  dateHabitType: string;
  date: string;
  habitType: HabitType;
  status: HabitStatus;
  value?: number;
  unit?: HabitUnit;
  source: HabitSource;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Medication {
  userId: string;
  medicationId: string;
  name: string;
  dosage?: string;
  notes?: string;
  // "HH:MM" in the timezone the medication was created in, paired with
  // timezoneOffsetMinutes (JS getTimezoneOffset() convention) so the reminder scheduler
  // can compute today's target UTC instant without guessing the user's timezone.
  timeOfDay?: string;
  timezoneOffsetMinutes?: number;
  // YYYY-MM-DD of the last date a reminder was sent for this medication — prevents
  // re-sending within the same day across scheduler runs.
  lastReminderSentDate?: string;
  startDate: string;
  durationDays: number;
  createdAt: string;
}

export type MedicationLogStatus = "taken" | "missed";
export type MedicationLogSource = "manual" | "ai-journal";

export interface MedicationLog {
  userId: string;
  dateMedicationId: string;
  date: string;
  medicationId: string;
  status: MedicationLogStatus;
  source: MedicationLogSource;
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

export type LogSource = "manual" | "ai-journal";

export interface LogEntry {
  userId: string;
  logId: string;
  logType: LogType;
  date: string;
  data: Record<string, unknown>;
  source: LogSource;
  createdAt: string;
  updatedAt: string;
}

export type RoutineCategory = "skinCare" | "hairCare" | "dailyRoutine" | "custom";

export interface RoutineTemplate {
  userId: string;
  routineId: string;
  category: RoutineCategory;
  name: string;
  steps: string[];
  createdAt: string;
}

export type RoutineStepStatus = "done" | "skipped";
export type RoutineStepSource = "manual" | "ai-journal";

export interface RoutineStepLog {
  userId: string;
  dateRoutineStep: string;
  date: string;
  routineId: string;
  stepIndex: number;
  status: RoutineStepStatus;
  source: RoutineStepSource;
  createdAt: string;
  updatedAt: string;
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
