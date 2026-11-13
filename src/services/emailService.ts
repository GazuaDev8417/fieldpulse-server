import nodemailer from "nodemailer"



type OrganizationInvitationEmail = {
    email: string
    organizationName: string
    role: string
    token: string
}


function requiredEnvironmentVariable(name:string):string{
    const value = process.env[name]?.trim()

    if(!value){
        throw new Error(`${name} is required to send invitation emails`)
    }

    return value
}

function escapeHtml(value: string):string{
    return value.replace(/[&<>"']/g, (character)=>{
        const entities: Record<string, string>={
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }

        return entities[character]
    })
}

export const emailService = {
    async sendOrganizationInvitation(input: OrganizationInvitationEmail){
        const host = requiredEnvironmentVariable('SMTP_HOST')
        const user = requiredEnvironmentVariable('SMTP_USER')
        const password = requiredEnvironmentVariable('SMTP_PASSWORD')
        const from = requiredEnvironmentVariable('SMTP_FROM')
        const acceptUrl = new URL(
            requiredEnvironmentVariable('INVITATION_ACCEPT_URL')
        )
        const port = Number(process.env.SMTP_PORT ?? '587')

        if(!Number.isInteger(port) || port < 1 || port > 65535){
            throw new Error('SMTP_PORT must be a valid port number')
        }

        acceptUrl.searchParams.set('token', input.token)

        const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass: password }
        })

        const invitationLink = acceptUrl.toString()
        const organizationName = escapeHtml(input.organizationName)
        const role = escapeHtml(input.role) 
        const escapedInvitationLink = escapeHtml(invitationLink)

        await transporter.sendMail({
            from,
            to: input.email,
            subject: `Invitation to join ${input.organizationName} on FieldPulse`,
            text: [
                `You have been invited to join ${input.organizationName} on FieldPulse.`,
                `Assigned role: ${input.role}`,
                `Accept the invitation: ${invitationLink}`,
                "This invitation link can only be used once and expires."
            ].join('\n\n'),
            html: `
                <p>You have been invited to join <strong>${organizationName}</strong> on FieldPulse.</p>
                <p>Assigned role: <strong>${role}</strong></p>
                <p>
                    <a href="${escapedInvitationLink}">Accept invitation</a>
                </p>
                <p>
                    If the button does not work, copy this link into your browser or app:
                    <br />
                    <a href="${escapedInvitationLink}">${escapedInvitationLink}</a>
                </p>
                <p>This invitation link can only be used once and expires.</p>
            `
        })
    }
}

