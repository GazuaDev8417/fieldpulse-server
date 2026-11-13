import bcrypt from "bcryptjs"
import crypto from "node:crypto"
import jwt from "jsonwebtoken"
import { prisma } from "../../database/prisma.js"
import { env } from "../../config/env.js"
import type { LoginInput, RegisterInput } from "./auth.schema.js"

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

function createRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url")
}

function refreshTokenExpiresAt(): Date {
  const value = String(env.jwtRefreshTtl)
  const match = value.match(/^([0-9]+)([smhd])$/)
  const milliseconds = match
    ? Number(match[1]) * {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
      }[match[2] as "s" | "m" | "h" | "d"]
    : 30 * 24 * 60 * 60 * 1000

  return new Date(Date.now() + milliseconds)
}

export async function issueTokens(userId: string, organizationId: string) {
  const accessToken = jwt.sign(
    { organizationId },
    env.jwtAccessSecret,
    { subject: userId, expiresIn: env.jwtAccessTtl },
  )

  const refreshToken = createRefreshToken()
  await prisma.refreshToken.create({
    data: {
      userId,
      organizationId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiresAt(),
    },
  })

  return { accessToken, refreshToken }
}

export const authService = {
  async register(input: RegisterInput) {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    })

    if (existingUser) {
      throw new Error("Email already registered")
    }

    const passwordHash = await bcrypt.hash(input.password, 12)

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
        },
      })

      const organization = await tx.organization.create({
        data: { name: input.organizationName },
      })

      const member = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: "OWNER",
        },
      })

      return { user, organization, member }
    })

    const tokens = await issueTokens(
      result.user.id,
      result.organization.id,
    )

    return {
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        role: result.member.role,
      },
      ...tokens,
    }
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          include: { organization: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    })

    if (!user) {
      throw new Error("Invalid email or password")
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash)

    if (!passwordMatches || user.memberships.length === 0) {
      throw new Error("Invalid email or password")
    }

    const membership = user.memberships[0]
    const tokens = await issueTokens(user.id, membership.organizationId)

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
      },
      ...tokens,
    }
  },

  async refresh(refreshToken: string) {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    })

    if (
      !storedToken ||
      storedToken.revokedAt !== null ||
      storedToken.expiresAt <= new Date()
    ) {
      throw new Error("Invalid or expired refresh token")
    }

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: storedToken.organizationId,
          userId: storedToken.userId
        }
      }
    })

    if (!membership) {
      throw new Error("User is not a member of this organization")
    }

    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    })

    const tokens = await issueTokens(
      storedToken.userId,
      storedToken.organizationId,
    )

    return tokens
  },

  async logout(refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    })
  },

  async me(userId: string, organizationId: string) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      include: {
        user: true,
        organization: true,
      },
    })

    if (!membership) {
      throw new Error("User is not member of this organization")
    }

    return {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      organizationId: membership.organization.id,
      organizationName: membership.organization.name,
      role: membership.role,
    }
  },
}
