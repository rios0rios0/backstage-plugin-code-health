import type { LoggerService } from "@backstage/backend-plugin-api";

/**
 * Hand-rolled logger that records what it was told.
 *
 * Logging is a fire-and-forget side effect with nothing observable to assert
 * on otherwise, which is the one case the testing standard allows a recording
 * double for.
 */
export class RecordingLogger implements LoggerService {
  readonly messages: Array<{ level: string; message: string }> = [];

  error(message: string): void {
    this.messages.push({ level: "error", message });
  }

  warn(message: string): void {
    this.messages.push({ level: "warn", message });
  }

  info(message: string): void {
    this.messages.push({ level: "info", message });
  }

  debug(message: string): void {
    this.messages.push({ level: "debug", message });
  }

  child(): LoggerService {
    return this;
  }

  /** Every message logged at the given level, newest last. */
  at(level: string): string[] {
    return this.messages.filter((entry) => entry.level === level).map((entry) => entry.message);
  }
}
