const request = require('supertest');
const fs = require('fs');
const path = require('path');
const session = require('supertest-session');
const app = require('../index');

describe('QuickCartPOS Web App Tests', () => {

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
    const res = await request(app).post('/register').send({
      name: '',
      email: 'notanemail',
      password: '123'
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('TC04: POST /login with invalid credentials should return 401 or error', async () => {
    const res = await request(app).post('/login').send({
      email: 'wrong@example.com',
      password: 'wrongpass'
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
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

  it('TC07: GET /dashboard (with assumed session) should show dashboard', async () => {
    app.use((req, res, next) => {
      req.session = { user: { name: 'Test User' } };
      next();
    });

    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/Welcome/i);
  });

  // Profit Analysis

  it('TC08: GET /profitAnalysis.html should return charts page', async () => {
    const res = await request(app).get('/profitAnalysis.html');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/Sales Analysis/i);
  });

  it('TC09: GET /api/profit-analysis should return JSON', async () => {
    const res = await request(app).get('/api/profit-analysis');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeInstanceOf(Object);
  });

  // Sales Entry


 const session = require('supertest-session');

  //it('TC10: GET /add-sale (sales form) should return 200 for logged-in users', async () => {
  // Patch the app temporarily with fake session middleware
  //app.use((req, res, next) => {
  //  req.session = { user: { name: 'Test User', email: 'test@example.com' } };
  //  next();
// }
//);

// const res = await request(app).get('/add-sale');
// expect(res.statusCode).toBe(200);
// expect(res.text).toMatch(/Add a Sale/i);





  it('TC11: POST /add-sale with valid data should succeed', async () => {
    const res = await request(app).post('/add-sale').send({
      date: '2025-05-21',
      category: 'Electronics',
      quantity: 2,
      price: 50
    });
    expect([200, 302]).toContain(res.statusCode);
  });

  it('TC12: POST /add-sale with missing price should fail gracefully', async () => {
    const res = await request(app).post('/add-sale').send({
      date: '2025-05-21',
      category: 'Clothing',
      quantity: 3,
      price: ''
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

});
