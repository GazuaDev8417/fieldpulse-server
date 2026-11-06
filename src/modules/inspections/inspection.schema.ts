import { z } from "zod"

export const createInspectionSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  photoUrl: z.url().nullable().optional(),
  signatureUrl: z.url().nullable().optional(),
})

export const updateInspectionSchema = createInspectionSchema.partial()

export const inspectionIdSchema = z.object({
  id: z.uuid(),
})

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>
export type UpdateInspectionInput = z.infer<typeof updateInspectionSchema>