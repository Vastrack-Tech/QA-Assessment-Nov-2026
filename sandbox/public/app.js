const $ = (s) => document.querySelector(s);
let token = null;
try { token = sessionStorage.getItem('token'); } catch (e) {}

const money = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function api(path, opts = {}) {
  const res = await fetch('/api/v1' + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function show(loggedIn, user) {
  $('#login').classList.toggle('hidden', loggedIn);
  $('#app').classList.toggle('hidden', !loggedIn);
  $('#who').innerHTML = loggedIn ? `<span data-testid="user-name">${user.name}</span> <button class="secondary" id="logout" data-testid="logout">Log out</button>` : '';
  if (loggedIn) $('#logout').onclick = () => { token = null; try { sessionStorage.removeItem('token'); } catch (e) {} show(false); };
}

async function refresh() {
  const w = await api('/wallet');
  if (w.ok) { $('#balance').textContent = money(w.data.balance); $('#held').textContent = money(w.data.held); }
  const d = await api('/deliveries');
  if (!d.ok) return;
  $('#rows').innerHTML = d.data.data.map((x) => `
    <tr data-testid="delivery-row" data-id="${x.id}">
      <td>${x.id}</td><td>${x.dropoff.address}</td><td>${money(x.fee)}</td>
      <td><span class="badge" data-testid="delivery-status">${x.status}</span></td>
      <td>${['draft', 'pending', 'assigned'].includes(x.status) ? `<button class="secondary" data-cancel="${x.id}" data-testid="cancel-delivery">Cancel</button>` : ''}</td>
    </tr>`).join('');
  document.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = async () => { await api(`/deliveries/${b.dataset.cancel}/cancel`, { method: 'POST' }); refresh(); });
}

$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  const r = await api('/auth/login', { method: 'POST', body: { email: $('#email').value, password: $('#password').value } });
  if (!r.ok) { $('#login-error').textContent = r.data?.error?.message || 'Login failed'; return; }
  if (r.data.user.role !== 'business') { $('#login-error').textContent = 'Use a business account'; return; }
  token = r.data.token;
  try { sessionStorage.setItem('token', token); } catch (e) {}
  show(true, r.data.user);
  refresh();
};

$('#topup-form').onsubmit = async (e) => {
  e.preventDefault();
  $('#topup-error').textContent = '';
  const amount = Number($('#topup').value);
  if (!$('#topup').value || !(amount >= 100)) { $('#topup-error').textContent = 'Enter an amount of at least 100'; return; }
  const r = await api('/wallet/top-up', { method: 'POST', body: { amount } });
  if (!r.ok) { $('#topup-error').textContent = r.data?.error?.message || 'Top up failed'; return; }
  $('#topup').value = '';
};

const fields = [
  ['p-name', 'Pickup name is required'], ['p-phone', 'Pickup phone is required'], ['p-addr', 'Pickup address is required'],
  ['d-name', 'Drop-off name is required'], ['d-phone', 'Drop-off phone is required'], ['d-addr', 'Drop-off address is required'],
  ['pkg-desc', 'Package description is required'], ['pkg-w', 'Weight is required'],
];

$('#delivery-form').onsubmit = async (e) => {
  e.preventDefault();
  $('#delivery-error').textContent = ''; $('#delivery-success').textContent = '';
  let bad = false;
  fields.forEach(([id, msg]) => { const empty = !$('#' + id).value.trim(); $('#' + id + '-err').textContent = empty ? msg : ''; if (empty) bad = true; });
  if (bad) return;
  const body = {
    pickup: { name: $('#p-name').value, phone: $('#p-phone').value, address: $('#p-addr').value },
    dropoff: { name: $('#d-name').value, phone: $('#d-phone').value, address: $('#d-addr').value },
    package: { description: $('#pkg-desc').value, weight_kg: Number($('#pkg-w').value) },
  };
  const q = await api('/deliveries/quote', { method: 'POST', body });
  if (!q.ok) { $('#delivery-error').textContent = (q.data?.error?.fields || [q.data?.error?.message]).join('; '); return; }
  const c = await api('/deliveries', { method: 'POST', body: { ...body, quote_id: q.data.quote_id } });
  if (!c.ok) { $('#delivery-error').textContent = c.data?.error?.message || 'Could not create delivery'; return; }
  const p = await api(`/deliveries/${c.data.id}/publish`, { method: 'POST' });
  if (!p.ok) { $('#delivery-error').textContent = p.data?.error?.message || 'Could not publish delivery'; return; }
  $('#delivery-success').textContent = `Delivery ${c.data.id} created. Fee ${money(c.data.fee)}`;
  $('#delivery-form').reset();
  refresh();
};

(async () => {
  if (token) {
    const me = await api('/me');
    if (me.ok && me.data.role === 'business') { show(true, me.data); refresh(); return; }
  }
  show(false);
})();
setInterval(() => { if (token && !$('#app').classList.contains('hidden')) refresh(); }, 5000);
