import type { ReminderRequest } from "../contracts/types.js";

export interface ProviderCallContext {
  caseId?: string;
}

export interface ReminderProvider {
  interpret(
    request: ReminderRequest,
    context?: ProviderCallContext,
  ): Promise<unknown>;
}

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
