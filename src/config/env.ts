import "dotenv/config"
import type { SignOptions } from "jsonwebtoken"

function required(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

const jwtAccessSecret = required("JWT_ACCESS_SECRET")
const jwtRefreshSecret = required("JWT_REFRESH_SECRET")

if (jwtAccessSecret.length < 32 || jwtRefreshSecret.length < 32) {
  throw new Error("JWT secrets must contain at least 32 characters")
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  jwtAccessSecret,
  jwtRefreshSecret,
  jwtAccessTtl: required("JWT_ACCESS_TTL") as SignOptions["expiresIn"],
  jwtRefreshTtl: required("JWT_REFRESH_TTL") as SignOptions["expiresIn"],
}
