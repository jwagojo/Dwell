export type EngineError = { ok: false; invalidInput: string; message: string };
export type Ok<T> = { ok: true; value: T };
export type EngineResult<T> = Ok<T> | EngineError;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const fail = (invalidInput: string, message?: string): EngineError => ({
  ok: false,
  invalidInput,
  message: message ?? `Invalid input: ${invalidInput}`,
});

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
