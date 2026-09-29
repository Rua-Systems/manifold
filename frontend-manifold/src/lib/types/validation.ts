export type Validator = (value: string) => string | null;

export type FieldErrors = Record<string, string | undefined>;
