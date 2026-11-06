import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from "../../database/prisma.js"
import {
  CreateInspectionInput,
  UpdateInspectionInput,
} from './inspection.schema.js'



async function deleteInspectionsPhoto(
  organizationId:string,
  photoUrl:string | null
){
  if(!photoUrl) return

  const marker = '/files/inspections/'

  if(!photoUrl.startsWith(marker)) return

  let fileName:string

  try{
    fileName = decodeURIComponent(
      photoUrl.slice(marker.length)
    )
  }catch{
    return
  }

  if(
    !fileName
    || fileName.includes('/')
    || fileName.includes('\\')
    || !fileName.startsWith(`${organizationId}-`)
  ){
    return
  }

  const filePath = path.resolve(
    process.cwd(),
    'uploads',
    'inspections',
    fileName
  )

  try{
    await fs.unlink(filePath)
  }catch(error){
    if(
      !(error instanceof Error)
      || !('code' in error)
      || error.code !== 'ENOENT'
    ){
      throw error
    }
  }
}

export const inspectionService = {
  async getAll(organizationId: string) {
    return prisma.inspection.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    })
  },

  async getById(organizationId: string, id: string) {
    return prisma.inspection.findFirst({
      where: { organizationId, id },
    })
  },

  async create(
    input: CreateInspectionInput,
    context: {
      organizationId: string
      createdById: string
    }
  ) {
    return prisma.inspection.create({
      data: {
        ...input,
        status: "DRAFT",
        organizationId: context.organizationId,
        createdById: context.createdById
      },
    })
  },

  async update(organizationId: string, id: string, input: UpdateInspectionInput) {
    const result = await prisma.inspection.updateMany({
      where: { organizationId, id },
      data: input,
    })

    if (result.count === 0) {
      return null
    }

    return prisma.inspection.findFirst({
      where: { organizationId, id },
    })
  },

  async delete(organizationId: string, id: string) {
    const inspection = await prisma.inspection.findFirst({
      where: { organizationId, id },
      select: { photoUrl: true }
    })

    if(!inspection) return false

    const result = await prisma.inspection.deleteMany({
      where: { organizationId, id }
    })

    if(result.count === 0) return false

    await deleteInspectionsPhoto(
      organizationId,
      inspection.photoUrl
    )

    return true
  },
}