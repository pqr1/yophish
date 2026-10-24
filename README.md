# Yophish

> A lightweight phishing-awareness simulation sandbox: create campaigns, send tracked emails, and measure who opens or clicks.

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-blue)

Yophish pairs a vanilla HTML/CSS/JS frontend with a Node.js + Express backend and a SQLite database. It is built to make it easy to understand how authentication, campaigns, and tracking metrics connect end to end.

> ⚠️ **For authorized security-awareness training and education only.** Only send simulations to people who have agreed to take part (for example, your own organization with written approval). Never use this project against real targets without permission.

## Screenshots

<!-- Replace with your own images, e.g. put them in a /screenshots folder -->
| Overview dashboard | New campaign | Results |
|---|---|---|
| ![Overview](screenshots/overview.png) | ![Campaign](screenshots/campaign.png) | ![Results](screenshots/result.png) |

## Features

- 🔐 JWT authentication (login and signup)
- 📊 KPI dashboard with campaign timeline
- ✉️ Create campaigns, add recipients, pick a template, and send via Resend
- 👁️ Open and click tracking through Resend webhooks
- 👥 Staff outcome table and per-campaign results
- 🌱 Demo data seeded automatically
- 🪶 No frontend build step

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js, Express |
| Database | SQLite |
| Auth | JSON Web Tokens (JWT) |
| Email | [Resend](https://resend.com) |

## Project structure

```
.
├── yophish-backend
│   ├── controllers/     # Route logic (auth, campaigns, transactional)
│   ├── database/        # SQLite connection + init helper
│   ├── middleware/      # JWT guard
│   ├── routes/          # API route definitions
│   ├── services/        # Resend integration helpers
│   ├── .env.example     # Copy to .env and fill in secrets
│   ├── package.json
│   └── server.js        # Express bootstrap
└── yophish-frontend
    ├── css/style.css    # Shared styling
    ├── js/              # Page logic + API helper
    ├── index.html       # Login + signup
    ├── overview.html    # KPI dashboard + timeline
    ├── staff.html       # Staff outcome table
    ├── campaign.html    # Create and send campaigns
    ├── result.html      # Per-campaign outcomes
    └── setting.html     # Logout
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 18 or newer
- A [Resend](https://resend.com) account (only needed for live email sending)

### Backend

```bash
cd yophish-backend
npm install
cp .env.example .env     # then fill in the values below
npm run init-db          # creates the schema and demo data
npm start                # http://localhost:3000
```

Environment variables (`.env`):

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Your Resend API key |
| `RESEND_FROM` | Verified sender address |
| `RESEND_REPLY_TO` | Reply-to address |
| `RESEND_WEBHOOK_SECRET` | *(optional)* Used to verify webhook events |

> Without Resend credentials, sending routes return a configuration error instead of trying to send.

### Frontend

Open `yophish-frontend/index.html` in your browser (or serve the folder with any static file server).

Demo account: `admin@yophish.app` / `password123`

## Usage

1. **Overview**: timeline and KPI circles from `/api/overview`
2. **Staff Statistics**: outcome table from `/api/staff`
3. **New Campaign**: add recipients, choose a template, send
4. **Result**: pick a campaign to see opens and clicks per recipient
5. **Setting**: log out (clears the stored token)

## Resend integration

1. Add your API key and verified sender in `.env`.
2. In Resend → Webhooks, create a webhook pointing to `https://<your-host>/api/webhooks/resend` and copy its secret into `RESEND_WEBHOOK_SECRET`.
3. Each campaign email is tagged with `campaign_id` and `recipient_id`, so incoming `email.*` events update the matching recipient (opens are recorded, clicks also raise the risk level).

### API endpoints (selection)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/campaigns/send` | Send a tagged campaign email |
| `POST` | `/api/send-email` | Send a general transactional email |
| `POST` | `/api/webhooks/resend` | Receive Resend open/click events |
| `GET` | `/api/overview` | Dashboard data |
| `GET` | `/api/staff` | Staff statistics |

Quick test:

```bash
curl -X POST http://localhost:3000/api/send-email \
  -H "Content-Type: application/json" \
  -d '{"to":"youraddress@example.com","subject":"Test","html":"<strong>Hello from Yophish</strong>"}'
```

## Notes

- JWT tokens are stored in `localStorage`; pages redirect to login when the token is missing.
- Seed data includes one campaign and a few recipients so the dashboards are populated immediately.
- The demo credentials are for local development only. Change them before any real deployment.

## License

Distributed under the MIT License. See `LICENSE` for details.

## Author

**Faisal Alrumihi**
