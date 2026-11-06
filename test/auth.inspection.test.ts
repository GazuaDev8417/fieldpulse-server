import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/database/prisma.js"

let app: ReturnType<typeof buildApp>

async function cleanupTestData() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@fieldpulse.test" } },
    select: { id: true },
  })
  const userIds = users.map((user) => user.id)

  const organizations = await prisma.organization.findMany({
    where: { name: { startsWith: "FieldPulse Test" } },
    select: { id: true },
  })
  const organizationIds = organizations.map((organization) => organization.id)

  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.inspection.deleteMany({ where: { organizationId: { in: organizationIds } } })
  await prisma.organizationMember.deleteMany({
    where: { organizationId: { in: organizationIds } },
  })
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

async function register(email: string, organizationName: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Test Owner",
      email,
      password: "StrongPassword123!",
      organizationName,
    },
  })

  return {
    response,
    body: response.json() as {
      user: { id: string; name: string; email: string }
      organization: { id: string; name: string; role: string }
      accessToken: string
      refreshToken: string
    },
  }
}

async function createInspection(accessToken: string, title = "Electrical inspection") {
  return app.inject({
    method: "POST",
    url: "/api/v1/inspections",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { title },
  })
}

beforeAll(async () => {
  app = buildApp()
})

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await app.close()
  await prisma.$disconnect()
})

describe("authentication and organization isolation", () => {
  it("registers a user and organization", async () => {
    const { response, body } = await register(
      "owner-one@fieldpulse.test",
      "FieldPulse Test Organization One",
    )

    expect(response.statusCode).toBe(201)
    expect(body.user.email).toBe("owner-one@fieldpulse.test")
    expect(body.organization.name).toBe("FieldPulse Test Organization One")
    expect(body.organization.role).toBe("OWNER")
    expect(body.accessToken).toBeTypeOf("string")
  })

  it("rejects duplicate email registration", async () => {
    await register("duplicate@fieldpulse.test", "FieldPulse Test Organization One")

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Duplicate User",
        email: "duplicate@fieldpulse.test",
        password: "StrongPassword123!",
        organizationName: "FieldPulse Test Organization Two",
      },
    })

    expect(response.statusCode).toBe(409)
  })

  it("logs in a registered user", async () => {
    await register("login@fieldpulse.test", "FieldPulse Test Login Organization")

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "login@fieldpulse.test",
        password: "StrongPassword123!",
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().accessToken).toBeTypeOf("string")
  })

  it("rejects login with an invalid password", async () => {
    await register("invalid-password@fieldpulse.test", "FieldPulse Test Login Organization")

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "invalid-password@fieldpulse.test",
        password: "IncorrectPassword123!",
      },
    })

    expect(response.statusCode).toBe(401)
  })

  it("returns authenticated user data through /auth/me", async () => {
    const { body } = await register(
      "me@fieldpulse.test",
      "FieldPulse Test Me Organization",
    )

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${body.accessToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().organizationName).toBe("FieldPulse Test Me Organization")
    expect(response.json().role).toBe("OWNER")
  })

  it("rejects unauthenticated inspection access", async () => {
    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/inspections",
    })
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/inspections",
      payload: { title: "Unauthorized inspection" },
    })

    expect(listResponse.statusCode).toBe(401)
    expect(createResponse.statusCode).toBe(401)
  })

  it("creates an inspection for the authenticated organization", async () => {
    const { body } = await register(
      "inspection@fieldpulse.test",
      "FieldPulse Test Inspection Organization",
    )

    const response = await createInspection(body.accessToken)
    const inspection = response.json()

    expect(response.statusCode).toBe(201)
    expect(inspection.organizationId).toBe(body.organization.id)
    expect(inspection.createdById).toBe(body.user.id)
  })

  it("prevents access across organizations", async () => {
    const organizationOne = await register(
      "organization-one@fieldpulse.test",
      "FieldPulse Test Organization One",
    )
    const organizationTwo = await register(
      "organization-two@fieldpulse.test",
      "FieldPulse Test Organization Two",
    )

    const createResponse = await createInspection(
      organizationOne.body.accessToken,
      "Organization One inspection",
    )
    const inspection = createResponse.json()

    expect(createResponse.statusCode).toBe(201)

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/inspections",
      headers: { authorization: `Bearer ${organizationTwo.body.accessToken}` },
    })
    expect(listResponse.statusCode).toBe(200)
    expect(listResponse.json().some((item: { id: string }) => item.id === inspection.id)).toBe(false)

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/v1/inspections/${inspection.id}`,
      headers: { authorization: `Bearer ${organizationTwo.body.accessToken}` },
    })
    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/inspections/${inspection.id}`,
      headers: { authorization: `Bearer ${organizationTwo.body.accessToken}` },
      payload: { title: "Unauthorized update" },
    })
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/inspections/${inspection.id}`,
      headers: { authorization: `Bearer ${organizationTwo.body.accessToken}` },
    })

    expect(getResponse.statusCode).toBe(404)
    expect(updateResponse.statusCode).toBe(404)
    expect(deleteResponse.statusCode).toBe(404)

    const ownerListResponse = await app.inject({
      method: "GET",
      url: "/api/v1/inspections",
      headers: { authorization: `Bearer ${organizationOne.body.accessToken}` },
    })
    expect(ownerListResponse.json().some((item: { id: string }) => item.id === inspection.id)).toBe(true)
  }, 15_000)
})