import { createHash, randomBytes } from "node:crypto"
import { prisma } from "../../database/prisma.js"
import { emailService } from "../../services/emailService.js"
import type { CreateInvitationInput } from "./invitation.schema.js"
import bcrypt from "bcryptjs"
import type { Prisma } from "@prisma/client"
import { issueTokens } from "../auth/auth.service.js"
import {
    AcceptInvitationInput,
    RegisterFromInvitationInput
} from "./invitation.schema.js"


const INVITATION_TTL_DAYS = 7


export class InvitationServiceError extends Error {
    constructor(
        message: string,
        readonly statusCode: number
    ){
        super(message)
        this.name = 'InvitationServiceError'
    }
}

function createInvitationToken(): string{
    return randomBytes(32).toString('base64url')
}

function hashInvitationToken(token: string):string{
    return createHash('sha256').update(token).digest('hex')
}

async function claimInvitation(
    tx: Prisma.TransactionClient,
    token: string
){
    const now = new Date()
    const invitation = await tx.organizationInvitation.findUnique({
        where: { tokenHash: hashInvitationToken(token) },
        include: {
            organization: {
                select: { id: true, name: true }
            }
        }
    })

    if(
        !invitation ||
        invitation.acceptedAt ||
        invitation.expiresAt <= now
    ){
        throw new InvitationServiceError("Invitation is invalid or expired", 400)
    }

    const claimed = await tx.organizationInvitation.updateMany({
        where: {
            id: invitation.id,
            acceptedAt: null,
            expiresAt: { gt: now }
        },
        data: { acceptedAt: now }
    })

    if(claimed.count !== 1){
        throw new InvitationServiceError("Invitation is invalid or expired", 400)
    }

    return invitation
}

export const invitationService = {
    async create(
        organizationId: string,
        createdById: string,
        input: CreateInvitationInput
    ){
        const existingUser = await prisma.user.findUnique({
            where: { email: input.email },
            select: {
                id: true,
                memberships: {
                    where: { organizationId },
                    select: { userId: true }
                }
            }
        })

        if(existingUser?.memberships.length){
            throw new InvitationServiceError(
                "This user already belongs to the organization",
                409
            )
        }

        const existingInvitation = await prisma.organizationInvitation.findFirst({
            where: {
                organizationId,
                email: input.email,
                acceptedAt: null,
                expiresAt: { gt: new Date() }
            },
            select: { id: true }
        })

        if(existingInvitation){
            throw new InvitationServiceError(
                "An active invitation already exists for this email",
                409,
            )
        }

        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { name: true }
        })

        if(!organization){
            throw new InvitationServiceError("Organization not found", 404)
        }

        const token = createInvitationToken()
        const expiresAt = new Date(
            Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000
        )

        const invitation = await prisma.organizationInvitation.create({
            data: {
                organizationId,
                createdById,
                email: input.email,
                role: input.role,
                tokenHash: hashInvitationToken(token),
                expiresAt
            },
            select: {
                id: true,
                email: true,
                role: true,
                expiresAt: true
            }
        })

        try{
            await emailService.sendOrganizationInvitation({
                email: input.email,
                organizationName: organization.name,
                role: input.role,
                token
            })
        }catch(error){
            await prisma.organizationInvitation.delete({
                where: { id: invitation.id }
            })

            throw new InvitationServiceError(
                "Could not send the invitation email",
                502,
            )
        }

        return invitation
    },

    async accpetExistinguser(
        userId: string,
        input: AcceptInvitationInput
    ){
        const result = await prisma.$transaction(async(tx)=>{
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, email: true}
            })

            if(!user){
                throw new InvitationServiceError('User not found', 404)
            }

            const invitation = await claimInvitation(tx, input.token)

            if(user.email.toLowerCase() !== invitation.email.toLowerCase()){
                throw new InvitationServiceError(
                    'This invitation was sent to a differente email address',
                    403
                )
            }

            const existingMembership = await tx.organizationMember.findUnique({
                where: {
                    organizationId_userId: {
                        organizationId: invitation.organizationId,
                        userId
                    }
                },
                select: { userId: true }
            })
            
            if(existingMembership){
               throw new InvitationServiceError(
                'user already belongs to this organization',
                409
               ) 
            }
            
            await tx.organizationMember.create({
                data: {
                    organizationId: invitation.organizationId,
                    userId,
                    role: invitation.role
                }
            })

            return { user, invitation }
        })

        const tokens = await issueTokens(
            result.user.id,
            result.invitation.organizationId
        )

        return {
            user: result.user,
            organization: {
                id: result.invitation.organization.id,
                name: result.invitation.organization.name,
                role: result.invitation.role
            },
            ...tokens,
        }
    },

    async registerFromInvitation(input: RegisterFromInvitationInput){
        const passwordHash = await bcrypt.hash(input.password, 12)

        const result = await prisma.$transaction(async(tx)=>{
            const invitation = await claimInvitation(tx, input.token)

            const existingUser = await tx.user.findUnique({
                where: { email: invitation.email },
                select: { id: true }
            })

            if(existingUser){
                throw new InvitationServiceError(
                    "An account with this email already exists. Log in and accept the invitation.",
                    409,
                )
            }

            const user = await tx.user.create({
                data:{
                    name: input.name,
                    email: invitation.email,
                    passwordHash
                },
                select: { id: true, name: true, email: true }
            })

            await tx.organizationMember.create({
                data: {
                    organizationId: invitation.organizationId,
                    userId: user.id,
                    role: invitation.role
                }
            })

            return { user, invitation }
        })

        const tokens = await issueTokens(
            result.user.id,
            result.invitation.organizationId
        )

        return {
            user: result.user,
            organization: {
            id: result.invitation.organization.id,
            name: result.invitation.organization.name,
            role: result.invitation.role,
            },
            ...tokens,
        }
    }
}