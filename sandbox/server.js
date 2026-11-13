// Delivery and wallet sandbox for the QA assessment.
// In-memory state. POST /api/v1/reset restores the seed data.
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const kobo = (n) => Math.round(n * 100);
const naira = (k) => k / 100;
const id = (p) => `${p}_${crypto.randomBytes(6).toString('hex')}`;
const now = () => new Date().toISOString();

let db;
function seed() {
  db = {
    users: [
      { id: 'biz_1', role: 'business', name: 'Ade Stores', email: 'business1@sandbox.test', password: 'Password123!' },
      { id: 'biz_2', role: 'business', name: 'Lagos Pharmacy', email: 'business2@sandbox.test', password: 'Password123!' },
      { id: 'cou_1', role: 'courier', name: 'Tunde Courier', email: 'courier1@sandbox.test', password: 'Password123!' },
      { id: 'cou_2', role: 'courier', name: 'Chioma Courier', email: 'courier2@sandbox.test', password: 'Password123!' },
    ],
    tokens: {},
    keys: [
      { id: 'key_1', owner: 'biz_1', key: 'sk_test_business1_default', revoked: false },
      { id: 'key_2', owner: 'biz_2', key: 'sk_test_business2_default', revoked: false },
    ],
    wallets: { biz_1: kobo(50000), biz_2: kobo(50000), cou_1: 0, cou_2: 0 },
    held: { biz_1: 0, biz_2: 0 },
    transactions: [],
    quotes: {},
    deliveries: {},
    idempotency: {},
    webhooks: {},
    webhookEvents: [],
  };
}
seed();

const tx = (owner, type, amount, ref) => {
  db.transactions.push({ id: id('txn'), owner, type, amount: naira(amount), reference: ref, created_at: now() });
};

// ---------- helpers ----------
const err = (res, status, code, message, fields) =>
  res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });

function auth(roles) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return err(res, 401, 'unauthorized', 'Missing bearer token');
    let user = db.tokens[t] && db.users.find((u) => u.id === db.tokens[t]);
    if (!user) {
      const k = db.keys.find((x) => x.key === t);
      if (k) user = db.users.find((u) => u.id === k.owner);
    }
    if (!user) return err(res, 401, 'unauthorized', 'Invalid token');
    if (roles && !roles.includes(user.role)) return err(res, 403, 'forbidden', 'Not allowed for this role');
    req.user = user;
    next();
  };
}

const PHONE = /^(\+234|0)[789][01]\d{8}$/;
function validateParty(p, name, errors) {
  if (!p || typeof p !== 'object') return errors.push(`${name} is required`);
  if (!p.name || String(p.name).trim().length < 2) errors.push(`${name}.name is required (min 2 characters)`);
  if (!p.phone || !PHONE.test(p.phone)) errors.push(`${name}.phone must be a valid Nigerian number`);
  if (!p.address || String(p.address).trim().length < 5 || String(p.address).length > 200)
    errors.push(`${name}.address is required (5 to 200 characters)`);
}
function validateDelivery(b) {
  const errors = [];
  validateParty(b.pickup, 'pickup', errors);
  validateParty(b.dropoff, 'dropoff', errors);
  const w = b.package && Number(b.package.weight_kg);
  if (!b.package || !b.package.description || String(b.package.description).trim().length < 2)
    errors.push('package.description is required');
  if (!(w >= 0.1 && w <= 50)) errors.push('package.weight_kg must be between 0.1 and 50');
  return errors;
}
const feeFor = (weight) => kobo(Math.round((1500 + 200 * weight) * 100) / 100);

function event(d, type) {
  const entry = { at: now(), status: d.status };
  d.history.push(entry);
  fire(d.business_id, type, d);
}
function fire(businessId, type, d) {
  const hook = db.webhooks[businessId];
  const ev = {
    id: id('evt'), type, delivery_id: d.id, status: d.status, created_at: now(),
    business_id: businessId, delivered: false,
  };
  db.webhookEvents.push(ev);
  if (!hook) return;
  fetch(hook.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev) })
    .then(() => { ev.delivered = true; })
    .catch(() => {});
}

const publicDelivery = (d) => {
  const { code, ...rest } = d;
  return rest;
};

// ---------- auth ----------
app.post('/api/v1/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 400, 'validation_error', 'email and password are required');
  const u = db.users.find((x) => x.email === email && x.password === password);
  if (!u) return err(res, 401, 'invalid_credentials', 'Invalid email or password');
  const token = crypto.randomBytes(16).toString('hex');
  db.tokens[token] = u.id;
  res.json({ token, user: { id: u.id, name: u.name, role: u.role } });
});

app.get('/api/v1/me', auth(), (req, res) => {
  const { password, ...u } = req.user;
  res.json(u);
});

// ---------- api keys ----------
app.get('/api/v1/api-keys', auth(['business']), (req, res) =>
  res.json({ data: db.keys.filter((k) => k.owner === req.user.id) }));
app.post('/api/v1/api-keys', auth(['business']), (req, res) => {
  const k = { id: id('key'), owner: req.user.id, key: `sk_test_${crypto.randomBytes(12).toString('hex')}`, revoked: false };
  db.keys.push(k);
  res.status(201).json(k);
});
app.delete('/api/v1/api-keys/:id', auth(['business']), (req, res) => {
  const k = db.keys.find((x) => x.id === req.params.id && x.owner === req.user.id);
  if (!k) return err(res, 404, 'not_found', 'Key not found');
  k.revoked = true;
  res.status(204).end();
});

// ---------- wallet ----------
app.get('/api/v1/wallet', auth(['business']), (req, res) =>
  res.json({ balance: naira(db.wallets[req.user.id]), held: naira(db.held[req.user.id]), currency: 'NGN' }));

app.post('/api/v1/wallet/top-up', auth(['business']), (req, res) => {
  const amount = Number(req.body && req.body.amount);
  if (!Number.isFinite(amount)) return err(res, 400, 'validation_error', 'amount must be a number');
  if (amount > 1000000) return err(res, 400, 'validation_error', 'amount cannot exceed 1,000,000');
  db.wallets[req.user.id] += kobo(amount);
  tx(req.user.id, 'top_up', kobo(amount), null);
  res.status(201).json({ balance: naira(db.wallets[req.user.id]) });
});

app.get('/api/v1/transactions', auth(['business', 'courier']), (req, res) =>
  res.json({ data: db.transactions.filter((t) => t.owner === req.user.id).reverse() }));

// ---------- webhooks ----------
app.put('/api/v1/webhook', auth(['business']), (req, res) => {
  const url = req.body && req.body.url;
  if (!url || !/^https?:\/\//.test(url)) return err(res, 400, 'validation_error', 'url must be http(s)');
  db.webhooks[req.user.id] = { url };
  res.json({ url });
});
app.get('/api/v1/webhook/events', auth(['business']), (req, res) =>
  res.json({ data: db.webhookEvents.filter((e) => e.business_id === req.user.id).reverse() }));

// ---------- quotes and deliveries ----------
app.post('/api/v1/deliveries/quote', auth(['business']), (req, res) => {
  const errors = validateDelivery(req.body || {});
  if (errors.length) return err(res, 422, 'validation_error', 'Invalid request', errors);
  const quote = {
    id: id('quo'), business_id: req.user.id, fee: naira(feeFor(Number(req.body.package.weight_kg))),
    expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
  };
  db.quotes[quote.id] = quote;
  res.status(201).json({ quote_id: quote.id, fee: quote.fee, currency: 'NGN', expires_at: quote.expires_at });
});

app.post('/api/v1/deliveries', auth(['business']), (req, res) => {
  const idem = req.headers['idempotency-key'];
  if (idem && db.idempotency[`${req.user.id}:${idem}`])
    return res.status(200).json(db.idempotency[`${req.user.id}:${idem}`]);
  const b = req.body || {};
  const errors = validateDelivery(b);
  if (errors.length) return err(res, 422, 'validation_error', 'Invalid request', errors);
  const q = db.quotes[b.quote_id];
  if (!q || q.business_id !== req.user.id) return err(res, 404, 'quote_not_found', 'Quote not found');
  if (new Date(q.expires_at) < new Date()) return err(res, 410, 'quote_expired', 'Quote has expired');
  const d = {
    id: id('del'), business_id: req.user.id, status: 'draft', fee: q.fee, currency: 'NGN',
    pickup: b.pickup, dropoff: b.dropoff, package: b.package, courier_id: null,
    code: String(Math.floor(1000 + Math.random() * 9000)),
    created_at: now(), history: [{ at: now(), status: 'draft' }],
  };
  db.deliveries[d.id] = d;
  const out = publicDelivery(d);
  if (idem) db.idempotency[`${req.user.id}:${idem}`] = out;
  res.status(201).json(out);
});

app.get('/api/v1/deliveries', auth(['business']), (req, res) =>
  res.json({ data: Object.values(db.deliveries).filter((d) => d.business_id === req.user.id).reverse().map(publicDelivery) }));

app.get('/api/v1/deliveries/:id', auth(['business', 'courier']), (req, res) => {
  const d = db.deliveries[req.params.id];
  if (!d) return err(res, 404, 'not_found', 'Delivery not found');
  res.json(publicDelivery(d));
});

app.get('/api/v1/deliveries/:id/code', auth(['business']), (req, res) => {
  const d = db.deliveries[req.params.id];
  if (!d || d.business_id !== req.user.id) return err(res, 404, 'not_found', 'Delivery not found');
  res.json({ code: d.code });
});

app.get('/api/v1/deliveries/:id/tracking', auth(['business']), (req, res) => {
  const d = db.deliveries[req.params.id];
  if (!d || d.business_id !== req.user.id) return err(res, 404, 'not_found', 'Delivery not found');
  res.json({ status: d.status, history: d.history });
});

app.post('/api/v1/deliveries/:id/publish', auth(['business']), (req, res) => {
  const d = db.deliveries[req.params.id];
  if (!d || d.business_id !== req.user.id) return err(res, 404, 'not_found', 'Delivery not found');
  if (d.status !== 'draft') return err(res, 409, 'invalid_status', `Cannot publish a ${d.status} delivery`);
  d.status = 'pending';
  event(d, 'delivery.pending');
  res.json(publicDelivery(d));
});

function release(d, refundRecorded) {
  const bid = d.business_id;
  const amt = kobo(d.fee);
  db.held[bid] -= amt;
  db.wallets[bid] += amt;
  if (refundRecorded) tx(bid, 'refund', amt, d.id);
}

app.post('/api/v1/deliveries/:id/cancel', auth(['business']), (req, res) => {
  const d = db.deliveries[req.params.id];
  if (!d || d.business_id !== req.user.id) return err(res, 404, 'not_found', 'Delivery not found');
  if (!['draft', 'pending', 'assigned'].includes(d.status))
    return err(res, 409, 'invalid_status', `Cannot cancel a ${d.status} delivery`);
  if (d.status === 'assigned') {
    release(d, false);
  }
  d.status = 'cancelled';
  event(d, 'delivery.cancelled');
  res.json(publicDelivery(d));
});

// ---------- courier actions ----------
app.post('/api/v1/courier/deliveries/:id/accept', auth(['courier']), (req, res) => {
  const d = db.deliveries[req.params.id];
  if (!d) return err(res, 404, 'not_found', 'Delivery not found');
  const alreadyMine = d.status === 'assigned' && d.courier_id === req.user.id;
  if (d.status !== 'pending' && !alreadyMine)
    return err(res, 409, 'invalid_status', `Cannot accept a ${d.status} delivery`);
  const amt = kobo(d.fee);
  if (db.wallets[d.business_id] <= amt) return err(res, 402, 'insufficient_funds', 'Business wallet balance is too low');
  db.wallets[d.business_id] -= amt;
  db.held[d.business_id] += amt;
  tx(d.business_id, 'hold', amt, d.id);
  d.courier_id = req.user.id;
  d.status = 'assigned';
  event(d, 'delivery.assigned');
  res.json(publicDelivery(d));
});

app.post('/api/v1/courier/deliveries/:id/pickup', auth(['courier']), (req, res) => {
  const d = db.deliveries[req.params.id];
  if (!d) return err(res, 404, 'not_found', 'Delivery not found');
  if (d.courier_id !== req.user.id) return err(res, 403, 'forbidden', 'Not your delivery');
  if (d.status !== 'assigned') return err(res, 409, 'invalid_status', `Cannot pick up a ${d.status} delivery`);
  d.status = 'picked_up';
  event(d, 'delivery.picked_up');
  res.json(publicDelivery(d));
});

app.post('/api/v1/courier/deliveries/:id/deliver', auth(['courier']), (req, res) => {
  const d = db.deliveries[req.params.id];
  if (!d) return err(res, 404, 'not_found', 'Delivery not found');
  if (d.courier_id !== req.user.id) return err(res, 403, 'forbidden', 'Not your delivery');
  if (!['assigned', 'picked_up', 'delivered'].includes(d.status))
    return err(res, 409, 'invalid_status', `Cannot deliver a ${d.status} delivery`);
  if (!req.body || String(req.body.code) !== d.code) return err(res, 400, 'invalid_code', 'Delivery code is incorrect');
  const amt = kobo(d.fee);
  if (d.status !== 'delivered') {
    db.held[d.business_id] -= amt;
    tx(d.business_id, 'charge', amt, d.id);
  }
  const payout = Math.round(amt * 0.8);
  db.wallets[req.user.id] += payout;
  tx(req.user.id, 'payout', payout, d.id);
  d.status = 'delivered';
  event(d, 'delivery.delivered');
  fire(d.business_id, 'delivery.delivered', d);
  res.json(publicDelivery(d));
});

app.post('/api/v1/courier/deliveries/:id/cancel', auth(['courier']), (req, res) => {
  const d = db.deliveries[req.params.id];
  if (!d) return err(res, 404, 'not_found', 'Delivery not found');
  if (d.courier_id !== req.user.id) return err(res, 403, 'forbidden', 'Not your delivery');
  if (d.status !== 'assigned') return err(res, 409, 'invalid_status', `Cannot cancel a ${d.status} delivery`);
  release(d, true);
  d.courier_id = null;
  d.status = 'pending';
  event(d, 'delivery.pending');
  res.json(publicDelivery(d));
});

app.get('/api/v1/courier/deliveries', auth(['courier']), (req, res) =>
  res.json({ data: Object.values(db.deliveries).filter((d) => d.status === 'pending' || d.courier_id === req.user.id).map(publicDelivery) }));

// ---------- reset and docs ----------
app.post('/api/v1/reset', (req, res) => { seed(); res.json({ ok: true }); });
app.get('/openapi.json', (req, res) => res.sendFile(path.join(__dirname, 'openapi.json')));
app.get('/docs', (req, res) => res.send(`<!doctype html><html><head><title>Sandbox API docs</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css"></head>
<body><div id="ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
<script>SwaggerUIBundle({url:'/openapi.json',dom_id:'#ui'})</script></body></html>`));

app.use('/api', (req, res) => err(res, 404, 'not_found', 'Unknown endpoint'));
app.use((e, req, res, next) => err(res, 400, 'bad_request', 'Malformed request body'));

const port = process.env.PORT || 4000;
if (require.main === module) app.listen(port, () => console.log(`Sandbox running on http://localhost:${port}`));
module.exports = app;
