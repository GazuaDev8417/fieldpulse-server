import Fastify from 'fastify'
import { ZodError } from "zod"
import "./config/env.js"
import { inspectionRoutes } from './modules/inspections/inspection.routes.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { invitationRoutes } from './modules/invitations/invitation.routes.js'
import authenticatePlugin from "./plugins/authenticate.js"
import multipart from '@fastify/multipart'




export function buildApp(){
    const app = Fastify({
        logger: true
    })

    app.register(multipart, {
        limits: {
            fileSize: 10 * 1024 * 1024,
            files: 1,
        },
    })

    app.register(authenticatePlugin)

    app.register(authRoutes, {
        prefix: '/api/v1/auth'
    })

    app.register(inspectionRoutes, {
        prefix: '/api/v1'
    })

    app.register(invitationRoutes, {
        prefix: "/api/v1/organizations"
    })

    app.get('/health', async()=>{
        return {
            status: 'ok'
        }
    })

    app.setErrorHandler((error, request, reply)=>{
        if (error instanceof ZodError) {
            return reply.status(400).send({
                error: 'Invalid request data'
            })
        }

        const statusCode = 
            typeof error === 'object' &&
                error !== null &&
                'statusCode' in error &&
                typeof error.statusCode === 'number'
                ? error.statusCode
                : 500

        const message = 
            error instanceof Error
            ? error.message
            : 'Internal server error'

        if(statusCode >= 500){
            request.log.error(error)
            return reply.status(500).send({
                error: 'Internal server error'
            })
        }

        return reply.status(statusCode).send({
            error: message
        })
    })

    return app
}