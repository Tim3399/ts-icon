# ts-icon

A project for managing and cropping channel banners with a web frontend and a NestJS backend. Includes Docker setup and Prisma for database management.

## Features
- Web frontend for cropping and uploading banners
- Backend API for image and channel management
- Prisma ORM with SQLite (default)
- Docker support for easy setup

## Web Frontend
The repository contains a small React + Vite frontend located at `webapp-banner-tool/` which can be used to interact with the APIs via a simple user interface (upload/crop and view banners).

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

- Default frontend configuration (see `webapp-banner-tool/src/config.ts`):


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


## API Endpoints
Below is a concise reference for the backend endpoints. Replace the port with your `IMG_WEB_PORT` (public) or `IMG_API_PORT` (local) if you changed them.

Public server (read-only, default port 3000)

- GET /images/:channelName
  - Description: Returns the stored image for the given channel name.
  - Response: binary image (Content-Type set to image mime type)
  - Example (curl): `curl http://localhost:3000/images/news -o news.png`
  - Example (PowerShell): `Invoke-WebRequest -Uri http://localhost:3000/images/news -UseBasicParsing -OutFile news.png`

- GET /images/options
  - Description: Lists available channel image options (channelName and mimeType).
  - Response: JSON `{ "options": [ { "channelName": "news", "mimeType": "image/png" }, ... ] }`
  - Example: `curl http://localhost:3000/images/options`

Local server (editing, default port 3001) — run in trusted environment only

- POST /images-local/:channelName
  - Description: Upload a file for the channel (multipart/form-data).
  - Body: form field `file` (binary)
  - Response: JSON `{ "message": "Bild erfolgreich gespeichert" }` on success
  - Example (curl): `curl -F "file=@banner.png" http://localhost:3001/images-local/news`

- POST /images-local/from-url
  - Description: Fetch an external URL and save it as the channel image.
  - Body: JSON `{ "channelName": "news", "url": "https://example.com/banner.png" }`
  - Response: JSON `{ "message": "Bild erfolgreich gespeichert" }` on success

- GET /images-local/img-from-url?url=... 
  - Description: Proxy an external image URL and return it (use with caution — SSRF risk).
  - Response: binary image

- GET /images-local/channels
  - Description: Returns a list of channels fetched via TeamSpeak query.
  - Response: JSON `{ "channels": ["news", "gaming", ...] }` or `{ "channels": [], "error": "..." }` on failure

Other notes

- Swagger UI: the local server exposes a Swagger UI (default path `/swagger`) for the editing API (see `src/main.local.ts`).
- Cache: public image responses include a `Cache-Control` header (default `public, max-age=86400` = 1 day). Do not expose the local editing server to the public internet.


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
