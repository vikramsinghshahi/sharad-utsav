import type { DomainIssue } from "./errors";

// Rule checks return every problem at once instead of throwing on the first,
// so the UI can show all field errors in one pass.
export type Result<T> = { ok: true; value: T } | { ok: false; issues: DomainIssue[] };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(...issues: DomainIssue[]): Result<T> {
  return { ok: false, issues };
}

// Accumulates issues across many checks, then yields a single Result.
export class IssueCollector {
  readonly issues: DomainIssue[] = [];

  add(...issues: DomainIssue[]): void {
    this.issues.push(...issues);
  }

  // Returns the value, or records the issues and returns undefined.
  take<T>(result: Result<T>): T | undefined {
    if (result.ok) return result.value;
    this.add(...result.issues);
    return undefined;
  }

  get hasIssues(): boolean {
    return this.issues.length > 0;
  }

  finish<T>(value: T): Result<T> {
    return this.hasIssues ? { ok: false, issues: [...this.issues] } : ok(value);
  }

  // For early exits where there is no value to return.
  failure<T = never>(): Result<T> {
    return { ok: false, issues: [...this.issues] };
  }
}
