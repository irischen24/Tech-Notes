import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string({ error: "請輸入 Email" })
    .trim()
    .min(1, "請輸入 Email")
    .max(254, "Email 過長")
    .pipe(z.email("Email 格式不正確")),
  password: z.string({ error: "請輸入密碼" }).min(1, "請輸入密碼").max(128, "密碼過長"),
  next: z.string().max(512).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const emailOtpTypeSchema = z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);
