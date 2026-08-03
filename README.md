# QuickCartPOS

A multi-tenant sales-tracking and forecasting web app for small businesses. Each
business gets its own account and its own private sales data — record sales one
at a time or import a spreadsheet of past history, then get dashboards, category
breakdowns, and an AI-generated revenue forecast trained on that business's own
numbers.

## Live demo

**https://quickcartpos.onrender.com**

```
demo@quickcartpos.com
QuickCartDemo1
```

Pre-loaded with 8 months of sample sales so the dashboards, category breakdowns,
and forecast all have real data to show immediately — no need to add anything
yourself. Hosted on Render's free tier, so if it's been idle for a while the
first request can take 30-60 seconds to wake up; it's fast after that.

This is a shared public demo account — anyone with the link can edit or delete
its data, so don't rely on it staying exactly as you left it.

## What this project actually is

Originally a university final-year project. Since then it's been rebuilt into
something closer to a real product, driven by an actual security review rather
than a feature checklist. A non-exhaustive list of what changed:

- **Found and fixed a critical auth bypass** — the login route checked whether
  an email was registered but never actually verified the password against it.
  Any password logged in as long as the email existed.
- **Rebuilt the data model for real multi-tenancy** — sales used to live in a
  single shared CSV file every logged-in user could read and write. Now every
  sale belongs to exactly one business, enforced on every query, with
  automated tests that register two separate businesses and confirm neither
  can see, list, edit, or delete the other's data — including by guessing a
  database ID directly.
- **Closed the routes that had no auth check at all** — several data and
  write endpoints (viewing all sales, exporting them, deleting a sale) had no
  session check whatsoever, and a static-file-serving bug let anyone bypass
  the checks that *did* exist by requesting a page's raw filename directly.
- **Added CSRF protection, rate limiting, and a real password policy** —
  synchronizer tokens on every state-changing form, rate limits on
  login/register/password-reset, a minimum password strength requirement, and
  a full forgot/reset-password flow (tokens are hashed before storage, expire
  in an hour, and are single-use).
- **Reworked the forecasting service** — it used to load one scikit-learn
  model pre-trained on a static sample dataset and serve the same prediction
  to everyone. It now trains a fresh, small regression model per business,
  per request, on that business's own sales — and degrades gracefully with a
  clear message instead of an error when there isn't enough history yet.
- **Redesigned the UI** — replaced an inconsistently-loaded Bootstrap
  dependency (several pages referenced Bootstrap classes but never actually
  loaded Bootstrap, so those elements rendered completely unstyled) and three
  duplicated stylesheets with one consistent design system and a persistent
  navigation bar.
- **Added CSV import** — a new business can bring in existing sales history
  from a spreadsheet instead of starting empty, with flexible column-name
  matching so it doesn't need to match an exact template.
- **Fixed 20 dependency vulnerabilities**, removed a dead native dependency,
  and containerized properly for deployment (Docker Compose locally, Render
  in production) instead of relying on a development server not meant for
  production use.

Full history is in the commit log — nothing here is asserted without a test or
a verified fix behind it.

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
| Deployment      | Render (web services) + MongoDB Atlas |

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
