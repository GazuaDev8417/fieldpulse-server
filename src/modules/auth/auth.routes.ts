import type { FastifyInstance } from "fastify"
import { registerFromInvitationSchema } from "../invitations/invitation.schema.js"
import { InvitationServiceError, invitationService } from "../invitations/invitation.service.js"
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "./auth.schema.js"
import { authService } from "./auth.service.js"

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    try {
      const input = registerSchema.parse(request.body)
      const result = await authService.register(input)
      return reply.status(201).send(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed"
      return reply.status(message === "Email already registered" ? 409 : 400).send({
        error: message,
      })
    }
  })

  app.post("/login", async (request, reply) => {
    try {
      const input = loginSchema.parse(request.body)
      return await authService.login(input)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed"
      return reply.status(401).send({ error: message })
    }
  })

  app.post("/refresh", async (request, reply) => {
    try {
      const input = refreshSchema.parse(request.body)
      return await authService.refresh(input.refreshToken)
    } catch {
      return reply.status(401).send({
        error: "Invalid or expired refresh token",
      })
    }
  })

  app.post("/logout", async (request, reply) => {
    const input = logoutSchema.parse(request.body)
    await authService.logout(input.refreshToken)
    return reply.status(204).send()
  })

  app.post('/invitations/register', async(request, reply)=>{
    const input = registerFromInvitationSchema.parse(request.body)

    try{
      const result = await invitationService.registerFromInvitation(input)
      return reply.status(201).send(result)
    }catch(error){
      if(error instanceof InvitationServiceError){
        return reply.status(error.statusCode).send({
          error: error.message
        })
      }
      
      throw error
    }
  })

  app.get(
    "/me",
    { preHandler: app.authenticate },
    async (request) => {
      return authService.me(
        request.user.id,
        request.user.organizationId,
      )
    },
  )
}
