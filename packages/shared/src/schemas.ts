import { z } from "zod";

/** Response of GET /api/health. */
export const HealthSchema = z.object({
  ok: z.boolean(),
  db: z.enum(["up", "down"]),
});
export type Health = z.infer<typeof HealthSchema>;

/** Public shape of the signed-in user (GET /api/auth/me). */
export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
});
export type User = z.infer<typeof UserSchema>;
