// ==========================================
// App Logic - نظام إدارة الاشتراكات
// ==========================================

var plans = [], customers = [], subscriptions = [], payments = [], coupons = [];

// ========== Init ==========
async function initApp() {
  setTimeout(function () { hideLoader(); hideLoaderError(); }, 20000);
  try {
    setLoaderText('جاري الاتصال بقاعدة البيانات...');
    var connected = await initSupabase();
    if (!connected) { hideLoader(); showSetupPage(); return; }
    setLoaderText('جاري تحميل البيانات...');
    await loadAllData();
    hideLoader();
    navigateTo('dashboard');
    checkExpiring();
  } catch (e) {
    hideLoader();
    showError(e.message || e);
  }
}

function setLoaderText(msg) {
  var el = document.querySelector('#loading-overlay p');
  if (el) el.textContent = msg;
}

function hideLoaderError() {
  var el = document.querySelector('#loading-overlay .loader-error');
  if (!el) {
    var p = document.querySelector('#loading-overlay p');
    if (p) {
      el = document.createElement('p');
      el.className = 'loader-error';
      el.style.cssText = 'margin-top:12px;font-size:12px;color:#ef4444;text-align:center;max-width:280px;line-height:1.5';
      el.textContent = 'قد يكون هناك مشكلة في الاتصال بقاعدة البيانات، يرجى التحقق من إعدادات Supabase';
      p.after(el);
    }
  }
}

function hideLoader() {
  var el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

function showError(msg) {
  var el = document.getElementById('page-dashboard');
  if (el) el.innerHTML = '<div class="bg-white rounded-2xl shadow-sm p-8 text-center max-w-md mx-auto mt-12"><div class="mb-4 flex justify-center">' + icn('alert', 'w-12 h-12 text-red-500') + '</div><h3 class="text-xl font-bold mb-2">حدث خطأ</h3><p class="text-gray-500 mb-4">' + esc(msg) + '</p><button class="bg-primary-600 text-white px-6 py-2 rounded-xl hover:bg-primary-700 transition" onclick="location.reload()">إعادة تحميل</button></div>';
}

async function loadAllData() {
  var timeout = function (ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('انتهت مهلة الاتصال بقاعدة البيانات')); }, ms); }); };
  try {
    var results = await Promise.race([
      Promise.all([getPlans(), getCustomers(), getSubscriptions(), getPayments(), getCoupons()]),
      timeout(10000)
    ]);
    plans = results[0]; customers = results[1]; subscriptions = results[2]; payments = results[3]; coupons = results[4];
  } catch (e) {
    console.error('Load error:', e);
    throw e;
  }
  await autoExpireSubs();
}

async function autoExpireSubs() {
  var changed = subscriptions.filter(function (s) {
    return (s.status === 'active' || s.status === 'trial') && s.end_date && daysUntil(s.end_date) < 0;
  });
  if (changed.length === 0) return;
  var failed = 0;
  await Promise.all(changed.map(function (s) {
    return window.updateSubscription(s.id, { status: 'expired' })
      .then(function () { s.status = 'expired'; })
      .catch(function () { failed++; });
  }));
  var done = changed.length - failed;
  if (done > 0) {
    showToast('تم تحويل ' + done + (done === 1 ? ' اشتراك منتهي' : ' اشتراكات منتهية') + ' تلقائياً', 'info');
  }
}

// ========== Sidebar ==========
function setSidebarOpen(open) {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.toggle('translate-x-full', !open);
  if (ov) ov.classList.toggle('hidden', !open);
  if (window.innerWidth < 1024) document.body.style.overflow = open ? 'hidden' : '';
}

function toggleSidebar() {
  var sb = document.getElementById('sidebar');
  if (!sb) return;
  var isOpen = !sb.classList.contains('translate-x-full');
  setSidebarOpen(!isOpen);
}

function closeSidebar() {
  setSidebarOpen(false);
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeSidebar();
});

// ========== Navigation ==========
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.add('hidden'); p.classList.remove('active'); });
  document.querySelectorAll('#sidebar nav ul li').forEach(function (l) { l.classList.remove('active-nav', 'bg-gray-800', 'text-white', 'border-primary-500'); l.classList.add('text-gray-300'); });

  var section = document.getElementById('page-' + page);
  if (section) { section.classList.remove('hidden'); section.classList.add('active'); }

  var navItem = document.querySelector('#sidebar nav ul li[data-page="' + page + '"]');
  if (navItem) { navItem.classList.add('active-nav', 'bg-gray-800', 'text-white', 'border-primary-500'); navItem.classList.remove('text-gray-300'); }

  if (window.innerWidth < 1024) closeSidebar();

  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'plans': renderPlans(); break;
    case 'subscriptions': renderSubscriptions(); break;
    case 'customers': renderCustomers(); break;
    case 'payments': renderPaymentsPage(); break;
    case 'coupons': renderCoupons(); break;
  }
}

// ========== Toast ==========
function showToast(msg, type) {
  type = type || 'success';
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  var bg = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-amber-500';
  toast.className = 'toast ' + bg + ' text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in text-center min-w-[200px]';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function () {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(function () { toast.remove(); }, 300);
  }, 3500);
}

// ========== Modal ==========
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-overlay').classList.add('flex');
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-overlay').classList.remove('flex');
}

// ========== Helpers ==========
function esc(s) {
  if (s == null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatCurrency(n) {
  var num = Math.round(Number(n)) || 0;
  return num.toLocaleString() + ' د.ع';
}

function daysUntil(dateStr) {
  if (!dateStr) return 999;
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var end = new Date(dateStr); end.setHours(0, 0, 0, 0);
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function statusBadge(st, endDate) {
  var cls = 'badge-active'; var lbl = 'نشط';
  if (st === 'trial') { cls = 'badge-trial'; lbl = 'تجريبي'; }
  else if (st === 'expired') { cls = 'badge-expired'; lbl = 'منتهي'; }
  else if (st === 'cancelled') { cls = 'badge-cancelled'; lbl = 'ملغي'; }
  else if (st === 'paused') { cls = 'badge-paused'; lbl = 'موقف'; }
  else if (st === 'suspended') { cls = 'badge-suspended'; lbl = 'معلق'; }
  var d = endDate ? daysUntil(endDate) : 999;
  var tag = (st === 'active' && d >= 0 && d <= 7) ? '<span class="text-amber-500 text-[10px] block mt-0.5 flex items-center gap-1">' + icn('alert', 'w-3 h-3') + ' باقي ' + (d === 0 ? 'اليوم' : d + ' أيام') + '</span>' : '';
  return '<span class="inline-flex flex-col items-center px-2.5 py-1 rounded-full text-xs font-bold ' + cls + '">' + lbl + tag + '</span>';
}

function statusLabel(st) {
  var map = { active: 'نشط', trial: 'تجريبي', expired: 'منتهي', cancelled: 'ملغي', paused: 'موقف', suspended: 'معلق' };
  return map[st] || st;
}

function icn(name, cls) {
  cls = cls || 'w-5 h-5';
  var s = '<svg class="' + cls + '" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="';
  var p = {
    home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    subs: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    package: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    card: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
    tag: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
    edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    plus: 'M12 4v16m8-8H4',
    check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    alert: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
    chart: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    dollar: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    key: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
    lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    link: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    sql: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    copy: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    smile: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    x: 'M6 18L18 6M6 6l12 12',
    save: 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4',
    phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
    cal: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
  };
  return s + (p[name] || '') + '"/></svg>';
}

function checkExpiring() {
  var soon = subscriptions.filter(function (s) { var d = daysUntil(s.end_date); return d >= 0 && d <= 7 && s.status === 'active'; });
  if (soon.length > 0) {
    var msg = soon.length === 1 ? 'اشتراك واحد سينتهي خلال 7 أيام' : soon.length + ' اشتراكات ستنتهي خلال 7 أيام';
    setTimeout(function () { showToast(msg, 'warning'); }, 2000);
  }
}

// ========== Setup Page ==========
function showSetupPage() {
  var cfg = window.SUPABASE_CONFIG;
  document.getElementById('page-dashboard').innerHTML =
    '<div class="max-w-xl mx-auto mt-8">' +
      '<div class="bg-white rounded-2xl shadow-sm p-6 md:p-8">' +
        '<div class="text-center mb-6"><div class="mb-3 flex justify-center">' + icn('subs', 'w-12 h-12 text-primary-600') + '</div><h2 class="text-2xl font-bold">نظام إدارة الاشتراكات</h2><p class="text-gray-500 text-sm mt-1">يرجى إعداد الاتصال بقاعدة البيانات للبدء</p></div>' +
        '<div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 leading-relaxed mb-6">' +
          '<strong>الخطوات:</strong><br/>' +
          '1. اذهب إلى <a href="https://supabase.com" target="_blank" class="underline font-medium">supabase.com</a> ← أنشئ مشروعاً جديداً<br/>' +
          '2. من Settings → API، انسخ <strong>Project URL</strong> و <strong>anon public key</strong><br/>' +
          '3. اذهب إلى SQL Editor والصق الـ SQL من الأسفل وشغّله<br/>' +
          '4. ضع البيانات في الحقول أدناه واضغط "اتصل"' +
        '</div>' +
        '<div class="mb-4"><label class="block text-sm font-medium mb-1">رابط المشروع (Project URL)</label><input class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" id="setup-url" value="' + esc(cfg?.url || '') + '" dir="ltr" placeholder="https://xxxxx.supabase.co" /></div>' +
        '<div class="mb-4"><label class="block text-sm font-medium mb-1">المفتاح العام (Anon Key)</label><input class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" id="setup-key" value="' + esc(cfg?.anonKey || '') + '" dir="ltr" placeholder="eyJhbGciOiJIUzI1NiIs..." /></div>' +
        '<button onclick="saveSetup()" class="w-full bg-primary-600 text-white py-2.5 rounded-xl hover:bg-primary-700 transition font-medium flex items-center justify-center gap-2">' + icn('link', 'w-4 h-4') + ' اتصال</button>' +
        '<details class="mt-6"><summary class="cursor-pointer text-primary-600 font-medium text-sm flex items-center gap-2">' + icn('sql', 'w-4 h-4') + ' SQL لإنشاء الجداول</summary>' +
          '<pre class="bg-gray-50 p-4 rounded-xl text-[11px] overflow-x-auto mt-2 leading-relaxed border" id="sql-block">' + SQL_SCHEMA + '</pre>' +
          '<button onclick="copySQL()" class="mt-2 text-sm px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition flex items-center gap-1">' + icn('copy', 'w-4 h-4') + ' نسخ SQL</button>' +
        '</details>' +
      '</div>' +
      '<p class="text-center text-xs text-gray-400 mt-4">أو عدّل ملف <code class="bg-gray-100 px-1 rounded">js/config.js</code> يدوياً</p>' +
    '</div>';
}

var SQL_SCHEMA = '-- انسخ هذا SQL وألصقه في Supabase SQL Editor\n\nCREATE TABLE IF NOT EXISTS customers (\n  id BIGSERIAL PRIMARY KEY,\n  name TEXT NOT NULL,\n  phone TEXT,\n  email TEXT,\n  address TEXT,\n  login_email TEXT,\n  login_password TEXT,\n  notes TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE TABLE IF NOT EXISTS subscription_plans (\n  id BIGSERIAL PRIMARY KEY,\n  name TEXT NOT NULL,\n  duration_type TEXT DEFAULT \'monthly\',\n  duration_value INTEGER NOT NULL DEFAULT 1,\n  duration_unit TEXT NOT NULL DEFAULT \'month\',\n  price DECIMAL(10,2) NOT NULL,\n  description TEXT,\n  is_active BOOLEAN DEFAULT true,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE TABLE IF NOT EXISTS subscription_coupons (\n  id BIGSERIAL PRIMARY KEY,\n  code TEXT UNIQUE NOT NULL,\n  discount_type TEXT NOT NULL,\n  discount_value DECIMAL(10,2) NOT NULL,\n  max_uses INTEGER,\n  used_count INTEGER DEFAULT 0,\n  expires_at DATE,\n  is_active BOOLEAN DEFAULT true,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE TABLE IF NOT EXISTS subscriptions (\n  id BIGSERIAL PRIMARY KEY,\n  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,\n  plan_id BIGINT REFERENCES subscription_plans(id),\n  start_date DATE NOT NULL,\n  end_date DATE,\n  status TEXT NOT NULL DEFAULT \'active\',\n  discount DECIMAL(10,2) DEFAULT 0,\n  coupon_id BIGINT REFERENCES subscription_coupons(id),\n  total_paid DECIMAL(10,2) NOT NULL DEFAULT 0,\n  notes TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE TABLE IF NOT EXISTS subscription_payments (\n  id BIGSERIAL PRIMARY KEY,\n  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,\n  amount DECIMAL(10,2) NOT NULL,\n  payment_date DATE NOT NULL,\n  payment_method TEXT DEFAULT \'cash\',\n  notes TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nALTER TABLE customers ENABLE ROW LEVEL SECURITY;\nALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;\nALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;\nALTER TABLE subscription_coupons ENABLE ROW LEVEL SECURITY;\nALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "Allow all" ON customers FOR ALL USING (true) WITH CHECK (true);\nCREATE POLICY "Allow all" ON subscription_plans FOR ALL USING (true) WITH CHECK (true);\nCREATE POLICY "Allow all" ON subscriptions FOR ALL USING (true) WITH CHECK (true);\nCREATE POLICY "Allow all" ON subscription_coupons FOR ALL USING (true) WITH CHECK (true);\nCREATE POLICY "Allow all" ON subscription_payments FOR ALL USING (true) WITH CHECK (true);';

function copySQL() {
  navigator.clipboard.writeText(SQL_SCHEMA).then(function () { showToast('تم نسخ SQL', 'success'); }).catch(function () { showToast('فشل النسخ', 'error'); });
}

async function saveSetup() {
  var url = document.getElementById('setup-url')?.value.trim();
  var key = document.getElementById('setup-key')?.value.trim();
  if (!url || !key) { showToast('يرجى إدخال الرابط والمفتاح', 'warning'); return; }
  window.SUPABASE_CONFIG = { url: url, anonKey: key };
  showToast('جاري الاتصال...', 'info');
  var connected = await initSupabase();
  if (connected) {
    showToast('تم الاتصال بنجاح!', 'success');
    initApp();
  } else {
    showToast('فشل الاتصال، تأكد من البيانات', 'error');
  }
}

// ========== Dashboard ==========
async function renderDashboard() {
  try {
    var stats = await getDashboardStats();
    document.getElementById('page-dashboard').innerHTML =
      '<div class="mb-6"><h2 class="text-2xl font-bold flex items-center gap-2">' + icn('home', 'w-6 h-6') + ' الرئيسية</h2><p class="text-gray-500 text-sm">نظرة عامة على الاشتراكات والإيرادات</p></div>' +
      '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">' +
        '<div class="bg-white rounded-2xl shadow-sm p-4 md:p-5 text-center"><div class="mb-1 flex justify-center">' + icn('subs', 'w-7 h-7 text-gray-600') + '</div><div class="text-2xl md:text-3xl font-bold">' + stats.total + '</div><div class="text-xs md:text-sm text-gray-500">إجمالي الاشتراكات</div></div>' +
        '<div class="bg-white rounded-2xl shadow-sm p-4 md:p-5 text-center"><div class="mb-1 flex justify-center">' + icn('users', 'w-7 h-7 text-gray-600') + '</div><div class="text-2xl md:text-3xl font-bold">' + stats.customers + '</div><div class="text-xs md:text-sm text-gray-500">إجمالي العملاء</div></div>' +
        '<div class="bg-white rounded-2xl shadow-sm p-4 md:p-5 text-center"><div class="mb-1 flex justify-center">' + icn('dollar', 'w-7 h-7 text-emerald-600') + '</div><div class="text-2xl md:text-3xl font-bold text-emerald-600">' + formatCurrency(stats.revenue) + '</div><div class="text-xs md:text-sm text-gray-500">إجمالي الإيرادات</div></div>' +
        '<div class="bg-white rounded-2xl shadow-sm p-4 md:p-5 text-center"><div class="mb-1 flex justify-center">' + icn('check', 'w-7 h-7 text-primary-600') + '</div><div class="text-2xl md:text-3xl font-bold text-primary-600">' + stats.active + '</div><div class="text-xs md:text-sm text-gray-500">اشتراكات نشطة</div></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">' +
        '<div class="bg-white rounded-xl shadow-sm p-3 text-center border-r-4 border-blue-500"><div class="text-lg font-bold text-blue-600">' + stats.trial + '</div><div class="text-xs text-gray-500">تجريبي</div></div>' +
        '<div class="bg-white rounded-xl shadow-sm p-3 text-center border-r-4 border-amber-500"><div class="text-lg font-bold text-amber-600">' + stats.expired + '</div><div class="text-xs text-gray-500">منتهي</div></div>' +
        '<div class="bg-white rounded-xl shadow-sm p-3 text-center border-r-4 border-red-500"><div class="text-lg font-bold text-red-600">' + stats.cancelled + '</div><div class="text-xs text-gray-500">ملغي</div></div>' +
        '<div class="bg-white rounded-xl shadow-sm p-3 text-center border-r-4 border-purple-500"><div class="text-lg font-bold text-purple-600">' + stats.paused + '</div><div class="text-xs text-gray-500">موقف</div></div>' +
        '<div class="bg-white rounded-xl shadow-sm p-3 text-center border-r-4 border-pink-500"><div class="text-lg font-bold text-pink-600">' + (stats.total - stats.active - stats.trial - stats.expired - stats.cancelled - stats.paused) + '</div><div class="text-xs text-gray-500">معلق</div></div>' +
      '</div>';

    // Expiring soon
    var expiringSoon = subscriptions.filter(function (s) { var d = daysUntil(s.end_date); return d >= 0 && d <= 7 && (s.status === 'active' || s.status === 'trial'); });
    if (expiringSoon.length > 0) {
      var rows = '';
      expiringSoon.forEach(function (s) {
        var c = s.customers || {};
        var p = s.subscription_plans || {};
        var d = daysUntil(s.end_date);
        var dt = d === 0 ? 'اليوم' : d === 1 ? 'غداً' : d + ' أيام';
        rows += '<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-3 text-sm">#' + s.id + '</td><td class="p-3 text-sm">' + esc(c.name || '-') + '</td><td class="p-3 text-sm">' + esc(p.name || '-') + '</td><td class="p-3 text-sm">' + (s.end_date || '-') + '</td><td class="p-3 text-sm font-bold" style="color:' + (d <= 1 ? '#ef4444' : '#f59e0b') + '">' + dt + '</td><td class="p-3">' + statusBadge(s.status) + '</td></tr>';
      });
      document.getElementById('page-dashboard').insertAdjacentHTML('beforeend',
        '<div class="bg-white rounded-2xl shadow-sm p-4 md:p-5 mb-6 border-r-4 border-amber-400"><h3 class="font-bold mb-3 flex items-center gap-2">' + icn('alert', 'w-5 h-5 text-amber-500') + ' اشتراكات على وشك الانتهاء</h3><div class="overflow-x-auto"><table class="w-full text-right"><thead><tr class="bg-gray-50"><th class="p-3 text-xs font-medium text-gray-500">#</th><th class="p-3 text-xs font-medium text-gray-500">العميل</th><th class="p-3 text-xs font-medium text-gray-500">الخطة</th><th class="p-3 text-xs font-medium text-gray-500">تاريخ النهاية</th><th class="p-3 text-xs font-medium text-gray-500">متبقي</th><th class="p-3 text-xs font-medium text-gray-500">الحالة</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>');
    }

    // Recent
    var recent = stats.subs.slice(0, 10);
    if (recent.length > 0) {
      var rows2 = '';
      recent.forEach(function (s) {
        var c = s.customers || {};
        var p = s.subscription_plans || {};
        rows2 += '<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-3 text-sm">#' + s.id + '</td><td class="p-3 text-sm">' + esc(c.name || '-') + '</td><td class="p-3 text-sm">' + esc(p.name || '-') + '</td><td class="p-3 text-sm">' + (s.start_date || '-') + '</td><td class="p-3 text-sm">' + (s.end_date || '-') + '</td><td class="p-3">' + statusBadge(s.status, s.end_date) + '</td><td class="p-3 text-sm font-medium">' + formatCurrency(s.total_paid || 0) + '</td></tr>';
      });
      document.getElementById('page-dashboard').insertAdjacentHTML('beforeend',
        '<div class="bg-white rounded-2xl shadow-sm p-4 md:p-5"><h3 class="font-bold mb-3 flex items-center gap-2">' + icn('chart', 'w-5 h-5') + ' آخر الاشتراكات</h3><div class="overflow-x-auto"><table class="w-full text-right"><thead><tr class="bg-gray-50"><th class="p-3 text-xs font-medium text-gray-500">#</th><th class="p-3 text-xs font-medium text-gray-500">العميل</th><th class="p-3 text-xs font-medium text-gray-500">الخطة</th><th class="p-3 text-xs font-medium text-gray-500">تاريخ البداية</th><th class="p-3 text-xs font-medium text-gray-500">تاريخ النهاية</th><th class="p-3 text-xs font-medium text-gray-500">الحالة</th><th class="p-3 text-xs font-medium text-gray-500">المبلغ</th></tr></thead><tbody>' + rows2 + '</tbody></table></div></div>');
    }
  } catch (e) {
    showToast('خطأ في تحميل الإحصائيات', 'error');
  }
}

// ========== Plans ==========
function renderPlans() {
  var html = '<div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 class="text-2xl font-bold flex items-center gap-2">' + icn('package', 'w-6 h-6') + ' خطط الاشتراك</h2><p class="text-gray-500 text-sm">إدارة خطط الأسعار والمدة</p></div><button onclick="showPlanModal()" class="bg-primary-600 text-white px-5 py-2 rounded-xl hover:bg-primary-700 transition text-sm font-medium self-start flex items-center gap-1.5">' + icn('plus', 'w-4 h-4') + ' إضافة خطة</button></div>';
  if (!plans.length) {
    html += '<div class="bg-white rounded-2xl shadow-sm p-8 text-center"><div class="mb-3 flex justify-center">' + icn('package', 'w-10 h-10 text-gray-300') + '</div><p class="text-gray-500">لا توجد خطط بعد</p></div>';
  } else {
    html += '<div class="bg-white rounded-2xl shadow-sm overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-right"><thead><tr class="bg-gray-50 border-b"><th class="p-3 text-xs font-medium text-gray-500">#</th><th class="p-3 text-xs font-medium text-gray-500">الاسم</th><th class="p-3 text-xs font-medium text-gray-500">المدة</th><th class="p-3 text-xs font-medium text-gray-500">السعر</th><th class="p-3 text-xs font-medium text-gray-500">الوصف</th><th class="p-3 text-xs font-medium text-gray-500">الحالة</th><th class="p-3 text-xs font-medium text-gray-500"></th></tr></thead><tbody>';
    plans.forEach(function (p) {
      var dur = p.duration_value + ' ' + (p.duration_unit === 'day' ? 'يوم' : p.duration_unit === 'month' ? 'شهر' : 'سنة');
      html += '<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-3 text-sm">#' + p.id + '</td><td class="p-3 text-sm font-medium">' + esc(p.name) + '</td><td class="p-3 text-sm">' + dur + '</td><td class="p-3 text-sm">' + formatCurrency(p.price) + '</td><td class="p-3 text-sm text-gray-500">' + esc(p.description || '-') + '</td><td class="p-3">' + (p.is_active ? '<span class="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold">نشط</span>' : '<span class="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">غير نشط</span>') + '</td><td class="p-3"><button onclick="showPlanModal(' + p.id + ')" class="text-primary-600 hover:text-primary-800 text-sm ml-2">' + icn('edit', 'w-4 h-4') + '</button><button onclick="deletePlanItem(' + p.id + ')" class="text-red-500 hover:text-red-700 text-sm">' + icn('trash', 'w-4 h-4') + '</button></td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  document.getElementById('page-plans').innerHTML = html;
}

function showPlanModal(id) {
  var plan = id ? plans.find(function (p) { return p.id === id; }) : null;
  openModal(
    '<div class="p-5 md:p-6"><div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold">' + (plan ? 'تعديل خطة' : 'إضافة خطة جديدة') + '</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 p-1">' + icn('x', 'w-5 h-5') + '</button></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">اسم الخطة</label><input class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="plan-name" value="' + esc(plan?.name || '') + '" /></div>' +
    '<div class="grid grid-cols-2 gap-3 mb-4"><div><label class="block text-sm font-medium mb-1">المدة</label><input type="number" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="plan-duration" value="' + (plan?.duration_value || 1) + '" min="1" /></div><div><label class="block text-sm font-medium mb-1">الوحدة</label><select class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="plan-unit"><option value="month"' + (plan?.duration_unit === 'month' ? ' selected' : '') + '>شهر</option><option value="year"' + (plan?.duration_unit === 'year' ? ' selected' : '') + '>سنة</option><option value="day"' + (plan?.duration_unit === 'day' ? ' selected' : '') + '>يوم</option></select></div></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">السعر</label><input type="number" step="1" min="0" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="plan-price" value="' + (plan?.price || '') + '" /></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">الوصف</label><textarea class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="plan-desc" rows="3">' + esc(plan?.description || '') + '</textarea></div>' +
    '<div class="mb-4 flex items-center gap-2"><input type="checkbox" id="plan-active" ' + (plan === null || plan?.is_active ? 'checked' : '') + ' class="rounded" /><label for="plan-active" class="text-sm">الخطة نشطة</label></div>' +
    '<div class="flex gap-3 justify-end pt-3 border-t"><button onclick="savePlan(' + (id || '') + ')" class="bg-primary-600 text-white px-5 py-2 rounded-xl hover:bg-primary-700 transition text-sm font-medium flex items-center gap-1.5">' + icn('save', 'w-4 h-4') + ' حفظ</button><button onclick="closeModal()" class="px-5 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition text-sm">إلغاء</button></div></div>'
  );
}

async function savePlan(id) {
  var name = document.getElementById('plan-name')?.value.trim();
  if (!name) { showToast('يرجى إدخال اسم الخطة', 'warning'); return; }
  var obj = { name: name, duration_value: parseInt(document.getElementById('plan-duration')?.value) || 1, duration_unit: document.getElementById('plan-unit')?.value || 'month', price: parseFloat(document.getElementById('plan-price')?.value) || 0, description: document.getElementById('plan-desc')?.value || null, is_active: document.getElementById('plan-active')?.checked || false };
  try {
    if (id) { await updatePlan(id, obj); showToast('تم تحديث الخطة', 'success'); }
    else { await createPlan(obj); showToast('تم إضافة الخطة', 'success'); }
    closeModal(); plans = await getPlans(); renderPlans();
  } catch (e) { showToast('خطأ: ' + e.message, 'error'); }
}

async function deletePlanItem(id) {
  if (!confirm('هل أنت متأكد من حذف هذه الخطة؟')) return;
  try { await deletePlan(id); showToast('تم حذف الخطة', 'success'); plans = await getPlans(); renderPlans(); }
  catch (e) { showToast('خطأ: ' + e.message, 'error'); }
}

// ========== Subscriptions ==========
function renderSubscriptions() {
  var html = '<div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 class="text-2xl font-bold flex items-center gap-2">' + icn('subs', 'w-6 h-6') + ' الاشتراكات</h2><p class="text-gray-500 text-sm">إدارة جميع الاشتراكات</p></div><button onclick="showSubscriptionModal()" class="bg-primary-600 text-white px-5 py-2 rounded-xl hover:bg-primary-700 transition text-sm font-medium self-start flex items-center gap-1.5">' + icn('plus', 'w-4 h-4') + ' إضافة اشتراك</button></div>' +
    '<div class="flex flex-wrap gap-2 mb-4">' +
      '<div class="relative flex-1 min-w-[150px]"><div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">' + icn('search', 'w-4 h-4') + '</div><input type="text" id="subs-search" placeholder="بحث..." oninput="renderSubsTable()" class="border border-gray-300 rounded-xl pr-10 pl-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none w-full" /></div>' +
      '<select id="subs-status-filter" onchange="renderSubsTable()" class="border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"><option value="">جميع الحالات</option><option value="active">نشط</option><option value="trial">تجريبي</option><option value="expired">منتهي</option><option value="cancelled">ملغي</option><option value="paused">موقف</option><option value="suspended">معلق</option></select>' +
      '<select id="subs-plan-filter" onchange="renderSubsTable()" class="border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none">' + buildPlanOptions() + '</select>' +
    '</div>' +
    '<div class="bg-white rounded-2xl shadow-sm overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-right"><thead><tr class="bg-gray-50 border-b"><th class="p-3 text-xs font-medium text-gray-500">#</th><th class="p-3 text-xs font-medium text-gray-500">العميل</th><th class="p-3 text-xs font-medium text-gray-500">الخطة</th><th class="p-3 text-xs font-medium text-gray-500">المدة</th><th class="p-3 text-xs font-medium text-gray-500">تاريخ البداية</th><th class="p-3 text-xs font-medium text-gray-500">تاريخ النهاية</th><th class="p-3 text-xs font-medium text-gray-500">المبلغ</th><th class="p-3 text-xs font-medium text-gray-500">الحالة</th><th class="p-3 text-xs font-medium text-gray-500"></th></tr></thead><tbody id="subs-table-body"></tbody></table></div></div>';
  document.getElementById('page-subscriptions').innerHTML = html;
  renderSubsTable();
}

function planDurationLabel(p) {
  if (!p || !p.duration_value) return '';
  var dv = p.duration_value;
  var du = p.duration_unit;
  if (du === 'day') return dv === 1 ? 'يوم واحد' : dv + ' أيام';
  if (du === 'week') return dv === 1 ? 'أسبوع واحد' : dv + ' أسابيع';
  if (du === 'month') return dv === 1 ? 'شهر واحد' : dv === 2 ? 'شهران' : dv === 3 || dv === 10 ? dv + ' أشهر' : dv + ' شهر';
  if (du === 'year') return dv === 1 ? 'سنة واحدة' : dv === 2 ? 'سنتان' : dv + ' سنوات';
  return dv + ' ' + du;
}

function subDurationLabel(s) {
  var p = s.subscription_plans;
  if (p && p.duration_value) return planDurationLabel(p);
  if (s.start_date && s.end_date) {
    var days = Math.round((new Date(s.end_date) - new Date(s.start_date)) / 86400000);
    if (days > 0) return planDurationLabel({ duration_value: days, duration_unit: 'day' });
  }
  return '-';
}

function buildPlanOptions() {
  var h = '<option value="">جميع الخطط</option>';
  plans.forEach(function (p) { h += '<option value="' + p.id + '">' + esc(p.name) + '</option>'; });
  return h;
}

function renderSubsTable() {
  var tbody = document.getElementById('subs-table-body');
  if (!tbody) return;
  var search = (document.getElementById('subs-search')?.value || '').toLowerCase();
  var statusFilter = document.getElementById('subs-status-filter')?.value;
  var planFilter = document.getElementById('subs-plan-filter')?.value;

  var filtered = subscriptions.slice();
  if (search) filtered = filtered.filter(function (s) { var c = s.customers || {}; return (c.name || '').toLowerCase().includes(search) || String(s.id).includes(search); });
  if (statusFilter) filtered = filtered.filter(function (s) { return s.status === statusFilter; });
  if (planFilter) filtered = filtered.filter(function (s) { return String(s.plan_id) === planFilter; });
  filtered.sort(function (a, b) { return b.id - a.id; });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-gray-400"><div class="mb-2 flex justify-center">' + icn('subs', 'w-7 h-7') + '</div><p>لا توجد اشتراكات</p></td></tr>';
    return;
  }

  var h = '';
  filtered.forEach(function (s) {
    var c = s.customers || {};
    var p = s.subscription_plans || {};
    h += '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
      '<td class="p-3 text-sm">#' + s.id + '</td>' +
      '<td class="p-3 text-sm font-medium">' + esc(c.name || '-') + '</td>' +
      '<td class="p-3 text-sm">' + esc(p.name || '-') + '</td>' +
      '<td class="p-3 text-sm text-gray-600">' + subDurationLabel(s) + '</td>' +
      '<td class="p-3 text-sm">' + (s.start_date || '-') + '</td>' +
      '<td class="p-3 text-sm">' + (s.end_date || '-') + '</td>' +
      '<td class="p-3 text-sm font-medium">' + formatCurrency(s.total_paid || 0) + '</td>' +
      '<td class="p-3">' + statusBadge(s.status, s.end_date) + '</td>' +
      '<td class="p-3 whitespace-nowrap">' +
        '<button onclick="viewSubscription(' + s.id + ')" class="text-gray-500 hover:text-primary-600 text-sm ml-1" title="عرض">' + icn('eye', 'w-4 h-4') + '</button>' +
        '<button onclick="showSubscriptionModal(' + s.id + ')" class="text-gray-500 hover:text-primary-600 text-sm ml-1" title="تعديل">' + icn('edit', 'w-4 h-4') + '</button>' +
        '<button onclick="addPaymentToSub(' + s.id + ')" class="text-gray-500 hover:text-emerald-600 text-sm ml-1" title="إضافة دفعة">' + icn('dollar', 'w-4 h-4') + '</button>' +
        '<button onclick="deleteSubscriptionItem(' + s.id + ')" class="text-gray-500 hover:text-red-600 text-sm" title="حذف">' + icn('trash', 'w-4 h-4') + '</button>' +
      '</td></tr>';
  });
  tbody.innerHTML = h;
}

function subTypeOptions(sub) {
  var opts = '<option value="active"' + (!sub || sub.status === 'active' ? ' selected' : '') + '>فعلي</option>' +
             '<option value="trial"' + (sub?.status === 'trial' ? ' selected' : '') + '>تجريبي</option>';
  if (sub) {
    opts += '<option value="expired"' + (sub.status === 'expired' ? ' selected' : '') + '>منتهي</option>' +
            '<option value="cancelled"' + (sub.status === 'cancelled' ? ' selected' : '') + '>ملغي</option>' +
            '<option value="paused"' + (sub.status === 'paused' ? ' selected' : '') + '>موقف</option>' +
            '<option value="suspended"' + (sub.status === 'suspended' ? ' selected' : '') + '>معلق</option>';
  }
  return opts;
}

async function showSubscriptionModal(id) {
  var sub = id ? subscriptions.find(function (s) { return s.id === id; }) : null;
  await loadAllData();

  openModal(
    '<div class="p-5 md:p-6"><div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold">' + (sub ? 'تعديل اشتراك' : 'اشتراك جديد') + '</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 p-1">' + icn('x', 'w-5 h-5') + '</button></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">' + (sub ? 'العميل' : 'اسم المشترك') + '</label>' +
      (sub
        ? '<input class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50" value="' + esc((sub.customers || {}).name || '') + '" readonly />'
        : '<input class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="sub-customer-name" placeholder="أدخل اسم المشترك" />'
      ) +
    '</div>' +
    '<div class="grid grid-cols-2 gap-3 mb-4"><div><label class="block text-sm font-medium mb-1">الخطة</label><select class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="sub-plan" onchange="updateSubPrice()">' +
      '<option value="">اختر الخطة</option>' +
      plans.filter(function (p) { return p.is_active; }).map(function (p) { return '<option value="' + p.id + '" data-price="' + p.price + '" data-dur="' + p.duration_value + '" data-unit="' + p.duration_unit + '"' + (sub?.plan_id === p.id ? ' selected' : '') + '>' + esc(p.name) + ' - ' + formatCurrency(p.price) + '</option>'; }).join('') +
    '</select><div class="text-xs text-gray-400 mt-1" id="sub-plan-duration"></div></div><div><label class="block text-sm font-medium mb-1">نوع الاشتراك</label><select class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="sub-type" onchange="onSubTypeChange()">' + subTypeOptions(sub) + '</select></div></div>' +
    '<div id="trial-duration-row" class="grid grid-cols-2 gap-3 mb-4"' + (sub?.status === 'trial' ? '' : ' style="display:none;"') + '><div><label class="block text-sm font-medium mb-1">مدة التجربة</label><input type="number" min="1" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="trial-days" value="7" onchange="calcSubEnd()" /></div><div><label class="block text-sm font-medium mb-1">الوحدة</label><select class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="trial-unit" onchange="calcSubEnd()"><option value="day" selected>يوم</option><option value="week">أسبوع</option><option value="month">شهر</option></select></div></div>' +
    '<div class="grid grid-cols-2 gap-3 mb-4"><div><label class="block text-sm font-medium mb-1">تاريخ البداية</label><input type="date" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="sub-start" value="' + (sub?.start_date || '') + '" onchange="calcSubEnd()" /></div><div><label class="block text-sm font-medium mb-1">تاريخ النهاية</label><input type="date" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="sub-end" value="' + (sub?.end_date || '') + '" /></div></div>' +
    '<div class="grid grid-cols-2 gap-3 mb-4"><div><label class="block text-sm font-medium mb-1">السعر</label><input type="number" step="1" min="0" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="sub-price" value="' + (sub?.total_paid || '') + '" /></div><div><label class="block text-sm font-medium mb-1">الخصم</label><input type="number" step="1" min="0" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="sub-discount" value="' + (sub?.discount || 0) + '" /></div></div>' +
    (!sub ? '<div class="bg-gray-50 rounded-xl p-4 mb-4"><h4 class="text-sm font-bold mb-2 flex items-center gap-1.5">' + icn('lock', 'w-4 h-4') + ' بيانات الدخول التلقائية</h4><div class="grid grid-cols-2 gap-3"><div><label class="block text-xs text-gray-500 mb-1">الإيميل</label><input class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm ltr text-left" id="sub-email" dir="ltr" readonly /></div><div><label class="block text-xs text-gray-500 mb-1">كلمة المرور</label><input class="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm ltr text-left font-mono" id="sub-password" dir="ltr" readonly /></div></div></div>' : '') +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">ملاحظات</label><textarea class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="sub-notes" rows="2">' + esc(sub?.notes || '') + '</textarea></div>' +
    '<div class="flex gap-3 justify-end pt-3 border-t"><button onclick="saveSubscription(' + (id || '') + ')" class="bg-primary-600 text-white px-5 py-2 rounded-xl hover:bg-primary-700 transition text-sm font-medium flex items-center gap-1.5">' + (id ? icn('save', 'w-4 h-4') + ' حفظ' : icn('link', 'w-4 h-4') + ' إنشاء الاشتراك') + '</button><button onclick="closeModal()" class="px-5 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition text-sm">إلغاء</button></div></div>'
  );

  if (!sub) {
    var startEl = document.getElementById('sub-start');
    if (startEl && !startEl.value) startEl.value = new Date().toISOString().split('T')[0];
    generateCredentials();
    document.getElementById('sub-customer-name').addEventListener('input', generateCredentials);
    document.getElementById('sub-plan').addEventListener('change', function () {
      var startEl2 = document.getElementById('sub-start');
      if (startEl2 && !startEl2.value) startEl2.value = new Date().toISOString().split('T')[0];
      updateSubPrice();
      generateCredentials();
    });
  }
}

function generateCredentials() {
  var name = document.getElementById('sub-customer-name')?.value.trim() || 'user';
  var username = name.replace(/[^a-zA-Z0-9_\u0621-\u064A]/g, '').toLowerCase().slice(0, 15) || 'user';
  var email = username + '@Nitaq';
  var password = String(Math.floor(100000 + Math.random() * 900000));
  var emailEl = document.getElementById('sub-email');
  var passEl = document.getElementById('sub-password');
  if (emailEl) emailEl.value = email;
  if (passEl) passEl.value = password;
}

function onSubTypeChange() {
  var type = document.getElementById('sub-type')?.value;
  var row = document.getElementById('trial-duration-row');
  if (row) row.style.display = type === 'trial' ? '' : 'none';
  calcSubEnd();
}

function updateSubPrice() {
  var sel = document.getElementById('sub-plan');
  var opt = sel.options[sel.selectedIndex];
  if (opt && opt.value) {
    var priceEl = document.getElementById('sub-price');
    if (priceEl && !priceEl.value) priceEl.value = opt.dataset.price;
    var durEl = document.getElementById('sub-plan-duration');
    if (durEl) durEl.textContent = 'المدة: ' + planDurationLabel({ duration_value: opt.dataset.dur, duration_unit: opt.dataset.unit });
  } else {
    var durEl2 = document.getElementById('sub-plan-duration');
    if (durEl2) durEl2.textContent = '';
  }
  calcSubEnd();
}

function calcSubEnd() {
  var startInput = document.getElementById('sub-start');
  var endInput = document.getElementById('sub-end');
  if (!startInput || !startInput.value || !endInput) return;
  var start = new Date(startInput.value);
  if (isNaN(start.getTime())) return;
  var type = document.getElementById('sub-type')?.value;
  var dur, unit;
  if (type === 'trial') {
    dur = parseInt(document.getElementById('trial-days')?.value) || 0;
    unit = document.getElementById('trial-unit')?.value || 'day';
    if (dur <= 0) { endInput.value = ''; return; }
  } else {
    var sel = document.getElementById('sub-plan');
    var opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) { endInput.value = ''; return; }
    dur = parseInt(opt.dataset.dur) || 1;
    unit = opt.dataset.unit || 'month';
  }
  var end = new Date(start);
  if (unit === 'day') end.setDate(end.getDate() + dur);
  else if (unit === 'week') end.setDate(end.getDate() + dur * 7);
  else if (unit === 'month') end.setMonth(end.getMonth() + dur);
  else if (unit === 'year') end.setFullYear(end.getFullYear() + dur);
  endInput.value = end.toISOString().split('T')[0];
}

async function saveSubscription(id) {
  if (id) {
    // Update existing
    var obj = {
      plan_id: parseInt(document.getElementById('sub-plan')?.value),
      start_date: document.getElementById('sub-start')?.value,
      end_date: document.getElementById('sub-end')?.value || null,
      status: document.getElementById('sub-type')?.value || 'active',
      total_paid: parseFloat(document.getElementById('sub-price')?.value) || 0,
      discount: parseFloat(document.getElementById('sub-discount')?.value) || 0,
      notes: document.getElementById('sub-notes')?.value || null,
    };
    if (!obj.plan_id) { showToast('يرجى اختيار الخطة', 'warning'); return; }
    try {
      await updateSubscription(id, obj);
      showToast('تم تحديث الاشتراك', 'success');
      closeModal();
      await loadAllData();
      renderSubsTable();
    } catch (e) { showToast('خطأ: ' + e.message, 'error'); }
    return;
  }

  // Create new
  var customerName = document.getElementById('sub-customer-name')?.value.trim();
  if (!customerName) { showToast('يرجى إدخال اسم المشترك', 'warning'); return; }
  var subType = document.getElementById('sub-type')?.value || 'active';
  var planId = parseInt(document.getElementById('sub-plan')?.value);
  if (!planId && subType !== 'trial') { showToast('يرجى اختيار الخطة', 'warning'); return; }

  var email = document.getElementById('sub-email')?.value || (customerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 15) + '@Nitaq');
  var password = document.getElementById('sub-password')?.value || String(Math.floor(100000 + Math.random() * 900000));
  var price = parseFloat(document.getElementById('sub-price')?.value) || 0;
  var discount = parseFloat(document.getElementById('sub-discount')?.value) || 0;
  var totalPaid = price - discount;
  if (totalPaid < 0) totalPaid = 0;
  var startDate = document.getElementById('sub-start')?.value || new Date().toISOString().split('T')[0];
  var endDate = document.getElementById('sub-end')?.value || null;
  var notes = document.getElementById('sub-notes')?.value || null;

  try {
    // Step 1: Create customer
    var customer = await createCustomer({
      name: customerName,
      login_email: email,
      login_password: password,
      notes: 'تم إنشاؤه تلقائياً من الاشتراك',
    });

    // Step 2: Create subscription
    var sub = await createSubscription({
      customer_id: customer.id,
      plan_id: planId || null,
      start_date: startDate,
      end_date: endDate,
      status: subType,
      total_paid: totalPaid,
      discount: discount,
      notes: notes,
    });

    // Step 3: Create payment record
    if (totalPaid > 0) {
      await createPayment({
        subscription_id: sub.id,
        amount: totalPaid,
        payment_date: startDate,
        payment_method: 'cash',
        notes: 'دفعة أولى - اشتراك جديد',
      });
    }

    showToast('تم إنشاء الاشتراك بنجاح!\nبريد: ' + email + '\nكلمة المرور: ' + password, 'success');
    closeModal();

    // Show credentials in a nice modal
    setTimeout(function () {
      openModal(
        '<div class="p-6 text-center"><div class="mb-3 flex justify-center text-emerald-500">' + icn('smile', 'w-12 h-12') + '</div><h3 class="text-lg font-bold mb-2">تم إنشاء الاشتراك!</h3><p class="text-sm text-gray-500 mb-4">بيانات الدخول للمشترك</p>' +
        '<div class="bg-gray-50 rounded-xl p-4 text-right mb-4"><div class="mb-2"><span class="text-xs text-gray-500">الإيميل:</span><div class="font-mono text-sm bg-white border rounded-lg px-3 py-2 mt-1 ltr text-left" dir="ltr">' + esc(email) + '</div></div><div><span class="text-xs text-gray-500">كلمة المرور:</span><div class="font-mono text-sm bg-white border rounded-lg px-3 py-2 mt-1 ltr text-left" dir="ltr">' + esc(password) + '</div></div></div>' +
        '<button onclick="closeModal()" class="bg-primary-600 text-white px-6 py-2 rounded-xl hover:bg-primary-700 transition text-sm">حسناً</button></div>'
      );
    }, 500);

    await loadAllData();
    navigateTo('subscriptions');
  } catch (e) {
    showToast('خطأ: ' + e.message, 'error');
  }
}

async function viewSubscription(id) {
  try {
    var sub = await getSubscriptionById(id);
    var c = sub.customers || {};
    var p = sub.subscription_plans || {};
    var subPayments = payments.filter(function (pay) { return pay.subscription_id === id; });
    var totalPaid = subPayments.reduce(function (s, pay) { return s + (pay.amount || 0); }, 0);

    var payRows = '';
    if (subPayments.length > 0) {
      subPayments.forEach(function (pay) {
        payRows += '<tr class="border-b border-gray-100"><td class="p-2 text-sm">#' + pay.id + '</td><td class="p-2 text-sm font-medium">' + formatCurrency(pay.amount) + '</td><td class="p-2 text-sm">' + (pay.payment_date || '-') + '</td><td class="p-2 text-sm">' + esc(pay.payment_method || '-') + '</td><td class="p-2 text-sm text-gray-500">' + esc(pay.notes || '') + '</td></tr>';
      });
    }

    openModal(
      '<div class="p-5 md:p-6"><div class="flex items-center justify-between mb-4"><h3 class="text-lg font-bold flex items-center gap-2">' + icn('subs', 'w-5 h-5') + ' اشتراك #' + sub.id + '</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 p-1">' + icn('x', 'w-5 h-5') + '</button></div>' +
      '<div class="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4 mb-4">' +
        '<div><div class="text-xs text-gray-500">العميل</div><div class="text-sm font-medium">' + esc(c.name || '-') + '</div></div>' +
        '<div><div class="text-xs text-gray-500">الهاتف</div><div class="text-sm font-medium">' + esc(c.phone || '-') + '</div></div>' +
        '<div><div class="text-xs text-gray-500">الخطة</div><div class="text-sm font-medium">' + esc(p.name || '-') + '</div></div>' +
        '<div><div class="text-xs text-gray-500">المدة</div><div class="text-sm font-medium">' + subDurationLabel(sub) + '</div></div>' +
        '<div><div class="text-xs text-gray-500">الحالة</div><div>' + statusBadge(sub.status, sub.end_date) + '</div></div>' +
        '<div><div class="text-xs text-gray-500">تاريخ البداية</div><div class="text-sm">' + (sub.start_date || '-') + '</div></div>' +
        '<div><div class="text-xs text-gray-500">تاريخ النهاية</div><div class="text-sm">' + (sub.end_date || '-') + '</div></div>' +
        '<div><div class="text-xs text-gray-500">المبلغ</div><div class="text-sm font-medium">' + formatCurrency(sub.total_paid || 0) + '</div></div>' +
        '<div><div class="text-xs text-gray-500">الخصم</div><div class="text-sm">' + formatCurrency(sub.discount || 0) + '</div></div>' +
        '<div class="col-span-2"><div class="text-xs text-gray-500">إجمالي المدفوعات</div><div class="text-sm font-medium">' + formatCurrency(totalPaid) + '</div></div>' +
        (c.login_email ? '<div class="col-span-2"><div class="text-xs text-gray-500">بريد الدخول</div><div class="text-sm font-mono" dir="ltr" style="text-align:left;">' + esc(c.login_email) + '</div></div>' : '') +
        (sub.notes ? '<div class="col-span-2"><div class="text-xs text-gray-500">ملاحظات</div><div class="text-sm">' + esc(sub.notes) + '</div></div>' : '') +
      '</div>' +
      '<h4 class="text-sm font-bold mb-2 flex items-center gap-1.5">' + icn('dollar', 'w-4 h-4') + ' سجل المدفوعات</h4>' +
      '<div class="overflow-x-auto"><table class="w-full text-right"><thead><tr class="bg-gray-50"><th class="p-2 text-xs font-medium text-gray-500">#</th><th class="p-2 text-xs font-medium text-gray-500">المبلغ</th><th class="p-2 text-xs font-medium text-gray-500">التاريخ</th><th class="p-2 text-xs font-medium text-gray-500">طريقة الدفع</th><th class="p-2 text-xs font-medium text-gray-500">ملاحظات</th></tr></thead><tbody>' + (payRows || '<tr><td colspan="5" class="p-4 text-center text-gray-400 text-sm">لا توجد مدفوعات</td></tr>') + '</tbody></table></div>' +
      '<div class="flex gap-3 justify-end pt-4 mt-4 border-t"><button onclick="closeModal();addPaymentToSub(' + sub.id + ')" class="px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition text-sm flex items-center gap-1">' + icn('dollar', 'w-4 h-4') + ' إضافة دفعة</button><button onclick="closeModal();showSubscriptionModal(' + sub.id + ')" class="px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition text-sm flex items-center gap-1">' + icn('edit', 'w-4 h-4') + ' تعديل</button><button onclick="closeModal()" class="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition text-sm">إغلاق</button></div></div>'
    );
  } catch (e) {
    showToast('خطأ: ' + e.message, 'error');
  }
}

async function deleteSubscriptionItem(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الاشتراك نهائياً؟ سيتم حذف كل المدفوعات والعميل المرتبط به')) return;
  try {
    var sub = subscriptions.find(function (s) { return s.id === id; });
    var subPayments = payments.filter(function (p) { return p.subscription_id === id; });
    for (var i = 0; i < subPayments.length; i++) {
      await deletePayment(subPayments[i].id);
    }
    await deleteSubscription(id);
    var msg = 'تم حذف الاشتراك نهائياً';
    if (sub && sub.customer_id) {
      var hasOtherSubs = subscriptions.some(function (s) { return s.id !== id && s.customer_id === sub.customer_id; });
      if (!hasOtherSubs) {
        await deleteCustomer(sub.customer_id);
        msg = 'تم حذف الاشتراك والعميل نهائياً';
      }
    }
    showToast(msg, 'success');
    await loadAllData();
    renderSubsTable();
  } catch (e) { showToast('خطأ: ' + e.message, 'error'); }
}

async function addPaymentToSub(subId) {
  openModal(
    '<div class="p-5 md:p-6"><div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold flex items-center gap-2">' + icn('dollar', 'w-5 h-5') + ' إضافة دفعة</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 p-1">' + icn('x', 'w-5 h-5') + '</button></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">المبلغ</label><input type="number" step="1" min="0" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="pay-amount" /></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">التاريخ</label><input type="date" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="pay-date" value="' + new Date().toISOString().split('T')[0] + '" /></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">طريقة الدفع</label><select class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="pay-method"><option value="cash">نقداً</option><option value="card">بطاقة</option><option value="bank">تحويل بنكي</option></select></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">ملاحظات</label><textarea class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="pay-notes" rows="2"></textarea></div>' +
    '<div class="flex gap-3 justify-end pt-3 border-t"><button onclick="savePayment(' + subId + ')" class="bg-primary-600 text-white px-5 py-2 rounded-xl hover:bg-primary-700 transition text-sm font-medium flex items-center gap-1.5">' + icn('save', 'w-4 h-4') + ' حفظ</button><button onclick="closeModal()" class="px-5 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition text-sm">إلغاء</button></div></div>'
  );
}

async function savePayment(subId) {
  var amount = parseFloat(document.getElementById('pay-amount')?.value);
  if (!amount || amount <= 0) { showToast('يرجى إدخال مبلغ صحيح', 'warning'); return; }
  var obj = { subscription_id: subId, amount: amount, payment_date: document.getElementById('pay-date')?.value || new Date().toISOString().split('T')[0], payment_method: document.getElementById('pay-method')?.value || 'cash', notes: document.getElementById('pay-notes')?.value || null };
  try {
    await createPayment(obj); showToast('تم إضافة الدفعة', 'success');
    closeModal(); await loadAllData(); renderPaymentsPage();
  } catch (e) { showToast('خطأ: ' + e.message, 'error'); }
}

// ========== Customers ==========
function renderCustomers() {
  var html = '<div class="mb-6"><h2 class="text-2xl font-bold flex items-center gap-2">' + icn('users', 'w-6 h-6') + ' العملاء</h2><p class="text-gray-500 text-sm">قائمة العملاء المسجلين</p></div>' +
    '<div class="flex flex-wrap gap-2 mb-4"><div class="relative flex-1 min-w-[150px]"><div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">' + icn('search', 'w-4 h-4') + '</div><input type="text" id="cust-search" placeholder="بحث..." oninput="renderCustTable()" class="border border-gray-300 rounded-xl pr-10 pl-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none w-full" /></div></div>' +
    '<div class="bg-white rounded-2xl shadow-sm overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-right"><thead><tr class="bg-gray-50 border-b"><th class="p-3 text-xs font-medium text-gray-500">#</th><th class="p-3 text-xs font-medium text-gray-500">الاسم</th><th class="p-3 text-xs font-medium text-gray-500">الهاتف</th><th class="p-3 text-xs font-medium text-gray-500">الإيميل</th><th class="p-3 text-xs font-medium text-gray-500">بيانات الدخول</th><th class="p-3 text-xs font-medium text-gray-500"></th></tr></thead><tbody id="cust-table-body"></tbody></table></div></div>';
  document.getElementById('page-customers').innerHTML = html;
  renderCustTable();
}

function renderCustTable() {
  var tbody = document.getElementById('cust-table-body');
  if (!tbody) return;
  var search = (document.getElementById('cust-search')?.value || '').toLowerCase();
  var filtered = customers;
  if (search) filtered = filtered.filter(function (c) { return c.name.toLowerCase().includes(search) || (c.phone || '').includes(search) || (c.login_email || '').toLowerCase().includes(search); });

  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-400"><div class="mb-2 flex justify-center">' + icn('users', 'w-7 h-7') + '</div><p>لا توجد عملاء</p></td></tr>'; return; }

  var h = '';
  filtered.forEach(function (c) {
    h += '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
      '<td class="p-3 text-sm">#' + c.id + '</td>' +
      '<td class="p-3 text-sm font-medium">' + esc(c.name) + '</td>' +
      '<td class="p-3 text-sm">' + esc(c.phone || '-') + '</td>' +
      '<td class="p-3 text-sm">' + esc(c.email || '-') + '</td>' +
      '<td class="p-3 text-sm font-mono text-xs">' + (c.login_email ? esc(c.login_email) : '-') + '</td>' +
      '<td class="p-3 whitespace-nowrap"><button onclick="showCustomerModal(' + c.id + ')" class="text-primary-600 hover:text-primary-800 text-sm ml-2">' + icn('edit', 'w-4 h-4') + '</button><button onclick="deleteCustomerItem(' + c.id + ')" class="text-red-500 hover:text-red-700 text-sm">' + icn('trash', 'w-4 h-4') + '</button></td></tr>';
  });
  tbody.innerHTML = h;
}

function showCustomerModal(id) {
  var c = id ? customers.find(function (x) { return x.id === id; }) : null;
  openModal(
    '<div class="p-5 md:p-6"><div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold">' + (c ? 'تعديل عميل' : 'إضافة عميل') + '</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 p-1">' + icn('x', 'w-5 h-5') + '</button></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">الاسم</label><input class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="cust-name" value="' + esc(c?.name || '') + '" /></div>' +
    '<div class="grid grid-cols-2 gap-3 mb-4"><div><label class="block text-sm font-medium mb-1">الهاتف</label><input class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="cust-phone" value="' + esc(c?.phone || '') + '" /></div><div><label class="block text-sm font-medium mb-1">البريد</label><input type="email" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="cust-email" value="' + esc(c?.email || '') + '" /></div></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">العنوان</label><input class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="cust-address" value="' + esc(c?.address || '') + '" /></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">ملاحظات</label><textarea class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="cust-notes" rows="2">' + esc(c?.notes || '') + '</textarea></div>' +
    '<div class="flex gap-3 justify-end pt-3 border-t"><button onclick="saveCustomer(' + (id || '') + ')" class="bg-primary-600 text-white px-5 py-2 rounded-xl hover:bg-primary-700 transition text-sm font-medium flex items-center gap-1.5">' + icn('save', 'w-4 h-4') + ' حفظ</button><button onclick="closeModal()" class="px-5 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition text-sm">إلغاء</button></div></div>'
  );
}

async function saveCustomer(id) {
  var name = document.getElementById('cust-name')?.value.trim();
  if (!name) { showToast('يرجى إدخال اسم العميل', 'warning'); return; }
  var obj = { name: name, phone: document.getElementById('cust-phone')?.value || null, email: document.getElementById('cust-email')?.value || null, address: document.getElementById('cust-address')?.value || null, notes: document.getElementById('cust-notes')?.value || null };
  try {
    if (id) { await updateCustomer(id, obj); showToast('تم تحديث العميل', 'success'); }
    else { await createCustomer(obj); showToast('تم إضافة العميل', 'success'); }
    closeModal(); customers = await getCustomers(); renderCustTable();
  } catch (e) { showToast('خطأ: ' + e.message, 'error'); }
}

async function deleteCustomerItem(id) {
  if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
  try { await deleteCustomer(id); showToast('تم حذف العميل', 'success'); customers = await getCustomers(); renderCustTable(); }
  catch (e) { showToast('خطأ: ' + e.message, 'error'); }
}

// ========== Payments ==========
function renderPaymentsPage() {
  var html = '<div class="mb-6"><h2 class="text-2xl font-bold flex items-center gap-2">' + icn('dollar', 'w-6 h-6') + ' المدفوعات</h2><p class="text-gray-500 text-sm">سجل المدفوعات المالية</p></div>' +
    '<div class="flex flex-wrap gap-2 mb-4">' +
      '<div class="relative flex-1 min-w-[120px]"><div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">' + icn('search', 'w-4 h-4') + '</div><input type="text" id="pay-search" placeholder="بحث..." oninput="renderPayTable()" class="border border-gray-300 rounded-xl pr-10 pl-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none w-full" /></div>' +
      '<input type="date" id="pay-date-from" onchange="renderPayTable()" class="border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />' +
      '<input type="date" id="pay-date-to" onchange="renderPayTable()" class="border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />' +
    '</div>' +
    '<div class="bg-white rounded-2xl shadow-sm overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-right"><thead><tr class="bg-gray-50 border-b"><th class="p-3 text-xs font-medium text-gray-500">#</th><th class="p-3 text-xs font-medium text-gray-500">الاشتراك</th><th class="p-3 text-xs font-medium text-gray-500">العميل</th><th class="p-3 text-xs font-medium text-gray-500">المبلغ</th><th class="p-3 text-xs font-medium text-gray-500">التاريخ</th><th class="p-3 text-xs font-medium text-gray-500">طريقة الدفع</th><th class="p-3 text-xs font-medium text-gray-500">ملاحظات</th></tr></thead><tbody id="pay-table-body"></tbody></table></div></div>';
  document.getElementById('page-payments').innerHTML = html;
  renderPayTable();
}

function renderPayTable() {
  var tbody = document.getElementById('pay-table-body');
  if (!tbody) return;
  var search = (document.getElementById('pay-search')?.value || '').toLowerCase();
  var dateFrom = document.getElementById('pay-date-from')?.value;
  var dateTo = document.getElementById('pay-date-to')?.value;

  var filtered = payments;
  if (search) filtered = filtered.filter(function (pay) {
    var sub = pay.subscriptions || {};
    var c = sub.customers || {};
    return String(pay.id).includes(search) || (c.name || '').toLowerCase().includes(search);
  });
  if (dateFrom) filtered = filtered.filter(function (pay) { return (pay.payment_date || '') >= dateFrom; });
  if (dateTo) filtered = filtered.filter(function (pay) { return (pay.payment_date || '') <= dateTo; });

  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-400"><div class="mb-2 flex justify-center">' + icn('dollar', 'w-7 h-7') + '</div><p>لا توجد مدفوعات</p></td></tr>'; return; }

  var h = '';
  var totalAmount = 0;
  filtered.forEach(function (pay) {
    var sub = pay.subscriptions || {};
    var c = sub.customers || {};
    h += '<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-3 text-sm">#' + pay.id + '</td><td class="p-3 text-sm">#' + (pay.subscription_id || '-') + '</td><td class="p-3 text-sm">' + esc(c.name || '-') + '</td><td class="p-3 text-sm font-medium">' + formatCurrency(pay.amount) + '</td><td class="p-3 text-sm">' + (pay.payment_date || '-') + '</td><td class="p-3 text-sm">' + esc(pay.payment_method || '-') + '</td><td class="p-3 text-sm text-gray-500">' + esc(pay.notes || '') + '</td></tr>';
    totalAmount += pay.amount || 0;
  });
  h += '<tr class="bg-gray-50 font-bold"><td colspan="3" class="p-3 text-sm">الإجمالي</td><td class="p-3 text-sm">' + formatCurrency(totalAmount) + '</td><td colspan="3"></td></tr>';
  tbody.innerHTML = h;
}

// ========== Coupons ==========
function renderCoupons() {
  var html = '<div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 class="text-2xl font-bold flex items-center gap-2">' + icn('tag', 'w-6 h-6') + ' كوبونات الخصم</h2><p class="text-gray-500 text-sm">إدارة أكواد الخصم</p></div><button onclick="showCouponModal()" class="bg-primary-600 text-white px-5 py-2 rounded-xl hover:bg-primary-700 transition text-sm font-medium self-start flex items-center gap-1.5">' + icn('plus', 'w-4 h-4') + ' إضافة كوبون</button></div>';
  if (!coupons.length) {
    html += '<div class="bg-white rounded-2xl shadow-sm p-8 text-center"><div class="mb-3 flex justify-center">' + icn('tag', 'w-10 h-10 text-gray-300') + '</div><p class="text-gray-500">لا توجد كوبونات</p></div>';
  } else {
    html += '<div class="bg-white rounded-2xl shadow-sm overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-right"><thead><tr class="bg-gray-50 border-b"><th class="p-3 text-xs font-medium text-gray-500">#</th><th class="p-3 text-xs font-medium text-gray-500">الكود</th><th class="p-3 text-xs font-medium text-gray-500">النوع</th><th class="p-3 text-xs font-medium text-gray-500">القيمة</th><th class="p-3 text-xs font-medium text-gray-500">أقصى استخدام</th><th class="p-3 text-xs font-medium text-gray-500">استخدم</th><th class="p-3 text-xs font-medium text-gray-500">صلاحية</th><th class="p-3 text-xs font-medium text-gray-500">الحالة</th><th class="p-3 text-xs font-medium text-gray-500"></th></tr></thead><tbody>';
    coupons.forEach(function (c) {
      html += '<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-3 text-sm">#' + c.id + '</td><td class="p-3 text-sm font-mono font-bold">' + esc(c.code) + '</td><td class="p-3 text-sm">' + (c.discount_type === 'percentage' ? '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">نسبة %</span>' : '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">قيمة ثابتة</span>') + '</td><td class="p-3 text-sm">' + (c.discount_type === 'percentage' ? c.discount_value + '%' : formatCurrency(c.discount_value)) + '</td><td class="p-3 text-sm">' + (c.max_uses || '∞') + '</td><td class="p-3 text-sm">' + (c.used_count || 0) + '</td><td class="p-3 text-sm">' + (c.expires_at || '-') + '</td><td class="p-3">' + (c.is_active ? '<span class="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold">نشط</span>' : '<span class="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">غير نشط</span>') + '</td><td class="p-3"><button onclick="showCouponModal(' + c.id + ')" class="text-primary-600 hover:text-primary-800 text-sm ml-2">' + icn('edit', 'w-4 h-4') + '</button><button onclick="deleteCouponItem(' + c.id + ')" class="text-red-500 hover:text-red-700 text-sm">' + icn('trash', 'w-4 h-4') + '</button></td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  document.getElementById('page-coupons').innerHTML = html;
}

function showCouponModal(id) {
  var c = id ? coupons.find(function (x) { return x.id === id; }) : null;
  openModal(
    '<div class="p-5 md:p-6"><div class="flex items-center justify-between mb-5"><h3 class="text-lg font-bold">' + (c ? 'تعديل كوبون' : 'إضافة كوبون') + '</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 p-1">' + icn('x', 'w-5 h-5') + '</button></div>' +
    '<div class="mb-4"><label class="block text-sm font-medium mb-1">كود الكوبون</label><input class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="coupon-code" value="' + esc(c?.code || '') + '" placeholder="مثلاً: WELCOME10" /></div>' +
    '<div class="grid grid-cols-2 gap-3 mb-4"><div><label class="block text-sm font-medium mb-1">النوع</label><select class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="coupon-type"><option value="percentage"' + (c?.discount_type === 'percentage' ? ' selected' : '') + '>نسبة %</option><option value="fixed"' + (c?.discount_type === 'fixed' ? ' selected' : '') + '>قيمة ثابتة</option></select></div><div><label class="block text-sm font-medium mb-1">القيمة</label><input type="number" step="1" min="0" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="coupon-value" value="' + (c?.discount_value || '') + '" /></div></div>' +
    '<div class="grid grid-cols-2 gap-3 mb-4"><div><label class="block text-sm font-medium mb-1">أقصى استخدام</label><input type="number" min="0" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="coupon-max" value="' + (c?.max_uses || '') + '" placeholder="0 = غير محدود" /></div><div><label class="block text-sm font-medium mb-1">صلاحية حتى</label><input type="date" class="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" id="coupon-expires" value="' + (c?.expires_at || '') + '" /></div></div>' +
    '<div class="mb-4 flex items-center gap-2"><input type="checkbox" id="coupon-active" ' + (c === null || c?.is_active ? 'checked' : '') + ' class="rounded" /><label for="coupon-active" class="text-sm">الكوبون نشط</label></div>' +
    '<div class="flex gap-3 justify-end pt-3 border-t"><button onclick="saveCoupon(' + (id || '') + ')" class="bg-primary-600 text-white px-5 py-2 rounded-xl hover:bg-primary-700 transition text-sm font-medium flex items-center gap-1.5">' + icn('save', 'w-4 h-4') + ' حفظ</button><button onclick="closeModal()" class="px-5 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition text-sm">إلغاء</button></div></div>'
  );
}

async function saveCoupon(id) {
  var code = document.getElementById('coupon-code')?.value.trim();
  if (!code) { showToast('يرجى إدخال كود الكوبون', 'warning'); return; }
  var obj = { code: code, discount_type: document.getElementById('coupon-type')?.value || 'percentage', discount_value: parseFloat(document.getElementById('coupon-value')?.value) || 0, max_uses: parseInt(document.getElementById('coupon-max')?.value) || null, expires_at: document.getElementById('coupon-expires')?.value || null, is_active: document.getElementById('coupon-active')?.checked || false };
  try {
    if (id) { await updateCoupon(id, obj); showToast('تم تحديث الكوبون', 'success'); }
    else { await createCoupon(obj); showToast('تم إضافة الكوبون', 'success'); }
    closeModal(); coupons = await getCoupons(); renderCoupons();
  } catch (e) { showToast('خطأ: ' + e.message, 'error'); }
}

async function deleteCouponItem(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الكوبون؟')) return;
  try { await deleteCoupon(id); showToast('تم حذف الكوبون', 'success'); coupons = await getCoupons(); renderCoupons(); }
  catch (e) { showToast('خطأ: ' + e.message, 'error'); }
}

// ========== Start ==========
document.addEventListener('DOMContentLoaded', initApp);
