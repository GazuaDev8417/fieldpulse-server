# FieldPulse Backend

REST API and PostgreSQL data layer for the FieldPulse mobile application. It manages users, organizations, JWT authentication, organization invitations, inspections, photo uploads, protected photo downloads, and cross-device synchronization.

## Features

- User registration and login
- Registration creates an organization and an owner membership for the new user
- Owner-created, email-delivered invitations for `ADMIN`, `INSPECTOR`, or `VIEWER` memberships
- Invitation acceptance for existing accounts and registration for invited new accounts
- Organization-scoped authorization for inspections and photos
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

For running the backend directly on the host, create `.env` from the example:

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

The Compose configuration starts both PostgreSQL and the Fastify backend. Create `.env.docker` in the project root and add the following variables:

```bash
touch .env.docker
chmod 600 .env.docker
```

```dotenv
POSTGRES_PASSWORD=your-postgresql-password
JWT_ACCESS_SECRET=replace-with-a-secret-of-at-least-32-characters
JWT_REFRESH_SECRET=replace-with-a-different-secret-of-at-least-32-characters
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM="FieldPulse <no-reply@example.com>"
INVITATION_ACCEPT_URL=fieldpulse://invitation/accept
```

Use the PostgreSQL password configured for the database volume. Compose requires `POSTGRES_PASSWORD`; it does not silently start with an empty password. Keep `.env.docker` private and untracked.

Build and start the services:

```bash
docker compose --env-file .env.docker up -d --build
```

Docker runs these services:

- `fieldpulse-postgres`: PostgreSQL 17 with persistent named volume
- `fieldpulse-backend`: compiled Fastify backend exposed on port `3000`
- `./uploads:/app/uploads`: host directory mounted for persistent photo storage

Check the services and backend logs:

```bash
docker compose ps
docker compose logs -f backend
curl http://localhost:3000/health
```

The production Docker image runs the compiled server; it does not contain the Prisma CLI or migration files. Apply migrations from the project host while the PostgreSQL container is running. Install project dependencies first if needed, then export the variables from `.env.docker` and use the host-mapped PostgreSQL port:

```bash
set -a
. ./.env.docker
set +a

DATABASE_URL="postgresql://gazua_inspections:${POSTGRES_PASSWORD}@localhost:5432/fieldpulse" \
  npx prisma migrate deploy
```

If the database password contains reserved URL characters (for example `@`, `:`, `/`, or `#`), URL-encode the password in `DATABASE_URL`.

## Run the Server

Containerized daily usage does not require `npm run dev`:

```bash
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker down
docker compose --env-file .env.docker restart backend
docker compose --env-file .env.docker logs -f backend
```

Rebuild the backend after Dockerfile or application source changes:

```bash
docker compose --env-file .env.docker up -d --build
```

For backend-only host development with file watching:

```bash
npm install
npx prisma generate
npm run dev
```

For this mode, configure `.env` with a reachable PostgreSQL `DATABASE_URL` and the required JWT secrets. If PostgreSQL runs in this project's Docker Compose stack, use `localhost:5432` from the host and apply migrations with:

```bash
npx prisma migrate deploy
```

Use `npx prisma migrate dev` only when creating or changing migrations in development.

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

### Organization Invitations

Only a member with the `OWNER` role can create invitations. Invitations expire after seven days, can be accepted once, and store only a hash of the invitation token.

| Method | Route | Authentication | Description |
|---|---|---|---|
| POST | `/api/v1/organizations/invitations` | Bearer token; `OWNER` only | Send an invitation with the `ADMIN`, `INSPECTOR`, or `VIEWER` role |
| POST | `/api/v1/organizations/invitations/accept` | Bearer token | Accept an invitation for the authenticated account; account email must match |
| POST | `/api/v1/auth/invitations/register` | No | Create an account and membership from an invitation |

SMTP settings and `INVITATION_ACCEPT_URL` must be available to the backend container. The default invitation URL uses the `fieldpulse://` app scheme; it is not a hosted web page and will not display the mobile acceptance screen in a desktop browser.

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

The current registration and login flow creates a new organization for each registered account and selects the user's earliest organization membership at login. Organization invitations, membership administration, and switching between multiple organizations are not exposed by the current API.

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

## Current Scope and Limitations

- The backend exposes inspection create, read, update, and delete routes; the current mobile app primarily creates, lists, and deletes inspections.
- Only an `OWNER` can create invitations. The API does not yet provide member listing, changing member roles, removing members, or transferring ownership.
- Role-based inspection permissions are not implemented yet: authenticated members currently use the same inspection routes regardless of whether their membership role is `ADMIN`, `INSPECTOR`, or `VIEWER`. In particular, `VIEWER` is not currently read-only.
- The mobile profile currently offers the same three invitation roles and shows the invitation form only to `OWNER`; the backend independently enforces the owner check.
- Uploaded photos are stored on local persistent storage mounted at `uploads/inspections`; a multi-instance deployment needs shared object or file storage to serve the same photo from every instance.
- There is no automated background job that retries mobile operations left pending after offline or network failures.
- The installed Android APK has reported a clear-text HTTP network-policy failure when calling the local development API. The project configuration enables Android clear-text traffic, but the installed APK's native manifest and API connectivity remain under investigation. Production deployments must use HTTPS.

## Production Notes

- Use HTTPS instead of exposing clear-text HTTP publicly.
- Store secret keys and database credentials outside source control in `.env.docker` or a secret manager.
- Keep `.env`, `.env.docker`, uploads, and coverage artifacts untracked by Git.
- Replace development credentials with unique production credentials.
- Rotate credentials immediately if they have been exposed outside the protected local environment; `.gitignore` does not revoke or protect secrets that were already shared.
- Back up PostgreSQL and the `uploads/inspections` directory together.
- In container or multi-host deployments, persist the photo directory with a named volume or host bind mount.
- Do not serve uploaded files with public static routes; continue using the authenticated organization-scoped route.
- Rebuild the backend image after source or Dockerfile changes and restart the Compose service.
- Rotate exposed JWT access tokens, refresh tokens, database passwords, and user passwords immediately after accidental disclosure.
