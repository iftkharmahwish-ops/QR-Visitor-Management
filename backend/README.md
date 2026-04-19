# QR-Based Visitor Management Backend

Python backend for the final-year major project **QR-Based Visitor Management for Offices**.

## Features

- Visitor registration API
- QR code generation using `python-qrcode`
- Security desk check-in and check-out APIs
- Real-time style dashboard summary API
- Optional AI enhancement APIs:
  - face authentication placeholder
  - suspicious visiting pattern detection

## Run locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Email notification setup

1. Copy `.env.example` to `.env`
2. Ensure MongoDB is running locally or update the MongoDB connection values
3. Fill in your SMTP credentials
4. Restart the backend

MongoDB settings:

- `MONGODB_URL=mongodb://127.0.0.1:27017/`
- `MONGODB_DB_NAME=visitor_management`

SMTP settings:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_USE_TLS`

Example:

```bash
copy .env.example .env
```

When SMTP is configured, visitor registration emails can include:

- visitor confirmation message
- visitor ID
- visit details
- QR image attachment for check-in/check-out scanning

## Important API routes

- `GET /api/health`
- `POST /api/visitors/register`
- `GET /api/visitors`
- `GET /api/visitors/{visitor_id}`
- `GET /api/visitors/{visitor_id}/qr`
- `POST /api/security/checkin`
- `POST /api/security/checkout`
- `GET /api/dashboard/live-stats`
- `POST /api/ai/face-auth`
- `GET /api/ai/suspicious-patterns`
