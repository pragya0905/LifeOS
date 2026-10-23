import { describe, expect, it } from "vitest";
import { missingDeleteError } from "./deleteOutcome";

describe("missingDeleteError", () => {
  it("reports a delete that removed nothing", () => {
    expect(missingDeleteError("delete_task", { deleted: false })).toBe(
      "No task with that id. It may already be deleted.",
    );
    expect(missingDeleteError("delete_expense", { deleted: false })).toBe(
      "No expense with that id. It may already be deleted.",
    );
  });

  it("is silent for a delete that removed something", () => {
    expect(missingDeleteError("delete_task", { deleted: true })).toBeUndefined();
  });

  it("is silent for tools that are not deletes", () => {
    expect(missingDeleteError("create_task", { deleted: false })).toBeUndefined();
  });

  it("is silent when the body has no deleted flag", () => {
    expect(missingDeleteError("delete_task", {})).toBeUndefined();
    expect(missingDeleteError("delete_task", undefined)).toBeUndefined();
  });
});
