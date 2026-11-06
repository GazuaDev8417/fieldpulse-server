import { FastifyInstance } from "fastify"
import {
  createInspectionSchema,
  inspectionIdSchema,
  updateInspectionSchema
} from "./inspection.schema.js"
import { inspectionService } from "./inspection.service.js"
import { randomUUID } from "node:crypto"
import { pipeline } from "node:stream/promises"
import fs from 'node:fs'
import path from 'node:path'



export async function inspectionRoutes(app: FastifyInstance) {
  app.get(
    "/inspections",
    { preHandler: app.authenticate },
    async (request) => {
      return inspectionService.getAll(request.user.organizationId)
    },
  )

  app.get(
    "/inspections/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = inspectionIdSchema.parse(request.params)
      const inspection = await inspectionService.getById(
        request.user.organizationId,
        params.id,
      )

      if (!inspection) {
        return reply.status(404).send({ error: "Inspection not found" })
      }

      return inspection
    },
  )

  app.get(
    '/files/inspections/:filename',
    { preHandler: app.authenticate },
    async(request, reply)=>{
      const { filename } = request.params as { filename: string }

      if(
        !filename ||
        filename.includes('/') ||
        filename.includes('\\')
      ){
        return reply.status(404).send({
          error: 'File not found'
        })
      }
      
      if(
      !filename.startsWith(`${request.user.organizationId}-`)
      ){
        return reply.status(404).send({
          error: 'File not found'
        })
      }

      const filePath = path.resolve(
        process.cwd(),
        'uploads',
        'inspections',
        filename
      )

      console.log({
        cwd: process.cwd(),
        filename,
        organizationId: request.user.organizationId,
        filePath,
      })

      if(!fs.existsSync(filePath)){
        return reply.status(404).send({
          error: 'File not found'
        })
      }

      const contentType = filename.endsWith('.png')
        ? 'image/png'
        : filename.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg'

      reply.header('content-type', contentType)
      reply.header('Cache-control', 'private, max-age=300')

      return reply.send(fs.createReadStream(filePath))
    }
  )

  app.post(
    '/inspections/:id/photo',
    { preHandler: app.authenticate },
    async (request, reply) =>{
      const params = inspectionIdSchema.parse(request.params)

      const inspection = await inspectionService.getById(
        request.user.organizationId,
        params.id
      )

      if(!inspection){
        return reply.status(404).send({
          error: 'Inspection not found'
        })
      }

      const file = await request.file()

      if(!file){
        return reply.status(400).send({
          error: 'Photo is required'
        })
      }

      if(!file.mimetype.startsWith('image/')){
        return reply.status(400).send({
          error: 'Only image files are allowed'
        })
      }

      const extension = 
        file.mimetype === 'image/png'
          ? '.png'
          : file.mimetype === 'image/webp'
          ? '.webp'
          : '.jpg'

      const fileName = `${request.user.organizationId}-${randomUUID()}${extension}`
      const uploadDirectory = path.resolve(
        process.cwd(),
        'uploads',
        'inspections'
      )
      const filePath = path.join(uploadDirectory, fileName)

      await fs.promises.mkdir(uploadDirectory, { recursive: true })
      await pipeline(file.file, fs.createWriteStream(filePath))

      const photoUrl = 
        `/files/inspections/${encodeURIComponent(fileName)}`

      const updated = await inspectionService.update(
        request.user.organizationId,
        params.id,
        { photoUrl }
      )

      return reply.status(201).send({
        photoUrl
      })
    }
  )

  app.post(
    "/inspections",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const body = createInspectionSchema.parse(request.body)
      const inspection = await inspectionService.create(body, {
        organizationId: request.user.organizationId,
        createdById: request.user.id,
      })

      return reply.status(201).send(inspection)
    },
  )

  app.patch(
    "/inspections/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = inspectionIdSchema.parse(request.params)
      const body = updateInspectionSchema.parse(request.body)
      const inspection = await inspectionService.update(
        request.user.organizationId,
        params.id,
        body,
      )

      if (!inspection) {
        return reply.status(404).send({ error: "Inspection not found" })
      }

      return inspection
    },
  )

  app.delete(
    "/inspections/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = inspectionIdSchema.parse(request.params)
      const deleted = await inspectionService.delete(
        request.user.organizationId,
        params.id,
      )

      if (!deleted) {
        return reply.status(404).send({ error: "Inspection not found" })
      }

      return reply.status(204).send()
    },
  )
}