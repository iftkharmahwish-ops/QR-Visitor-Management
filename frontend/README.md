# QR-Based Visitor Management Frontend

This frontend is built for a final year B.Tech CSE major project on **QR-Based Visitor Management for Offices**.

## Included modules

- Visitor registration form
- QR code generation for mobile visitor pass
- Security desk check-in scanner
- Real-time style dashboard
- Optional AI feature section for face authentication and suspicious visit pattern detection

## Run the project

```bash
npm install
npm run dev
```

## Suggested backend integration later

- `POST /api/visitors/register`
- `GET /api/visitors/:id/qr`
- `POST /api/security/checkin`
- `GET /api/dashboard/live-stats`
- `POST /api/ai/face-verify`
- `GET /api/ai/suspicious-patterns`
