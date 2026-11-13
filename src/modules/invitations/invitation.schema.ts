import { z } from 'zod'



export const createInvitationSchema = z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    role: z.enum(['ADMIN', 'INSPECTOR', 'VIEWER']).default('INSPECTOR')
})

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>

export const accpetInvitationSchema = z.object({
    token: z.string().trim().min(32).max(128)
})

export const registerFromInvitationSchema = z.object({
    token: z.string().trim().min(32).max(128),
    name: z.string().trim().min(2).max(120),
    password: z.string().trim().min(8).max(72)
})

export type AcceptInvitationInput = z.infer<typeof accpetInvitationSchema>
export type RegisterFromInvitationInput = z.infer<
    typeof registerFromInvitationSchema
>