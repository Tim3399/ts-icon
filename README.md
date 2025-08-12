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
  ```sh
  cd webapp-banner-tool
  npm install
  npm run dev
  ```
- Access via `http://localhost:5173` (default)

## Backend
- Located in `src/`
- Built with NestJS
- Main entry: `src/main.local.ts` (local) or `src/main.public.ts` (public)
- Start locally:
  ```sh
  npm install
  npm run start:local
  ```
- API endpoints for image and channel management

## Docker Setup
- Build and run with Docker Compose:
  ```sh
  docker-compose up --build
  ```
- Uses SQLite by default (`dev.db`)
- Environment variables in `.env` (excluded from git)

## Database
- Prisma schema in `prisma/schema.prisma`
- Migrations in `prisma/migrations/`
- To push schema changes:
  ```sh
  npx prisma db push
  ```

## Useful Commands
- Run backend tests:
  ```sh
  npm run test
  ```
- Run e2e tests:
  ```sh
  npm run test:e2e
  ```

## Notes
- Do not commit `.env` or `dev.db` to public repos
- Default credentials in `config.ts` are placeholders; set real values via environment variables

## Security Warning
- This project does **not** implement authentication. Services for changing icons should **not** be exposed to the public internet without proper access control.

## License
MIT
