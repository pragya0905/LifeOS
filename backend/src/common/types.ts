export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "todo" | "in_progress" | "done";
export type PrioritySource = "manual" | "ai";

export interface Task {
  userId: string;
  taskId: string;
  title: string;
  dueDate?: string;
  dueTime?: string;
  estimatedHours?: number;
  voiceInput?: boolean;
  priority: TaskPriority;
  prioritySource: PrioritySource;
  status: TaskStatus;
  scheduleTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryExtraction {
  waterMl: number | null;
  exerciseMinutes: number | null;
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

export type HabitType = "water" | "exercise";
export type HabitStatus = "done" | "missed" | "skipped";
export type HabitSource = "manual" | "ai-journal";
export type HabitUnit = "ml" | "minutes";

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
  startDate: string;
  durationDays: number;
  createdAt: string;
}

export type MedicationLogStatus = "taken" | "missed";

export interface MedicationLog {
  userId: string;
  dateMedicationId: string;
  date: string;
  medicationId: string;
  status: MedicationLogStatus;
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

export type LogSource = "manual";

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

export interface RoutineStepLog {
  userId: string;
  dateRoutineStep: string;
  date: string;
  routineId: string;
  stepIndex: number;
  status: RoutineStepStatus;
  createdAt: string;
  updatedAt: string;
}
