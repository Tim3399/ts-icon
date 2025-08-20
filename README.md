# ts-icon

A project for managing and cropping channel banners with a web frontend and a NestJS backend. Includes Docker setup and Prisma for database management.

## Features
- Web frontend for cropping and uploading banners
- Backend API for image and channel management
- Prisma ORM with SQLite (default)
- Docker support for easy setup

## Web Frontend
- Located in `webapp-banner-tool/`
- Built with React and Vite
- Main entry: `webapp-banner-tool/src/App.tsx`
- Start locally:
  ```powershell
  cd webapp-banner-tool
  npm install
  npm run dev
  ```
- Access via `http://localhost:5173` (default)

## Backend
- Located in `src/`
- Built with NestJS
- Main entries:
  - `src/main.local.ts` — local server (editing endpoints). Use this when you need to upload, change or crop images for TeamSpeak. This server must run in a trusted environment and should not be exposed publicly without access controls.
  - `src/main.public.ts` — public server (viewing endpoints). Use this to serve images to TeamSpeak clients or web frontends.
- Start the local (editing) server:
  ```powershell
  npm install
  npm run start:local
  ```
- API overview:
  - Editing operations (create/update/delete) are provided by the local backend (`images-local`).
  - Viewing operations (GET /images/:channelName) are provided by the public backend (`images`) so TeamSpeak or other clients can fetch images.

## Docker Setup
- Build and run with Docker Compose:
  ```powershell
  docker-compose up --build
  ```
- Uses SQLite by default (`dev.db`)
- Environment variables in `.env` (excluded from git)

## Database
- Prisma schema in `prisma/schema.prisma`
- Migrations in `prisma/migrations/`
- To push schema changes:
  ```powershell
  npx prisma db push
  ```

## Useful Commands
- Run backend tests:
  ```powershell
  npm run test
  ```
- Run e2e tests:
  ```powershell
  npm run test:e2e
  ```

## Notes
- Do not commit `.env` or `dev.db` to public repos
- Default credentials in `config.ts` are placeholders; set real values via environment variables

## Security Warning
- This project does **not** implement authentication. The local backend exposes editing endpoints (upload/change/delete). Do not expose the local editing server to the public internet without proper access control.
- The public backend should be limited to read-only/viewing endpoints when possible.

## License
MIT
