// ==========================================
// Supabase REST Client (مباشر بدون SDK)
// ==========================================

let _supabaseReady = false;

function _supaUrl() {
  return window.SUPABASE_CONFIG.url.replace(/\/+$/, '') + '/rest/v1';
}

function _supaHeaders() {
  return {
    'apikey': window.SUPABASE_CONFIG.anonKey,
    'Authorization': 'Bearer ' + window.SUPABASE_CONFIG.anonKey,
    'Content-Type': 'application/json',
  };
}

async function _supa(method, path, opts) {
  opts = opts || {};
  var url = _supaUrl() + '/' + path.replace(/^\//, '');
  var headers = _supaHeaders();
  if (opts.single) headers['Accept'] = 'application/vnd.pgrst.object+json';
  if (opts.prefer) headers['Prefer'] = opts.prefer;
  if (opts.count) headers['Prefer'] = 'count=' + opts.count;
  try {
    var res = await fetch(url, {
      method: method,
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeout || 15000),
    });
    if (opts.noContent) return;
    if (!res.ok) {
      var err = await res.json().catch(function () { return { message: res.status === 406 ? 'السجل غير موجود' : res.statusText }; });
      throw new Error(err.message || 'HTTP ' + res.status);
    }
    if (opts.single) return await res.json();
    return await res.json();
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('انتهت مهلة الاتصال بقاعدة البيانات');
    throw e;
  }
}

async function initSupabase() {
  var cfg = window.SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.anonKey || cfg.url.includes('YOUR_PROJECT')) {
    _supabaseReady = false;
    return false;
  }
  try {
    await _supa('GET', 'subscription_plans?select=id&limit=1', { timeout: 8000 });
    _supabaseReady = true;
    return true;
  } catch (e) {
    console.error('Supabase connection error:', e);
    _supabaseReady = false;
    return false;
  }
}

window.getCustomers = async function () {
  return await _supa('GET', 'customers?select=id,name,phone,email,address,login_email,notes,created_at&order=name.asc');
};

window.createCustomer = async function (obj) {
  return await _supa('POST', 'customers?select=id,name,phone,email,login_email,notes', { body: obj, single: true });
};

window.updateCustomer = async function (id, obj) {
  await _supa('PATCH', 'customers?id=eq.' + id, { body: obj, noContent: true });
};

window.deleteCustomer = async function (id) {
  await _supa('DELETE', 'customers?id=eq.' + id, { noContent: true });
};

window.getPlans = async function () {
  return await _supa('GET', 'subscription_plans?select=*&order=id.asc');
};

window.createPlan = async function (obj) {
  return await _supa('POST', 'subscription_plans?select=*', { body: obj, single: true });
};

window.updatePlan = async function (id, obj) {
  await _supa('PATCH', 'subscription_plans?id=eq.' + id, { body: obj, noContent: true });
};

window.deletePlan = async function (id) {
  await _supa('DELETE', 'subscription_plans?id=eq.' + id, { noContent: true });
};

window.getSubscriptions = async function () {
  return await _supa('GET', 'subscriptions?select=*,customers(name,phone,email),subscription_plans(name,price)&order=created_at.desc');
};

window.getSubscriptionById = async function (id) {
  return await _supa('GET', 'subscriptions?select=*,customers(id,name,phone,email,login_email,address,notes,created_at),subscription_plans(*)&id=eq.' + id, { single: true });
};

window.createSubscription = async function (obj) {
  return await _supa('POST', 'subscriptions?select=*', { body: obj, single: true });
};

window.updateSubscription = async function (id, obj) {
  await _supa('PATCH', 'subscriptions?id=eq.' + id, { body: obj, noContent: true });
};

window.deleteSubscription = async function (id) {
  await _supa('DELETE', 'subscriptions?id=eq.' + id, { noContent: true });
};

window.getPayments = async function () {
  return await _supa('GET', 'subscription_payments?select=*,subscriptions(id,customers(name))&order=payment_date.desc');
};

window.createPayment = async function (obj) {
  return await _supa('POST', 'subscription_payments?select=*', { body: obj, single: true });
};

window.deletePayment = async function (id) {
  await _supa('DELETE', 'subscription_payments?id=eq.' + id, { noContent: true });
};

window.getCoupons = async function () {
  return await _supa('GET', 'subscription_coupons?select=*&order=code.asc');
};

window.createCoupon = async function (obj) {
  return await _supa('POST', 'subscription_coupons?select=*', { body: obj, single: true });
};

window.updateCoupon = async function (id, obj) {
  await _supa('PATCH', 'subscription_coupons?id=eq.' + id, { body: obj, noContent: true });
};

window.deleteCoupon = async function (id) {
  await _supa('DELETE', 'subscription_coupons?id=eq.' + id, { noContent: true });
};

window.getDashboardStats = async function () {
  var subs = await _supa('GET', 'subscriptions?select=*,customers(name),subscription_plans(name,price)');
  if (!subs) return { total: 0, customers: 0, active: 0, expired: 0, trial: 0, revenue: 0, subs: [] };
  var customerSet = {};
  var active = 0, expired = 0, trial = 0, cancelled = 0, paused = 0, revenue = 0;
  subs.forEach(function (s) {
    if (s.customer_id) customerSet[s.customer_id] = true;
    if (s.status === 'active') active++;
    else if (s.status === 'expired') expired++;
    else if (s.status === 'trial') trial++;
    else if (s.status === 'cancelled') cancelled++;
    else if (s.status === 'paused') paused++;
    revenue += s.total_paid || 0;
  });
  return { total: subs.length, customers: Object.keys(customerSet).length, active, expired, trial, cancelled, paused, revenue, subs };
};
