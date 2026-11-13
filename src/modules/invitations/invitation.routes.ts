import type { FastifyInstance } from "fastify"
import { createInvitationSchema, accpetInvitationSchema } from "./invitation.schema.js"
import {
    InvitationServiceError,
    invitationService
} from './invitation.service.js'


export async function invitationRoutes(app: FastifyInstance){
    app.post(
        '/invitations',
        { preHandler: app.authenticate },
        async(request, reply) =>{
            if(request.user.role !== 'OWNER'){
                return reply.status(403).send({
                    error: "Only organization owners can invite members"
                })
            }

            const input = createInvitationSchema.parse(request.body)

            try{
                const invitation = await invitationService.create(
                    request.user.organizationId,
                    request.user.id,
                    input
                )

                return reply.status(201).send({ invitation })
            }catch(error){
                if(error instanceof InvitationServiceError){
                    if(error.statusCode >= 500){
                        request.log.error({ err: error }, "Invitation email delivery failed")
                    }

                    return reply.status(error.statusCode).send({
                        error: error.message
                    })
                }

                throw error
            }
        }
    ),

    app.post(
        '/invitations/accept',
        { preHandler: app.authenticate },
        async(request, reply)=>{
            const input = accpetInvitationSchema.parse(request.body)

            try{
                const result = await invitationService.accpetExistinguser(
                    request.user.id,
                    input
                )

                return reply.status(200).send(result)
            }catch(error){
                if(error instanceof InvitationServiceError){
                    return reply.status(error.statusCode).send({
                        error: error.message
                    })
                }

                throw error
            }
        }
    )
}