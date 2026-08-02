# QuickCartPOS

A multi-tenant sales-tracking and forecasting web app for small businesses. Each
business gets its own account and its own private sales data — record sales one
at a time or import a spreadsheet of past history, then get dashboards, category
breakdowns, and an AI-generated revenue forecast trained on that business's own
numbers.

## Features

- **Accounts & tenancy** — every business's sales data is fully isolated; nobody
  can see or touch another business's records, including by guessing an ID
- **Record sales** one at a time, or **import a CSV** of existing history (common
  column-name variations like `Sale Date`/`Product`/`Qty` are recognized
  automatically — no need to match an exact template)
- **Dashboards**: sales overview, category performance, customer/order insights,
  full sales list with sort/edit/delete, CSV export
- **AI revenue forecasting** — a fresh regression model is trained per business,
  per request, on that business's own monthly totals (not one static model
  trained on sample data). Falls back gracefully with a clear message if there
  isn't enough sales history yet
- **Security**: hashed + salted passwords, CSRF protection on every form, rate
  limiting on login/register/password-reset, a minimum password strength
  requirement, and a full forgot/reset-password flow

## Tech stack

| Layer          | Tools |
|-----------------|-------|
| Frontend        | HTML, CSS, vanilla JS, Chart.js |
| Backend         | Node.js / Express, EJS templates |
| Database        | MongoDB (Mongoose) |
| Forecasting     | Python, Flask, scikit-learn |
| Containerization | Docker / Docker Compose |

## Running locally

### Option A — Docker Compose (recommended)

Starts the web app, MongoDB, and the forecasting service together:

```bash
docker-compose up --build
```

Then open **http://localhost:3000**.

### Option B — running each piece yourself

Needs Node.js, Python 3, and a running MongoDB instance.

```bash
npm install
npm start
```

In a separate terminal, for the forecasting service:

```bash
cd AI
pip install -r requirements.txt
python predict-server.py
```

Then open **http://localhost:3000**.

## Environment variables

Create a `.env` file in the project root (never commit this — it's gitignored):

```bash
MONGO_URI=mongodb://127.0.0.1:27017/quickcartPOS
SECRET_KEY=some-long-random-string
PORT=3000
FORECAST_SERVICE_URL=http://127.0.0.1:5001

# Optional — for real password-reset emails. Without these, reset links are
# logged to the server console instead (fine for local dev/testing).
# SMTP_HOST=smtp.yourprovider.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=
```

`SECRET_KEY` signs sessions and JWTs — use a long random value, and a
different one in production than in dev.

## Testing

```bash
npm test
```

Covers auth, CSRF enforcement, rate limiting, the forgot/reset-password flow,
and tenant isolation (two separate businesses, verifying neither can see or
modify the other's data).

## Project structure

```
index.js            Express app (routes, middleware) — server.js starts it listening
mongo.js / sale.js   Mongoose models (User, Sale)
utils/               CSV import parsing, password-reset email sending
src/                 EJS-rendered views, styles, client-side JS
AI/                  Flask forecasting service (separate from the Node app)
tests/               Jest + Supertest test suite
```
