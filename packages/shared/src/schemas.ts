import { z } from "zod";

/** Response of GET /api/health. */
export const HealthSchema = z.object({
  ok: z.boolean(),
  db: z.enum(["up", "down"]),
});
export type Health = z.infer<typeof HealthSchema>;
