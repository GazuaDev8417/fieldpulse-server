import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify"
import fp from "fastify-plugin"
import jwt from 'jsonwebtoken'
import { prisma } from '../database/prisma.js'



declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>
  }


  interface FastifyRequest {
    user: {
      id: string
      organizationId: string
      role: string
    }
  }
}


export default fp(async function authenticatePlugin(app:FastifyInstance){
  const accessSecret = process.env.JWT_ACCESS_SECRET

  if(!accessSecret){
    throw new Error('JWT_ACCESS_SECRET is required')
  }

  app.decorate(
    'authenticate',
    async function(
      request: FastifyRequest, 
      reply: FastifyReply
  ):Promise<void>{
    const authorization = request.headers.authorization

    if(!authorization?.startsWith("Bearer ")){
      return reply.status(401).send({
        error: 'Authentication required'
      })
    }

    const token = authorization.slice("Bearer ".length)

    try{
      const payload = jwt.verify(token, accessSecret)

      if(
        typeof payload === 'string' ||
        !payload.sub ||
        typeof payload.organizationId !== 'string'
      ){
        throw new Error('Invalid access token')
      }

      const member = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: payload.organizationId,
            userId: payload.sub
          },
        },
        select: {
          role: true
        }
      })

      if(!member){
        return reply.status(401).send({
          error: 'User is not member of this organization'
        })
      }

      request.user = {
        id: payload.sub,
        organizationId: payload.organizationId,
        role: member.role
      }
    }catch{
      return reply.status(401).send({
        error: 'Invalid or expired access token'
      })
    }
  }
)
})