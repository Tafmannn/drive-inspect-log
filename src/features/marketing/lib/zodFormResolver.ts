import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

/**
 * Minimal React Hook Form resolver backed by `schema.safeParse`.
 *
 * We avoid `@hookform/resolvers`' `zodResolver` because the version pinned in
 * this repo (3.10) predates Zod 4 and rethrows Zod 4's error shape instead of
 * surfacing field errors. safeParse never throws, so this is robust across Zod
 * versions. All marketing form fields are flat (no nested paths), so a single
 * error entry per field name is sufficient.
 */
export function zodFormResolver<T extends FieldValues>(schema: ZodType<T>): Resolver<T> {
  return (values) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data, errors: {} };
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.map(String).join(".");
      if (key && !errors[key]) {
        errors[key] = { type: issue.code ?? "validation", message: issue.message };
      }
    }
    return { values: {}, errors: errors as unknown as FieldErrors<T> };
  };
}
