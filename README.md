# FieldPulse Backend

REST API and PostgreSQL data layer for the FieldPulse mobile application. It manages users, organizations, JWT authentication, inspections, photo uploads, protected photo downloads, and cross-device synchronization.

## Features

- User registration and login
- Multiple organizations with organization membership roles
- JWT access tokens and rotating refresh tokens
- Token logout and refresh-token revocation
- Organization-scoped inspection CRUD operations
- Inspection photo upload with size and MIME-type validation
- Protected inspection photo download
- Organization and filename validation before serving stored files
- Automatic removal of an inspection photo when its inspection is deleted
- Health endpoint for basic availability checks
- PostgreSQL persistence through Prisma

## Tech Stack

- Node.js and TypeScript
- Fastify 5
- Prisma 7 with PostgreSQL
- PostgreSQL 17
- Zod request validation
- JSON Web Tokens
- bcrypt password hashing
- `@fastify/multipart` for photo uploads
- Pino/Fastify logging
- Vitest for tests

## Requirements

- Docker and Docker Compose for the normal full-stack setup
- Node.js 24 or later and npm for backend-only development
- PostgreSQL 17, either containerized or local
- Docker environment variables in `.env.docker` or a host `.env`

## Environment

Create `.env` from the example file:

```bash
cp .env.example .env
```

Configure at least:

```dotenv
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/fieldpulse
JWT_ACCESS_SECRET=replace-with-a-secret-of-at-least-32-characters
JWT_REFRESH_SECRET=replace-with-a-different-secret-of-at-least-32-characters
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
```

Both JWT secrets are required and must be at least 32 characters. Do not commit real secrets or reuse the example values in production.

## Docker Setup

The Compose configuration starts PostgreSQL and the backend together. Protect a Docker environment file:

```bash
cp .env.example .env.docker
chmod 600 .env.docker
```

Configure `.env.docker` with real, untracked credentials:

```dotenv
POSTGRES_PASSWORD=your-postgresql-password
JWT_ACCESS_SECRET=replace-with-a-secret-of-at-least-32-characters
JWT_REFRESH_SECRET=replace-with-a-different-secret-of-at-least-32-characters
```

Build and start the services:

```bash
docker compose --env-file .env.docker up -d --build
```

Docker runs these services:

- `fieldpulse-postgres`: PostgreSQL 17 with persistent named volume
- `fieldpulse-backend`: compiled Fastify backend exposed on port `3000`
- `./uploads:/app/uploads`: persistent photo storage

Check the services and backend logs:

```bash
docker compose ps
docker compose logs -f backend
curl http://localhost:3000/health
```

When migrations must be executed from the project host:

```bash
source .env.docker
DATABASE_URL="postgresql://gazua_inspections:${POSTGRES_PASSWORD}@localhost:5432/fieldpulse" \
  npx prisma migrate deploy
```

Docker Compose creates and starts the backend; `npm run dev` is no longer required for the containerized setup.

## PostgreSQL with Docker

Start or inspect PostgreSQL only when needed:

```bash
docker compose --env-file .env.docker up -d postgres
docker compose ps
docker exec -it fieldpulse-postgres psql -U gazua_inspections -d fieldpulse
```

Keep database credentials in `.env.docker`, not in source control or committed Compose values.

## Install and Database Setup

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

For a development database while creating a migration:

```bash
npx prisma migrate dev
```

## Run the Server

Containerized daily usage does not require `npm run dev`:

```bash
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker down
docker compose restart backend
docker compose logs -f backend
```

Rebuild the backend after Dockerfile or application source changes:

```bash
docker compose --env-file .env.docker up -d --build
```

For backend-only host development with file watching:

```bash
npm run dev
```

For a production-style host build:

```bash
npm run build
npm start
```

The API listens on port `3000` by default and is accessible at:

```text
http://localhost:3000/api/v1
```

For a physical mobile device, use the server computer's LAN IP address, for example:

```text
http://192.168.1.20:3000/api/v1
```

## API Routes

### Health

| Method | Route | Authentication | Description |
|---|---|---|---|
| GET | `/health` | No | Server availability check |

### Authentication

| Method | Route | Authentication | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | No | Create a user and organization |
| POST | `/api/v1/auth/login` | No | Login and receive access/refresh tokens |
| POST | `/api/v1/auth/refresh` | Refresh token in body | Renew the token pair |
| POST | `/api/v1/auth/logout` | No | Revoke a refresh token |
| GET | `/api/v1/auth/me` | Bearer token | Return the current user profile |

### Inspections

| Method | Route | Authentication | Description |
|---|---|---|---|
| GET | `/api/v1/inspections` | Bearer token | List the current organization's inspections |
| GET | `/api/v1/inspections/:id` | Bearer token | Get an organization-owned inspection |
| POST | `/api/v1/inspections` | Bearer token | Create an inspection |
| PATCH | `/api/v1/inspections/:id` | Bearer token | Update an organization-owned inspection |
| DELETE | `/api/v1/inspections/:id` | Bearer token | Delete an inspection and its photo |
| POST | `/api/v1/inspections/:id/photo` | Bearer token | Upload a JPEG, PNG, or WebP photo |
| GET | `/api/v1/files/inspections/:filename` | Bearer token | Download a protected organization photo |

Protected routes require:

```text
Authorization: Bearer <access-token>
```

## Organization Security

Every authenticated JWT contains a user ID and organization ID. Inspection queries use the organization ID in the database filter, so a user can read, modify, or delete only records belonging to that user's organization.

Inspection photo filenames start with the organization ID. The file route verifies that:

- The filename contains no path separators.
- The filename belongs to the current organization.
- The resolved file exists in `uploads/inspections`.

This prevents cross-organization access and directory traversal through filename parameters.

## Photo Storage

Photos are streamed from multipart uploads to:

```text
uploads/inspections/
```

Generated filenames have the format:

```text
<organization-id>-<random-id>.<jpg|png|webp>
```

The database stores a relative URL such as:

```text
/files/inspections/<filename>
```

Clients must prepend `/api/v1` when constructing the protected download URL and send the bearer token in the download request.

## Local Development Data

The default directory layout is:

```text
src/
  app.ts                         Fastify application setup
  server.ts                      HTTP listener
  config/env.ts                  Environment validation
  database/prisma.ts             Prisma client
  modules/auth/                  Registration and token routes/services
  modules/inspections/           Inspection and photo routes/services
  plugins/authenticate.ts        JWT verification decorator

prisma/
  schema.prisma                  PostgreSQL models
  migrations/                    Database migrations

uploads/
  inspections/                   Inspection photo files

test/
  unit and integration tests
```

## Tests

Run the test suite:

```bash
npm test
```

Build TypeScript before deployment:

```bash
npm run build
```

## Production Notes

- Use HTTPS instead of exposing clear-text HTTP publicly.
- Store secret keys and database credentials outside source control in `.env.docker` or a secret manager.
- Keep `.env`, `.env.docker`, uploads, and coverage artifacts untracked by Git.
- Replace development credentials with unique production credentials.
- Back up PostgreSQL and the `uploads/inspections` directory together.
- In container or multi-host deployments, persist the photo directory with a named volume or host bind mount.
- Do not serve uploaded files with public static routes; continue using the authenticated organization-scoped route.
- Rebuild the backend image after source or Dockerfile changes and restart the Compose service.
- Rotate exposed JWT access tokens, refresh tokens, database passwords, and user passwords immediately after accidental disclosure.
