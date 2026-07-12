export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "todo" | "in_progress" | "done";
export type PrioritySource = "manual" | "ai";

export interface Task {
  userId: string;
  taskId: string;
  title: string;
  dueDate?: string;
  priority: TaskPriority;
  prioritySource: PrioritySource;
  status: TaskStatus;
  scheduleTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  userId: string;
  entryId: string;
  date: string;
  text: string;
  voiceInput: boolean;
  aiExtracted?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
