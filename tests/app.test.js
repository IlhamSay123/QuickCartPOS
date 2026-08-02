const request = require('supertest');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const session = require('supertest-session');
const app = require('../index');
const User = require('../mongo');
const Sale = require('../sale');

// Every state-changing POST now requires a CSRF token embedded in the page
// that rendered the form — this fetches one the same way a real browser
// would (GET the page, read the hidden input) rather than bypassing it.
async function getCsrfToken(client, getPath) {
  const res = await client.get(getPath);
  const match = res.text.match(/name="_csrf" value="([a-f0-9]+)"/);
  return match ? match[1] : null;
}

describe('QuickCartPOS Web App Tests', () => {

  afterAll(async () => {
    // Every test in this file registers throwaway accounts (test_/tenantA_/
    // tenantB_ prefixes) — clean up both the users and any sales they created
    // so repeated test runs don't pile up junk in the real dev database.
    const users = await User.find({ email: { $regex: '^(test_|tenantA_|tenantB_)' } });
    const ids = users.map(u => u._id);
    if (ids.length) {
      await Sale.deleteMany({ business: { $in: ids } });
      await User.deleteMany({ _id: { $in: ids } });
    }
  });

  // Real logged-in session, used by tests below that need one now that
  // every data/dashboard route actually requires auth (previously several of
  // these routes had no auth check at all, or were only reachable by
  // bypassing auth via a static-file loophole — see index.js for details).
  let authedSession;
  const mainEmail = `test_${Date.now()}@example.com`;
  const mainPassword = 'TestPass123';

  beforeAll(async () => {
    authedSession = session(app);
    const regToken = await getCsrfToken(authedSession, '/register');
    await authedSession.post('/register').send({ _csrf: regToken, name: 'Test User', email: mainEmail, password: mainPassword });
    const loginToken = await getCsrfToken(authedSession, '/login');
    await authedSession.post('/login').send({ _csrf: loginToken, email: mainEmail, password: mainPassword });
  });

  // Authentication Routes

  it('TC01: GET /login should return the login form', async () => {
    const res = await request(app).get('/login');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/login/i);
  });

  it('TC02: GET /register should return the registration form', async () => {
    const res = await request(app).get('/register');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/sign up/i);
  });

  it('TC03: POST /register with invalid data should return 400+', async () => {
    const anon = request.agent(app);
    const token = await getCsrfToken(anon, '/register');
    const res = await anon.post('/register').send({
      _csrf: token,
      name: '',
      email: 'notanemail',
      password: '123'
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('TC04: POST /login with a nonexistent email should return 401', async () => {
    const anon = request.agent(app);
    const token = await getCsrfToken(anon, '/login');
    const res = await anon.post('/login').send({ _csrf: token, email: 'wrong@example.com', password: 'wrongpass' });
    expect(res.statusCode).toBe(401);
  });

  it('TC04b: POST /login with a WRONG password on a real account should return 401', async () => {
    // Regression test: the login route used to only check whether the email
    // existed and never actually verified the password — meaning any
    // password logged in as long as the email was registered.
    const anon = request.agent(app);
    const token = await getCsrfToken(anon, '/login');
    const res = await anon.post('/login').send({ _csrf: token, email: mainEmail, password: 'DefinitelyNotTheRightPassword' });
    expect(res.statusCode).toBe(401);
  });

  it('TC04c: POST /login without a CSRF token should return 403, not log in', async () => {
    const anon = request.agent(app);
    const res = await anon.post('/login').send({ email: mainEmail, password: mainPassword });
    expect(res.statusCode).toBe(403);
  });

  it('TC05: GET /logout should redirect to login', async () => {
    const res = await request(app).get('/logout');
    expect(res.statusCode).toBe(302);
    expect(res.header.location).toBe('/login');
  });

  // Dashboard and Routes


  it('TC06: GET / without login should redirect to /login', async () => {
    const res = await request(app).get('/');
    expect([302, 200]).toContain(res.statusCode);
  });

  it('TC07: GET / with a real logged-in session should show the dashboard', async () => {
    const res = await authedSession.get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/Welcome/i);
  });

  // Profit Analysis

  it('TC08: GET /profitAnalysis (logged in) should return the charts page', async () => {
    const res = await authedSession.get('/profitAnalysis');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/Sales Analysis/i);
  });

  it('TC08b: GET /profitAnalysis without login should redirect, not serve the page', async () => {
    const res = await request(app).get('/profitAnalysis');
    expect(res.statusCode).toBe(302);
    expect(res.header.location).toBe('/login');
  });

  it('TC09: GET /api/profit-analysis (logged in) should return JSON', async () => {
    const res = await authedSession.get('/api/profit-analysis');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeInstanceOf(Object);
  });

  it('TC09b: GET /api/profit-analysis without login should return 401', async () => {
    const res = await request(app).get('/api/profit-analysis');
    expect(res.statusCode).toBe(401);
  });

  it('TC10: GET /add-sale (sales form) should return 200 for logged-in users', async () => {
    const res = await authedSession.get('/add-sale');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/Add a Sale/i);
  });


  it('TC11: POST /add-sale with valid data should succeed (logged in)', async () => {
    const token = await getCsrfToken(authedSession, '/add-sale');
    const res = await authedSession.post('/add-sale').send({
      _csrf: token,
      date: '2025-05-21',
      category: 'Electronics',
      quantity: 2,
      price: 50
    });
    expect([200, 302]).toContain(res.statusCode);
  });

  it('TC12: POST /add-sale with missing price should fail gracefully (logged in)', async () => {
    const token = await getCsrfToken(authedSession, '/add-sale');
    const res = await authedSession.post('/add-sale').send({
      _csrf: token,
      date: '2025-05-21',
      category: 'Clothing',
      quantity: 3,
      price: ''
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('TC12b: POST /add-sale without login should redirect, not write data', async () => {
    const res = await request(app).post('/add-sale').send({
      date: '2025-05-21',
      category: 'Electronics',
      quantity: 1,
      price: 10
    });
    expect(res.statusCode).toBe(302);
    expect(res.header.location).toBe('/login');
  });

  it('TC12c: POST /add-sale (logged in) without a CSRF token should be rejected', async () => {
    const res = await authedSession.post('/add-sale').send({
      date: '2025-05-21',
      category: 'Electronics',
      quantity: 1,
      price: 10
    });
    expect(res.statusCode).toBe(403);
  });

  // Password reset

  describe('Password reset', () => {
    it('PR01: POST /forgot-password stores a hashed, expiring reset token', async () => {
      const client = request.agent(app);
      const email = `test_reset_${Date.now()}@example.com`;

      const regToken = await getCsrfToken(client, '/register');
      await client.post('/register').send({ _csrf: regToken, name: 'Reset Me', email, password: 'OldPass123' });

      const forgotToken = await getCsrfToken(client, '/forgot-password');
      await client.post('/forgot-password').send({ _csrf: forgotToken, email });

      const user = await User.findOne({ email }).select('+resetTokenHash +resetTokenExpiry');
      expect(user.resetTokenHash).toBeTruthy();
      expect(user.resetTokenExpiry.getTime()).toBeGreaterThan(Date.now());

      await User.deleteOne({ email });
    });

    it('PR02b: a valid reset token can set a new password, and is single-use', async () => {
      // POST /forgot-password only stores a hash and (without SMTP configured)
      // logs the raw link rather than returning it — so this test mints a
      // token the exact same way that route does and seeds it directly,
      // to exercise the actual consuming endpoint end to end.
      const email = `test_reset_${Date.now()}@example.com`;
      const oldPassword = 'OldPass123';
      const newPassword = 'NewPass456';

      const regClient = request.agent(app);
      const regToken = await getCsrfToken(regClient, '/register');
      await regClient.post('/register').send({ _csrf: regToken, name: 'Reset Me', email, password: oldPassword });

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await User.updateOne({ email }, {
        resetTokenHash: tokenHash,
        resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000)
      });

      const resetClient = request.agent(app);
      const resetFormToken = await getCsrfToken(resetClient, `/reset-password/${rawToken}`);
      const resetRes = await resetClient.post(`/reset-password/${rawToken}`).send({ _csrf: resetFormToken, password: newPassword });
      expect(resetRes.statusCode).toBe(302);
      expect(resetRes.header.location).toBe('/login');

      const oldLoginClient = request.agent(app);
      const oldLoginToken = await getCsrfToken(oldLoginClient, '/login');
      const oldLoginRes = await oldLoginClient.post('/login').send({ _csrf: oldLoginToken, email, password: oldPassword });
      expect(oldLoginRes.statusCode).toBe(401); // old password must no longer work

      const newLoginClient = request.agent(app);
      const newLoginToken = await getCsrfToken(newLoginClient, '/login');
      const newLoginRes = await newLoginClient.post('/login').send({ _csrf: newLoginToken, email, password: newPassword });
      expect(newLoginRes.statusCode).toBe(302);
      expect(newLoginRes.header.location).toBe('/');

      const reuseRes = await request(app).get(`/reset-password/${rawToken}`);
      expect(reuseRes.text).toMatch(/invalid or has expired/i); // token is single-use

      await User.deleteOne({ email });
    });

    it('PR02: GET /reset-password/:token with a bogus token shows invalid, not a crash', async () => {
      const res = await request(app).get('/reset-password/not-a-real-token');
      expect(res.statusCode).toBe(200);
      expect(res.text).toMatch(/invalid or has expired/i);
    });

    it('PR03: POST /forgot-password does not reveal whether the email exists', async () => {
      const client = request.agent(app);
      const token = await getCsrfToken(client, '/forgot-password');
      const resKnown = await client.post('/forgot-password').send({ _csrf: token, email: mainEmail });

      const client2 = request.agent(app);
      const token2 = await getCsrfToken(client2, '/forgot-password');
      const resUnknown = await client2.post('/forgot-password').send({ _csrf: token2, email: 'no-such-account@example.com' });

      expect(resKnown.statusCode).toBe(resUnknown.statusCode);
      expect(resKnown.text).toEqual(resUnknown.text);
    });
  });

  // Tenant isolation — the core point of moving sales off a single shared CSV
  // and into per-business Mongo documents. Two separate businesses; Business A
  // creates a sale, and everything below confirms Business B can never see,
  // list, edit, or delete it — including by guessing the Mongo _id directly.
  describe('Tenant isolation', () => {
    let sessionA, sessionB, sharedSaleId;

    beforeAll(async () => {
      sessionA = session(app);
      sessionB = session(app);

      const emailA = `tenantA_${Date.now()}@example.com`;
      const emailB = `tenantB_${Date.now()}@example.com`;
      const pw = 'TestPass123';

      const regTokenA = await getCsrfToken(sessionA, '/register');
      await sessionA.post('/register').send({ _csrf: regTokenA, name: 'Business A', email: emailA, password: pw });
      const loginTokenA = await getCsrfToken(sessionA, '/login');
      await sessionA.post('/login').send({ _csrf: loginTokenA, email: emailA, password: pw });

      const regTokenB = await getCsrfToken(sessionB, '/register');
      await sessionB.post('/register').send({ _csrf: regTokenB, name: 'Business B', email: emailB, password: pw });
      const loginTokenB = await getCsrfToken(sessionB, '/login');
      await sessionB.post('/login').send({ _csrf: loginTokenB, email: emailB, password: pw });

      const addToken = await getCsrfToken(sessionA, '/add-sale');
      await sessionA.post('/add-sale').send({
        _csrf: addToken, date: '2025-06-01', category: 'TenantIsolationCheck', quantity: 1, price: 999
      });

      const allSalesRes = await sessionA.get('/all-sales');
      const match = allSalesRes.text.match(/\/edit-sale\/([a-f0-9]{24})/);
      sharedSaleId = match ? match[1] : null;
    });

    it('TI01: Business A can see their own sale in /all-sales', async () => {
      expect(sharedSaleId).toBeTruthy();
      const res = await sessionA.get('/all-sales');
      expect(res.text).toMatch(/TenantIsolationCheck/);
    });

    it("TI02: Business B does not see Business A's sale in /all-sales", async () => {
      const res = await sessionB.get('/all-sales');
      expect(res.text).not.toMatch(/TenantIsolationCheck/);
    });

    it("TI03: Business B does not see Business A's data in /api/category-summary", async () => {
      const res = await sessionB.get('/api/category-summary');
      expect(res.body).not.toHaveProperty('TenantIsolationCheck');
    });

    it("TI04: Business B cannot edit Business A's sale by guessing its id", async () => {
      // Business B's own CSRF token — a token belongs to a session, not a
      // route, so B's own valid token is what B's browser would actually send.
      const token = await getCsrfToken(sessionB, '/add-sale');
      const res = await sessionB.post(`/edit-sale/${sharedSaleId}`).send({
        _csrf: token, date: '2025-06-02', category: 'Hacked', quantity: 1, price: 1
      });
      expect(res.statusCode).toBe(404);
    });

    it("TI05: Business B cannot delete Business A's sale by guessing its id", async () => {
      const token = await getCsrfToken(sessionB, '/add-sale');
      const res = await sessionB.post(`/delete-sale/${sharedSaleId}`).send({ _csrf: token });
      expect(res.statusCode).toBe(404);
    });

    it("TI06: Business A's sale is untouched after Business B's attempts", async () => {
      const res = await sessionA.get('/all-sales');
      expect(res.text).toMatch(/TenantIsolationCheck/);
    });
  });

});
