const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const {
  Database,
  normalizeTr,
  normalizeClass,
  normalizeStudentNo,
  formatDateTr,
  formatDateTimeTr
} = require('./database');
const {
  sanitizeFileName,
  generateClubDocx,
  generateAllClubsDocx,
  generateGenericReportDocx,
  generateClubPdf,
  generateAllClubsPdf,
  generateGenericReportPdf,
  generateStudentTemplateXlsx
} = require('./exportService');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database();

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Aktif yönetici oturum tokenları
const adminTokens = new Set(['demo-admin-session-token']);

// Gerçek zamanlı SSE (Server-Sent Events) istemcileri
const sseClients = new Set();

// Yerel Ağ (LAN) IP adreslerini bul
function getLocalNetworkUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        urls.push(`http://${iface.address}:${port}`);
      }
    }
  }
  return urls;
}

// ============================================================================
// OKUL DIŞI CANLI İNTERNET TÜNELİ VE KURUMSAL GÖRÜNÜR LİNK YÖNETİCİSİ
// (balikesirbahcesehirkoleji Kurumsal Kısa Link + Cloudflare Arka Plan Tüneli)
// ============================================================================
const TUNNEL_STATE_FILE = path.join(__dirname, 'data', 'tunnel_state.json');

let tunnelProcess = null;
let tunnelPid = null;
let publicTunnelUrl = null;
let brandedShortUrl = null;
let tunnelProviderName = null;
let tunnelStatus = 'IDLE'; // 'IDLE' | 'STARTING' | 'ACTIVE' | 'ERROR'
let tunnelErrorMessage = null;

function getSchoolSlug() {
  const rawName = db?.data?.settings?.schoolName || 'balikesirbahcesehirkoleji';
  const cleaned = String(rawName)
    .toLocaleLowerCase('tr-TR')
    .replace(/özel\s+/g, '')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
  return cleaned || 'balikesirbahcesehirkoleji';
}

function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function saveTunnelState() {
  try {
    fs.writeFileSync(
      TUNNEL_STATE_FILE,
      JSON.stringify(
        {
          pid: tunnelPid,
          publicTunnelUrl,
          brandedShortUrl,
          tunnelProviderName,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch (e) {}
}

function loadSavedTunnelState() {
  try {
    if (!fs.existsSync(TUNNEL_STATE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(TUNNEL_STATE_FILE, 'utf-8'));
    if (raw && raw.pid && raw.publicTunnelUrl && isProcessAlive(raw.pid)) {
      return raw;
    }
  } catch (e) {}
  return null;
}

// Arka plandaki Cloudflare linkini gerçekten çalışan kısa bir yönlendirme linkine (ulvis.net) dönüştürür.
// Panelde bu link görünmez; sadece "balikesirbahcesehirkoleji" adı görünür, tıklanınca bu link açılır.
async function createBrandedSchoolShortUrl(targetFullUrl, baseSlug = 'balikesirbahcesehirkoleji') {
  const aliases = [
    `${baseSlug}net`,
    `${baseSlug}-kulup`,
    `${baseSlug}-secim`,
    `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`
  ];
  for (const alias of aliases) {
    try {
      const apiUrl = `https://ulvis.net/API/write/get?url=${encodeURIComponent(targetFullUrl)}&custom=${encodeURIComponent(alias)}&type=json`;
      const r = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await r.json().catch(() => ({}));
      if (data && data.success && data.data && data.data.url) {
        // Alias daha önce başka bir tünele bağlıysa doğru hedefe gittiğini doğrula
        const full = String(data.data.full || '');
        if (!full || full.replace(/\/+$/, '') === targetFullUrl.replace(/\/+$/, '')) {
          return data.data.url;
        }
      }
    } catch (e) {}
  }
  return null;
}

function getNetworkPayload(currentOrigin = '') {
  const lanUrls = getLocalNetworkUrls(PORT);
  const slug = getSchoolSlug();
  const displayBrandedUrl = `https://${slug}`;
  const brandedTunnelUrl = publicTunnelUrl ? `${publicTunnelUrl.replace(/\/+$/, '')}/${slug}` : null;
  return {
    currentOrigin,
    lanUrls,
    schoolSlug: slug,
    brandedShortUrl: displayBrandedUrl,
    workingShareUrl: brandedShortUrl || brandedTunnelUrl || null,
    brandedTunnelUrl,
    publicTunnelUrl: db.data.settings.customPublicUrl || displayBrandedUrl,
    rawTunnelUrl: publicTunnelUrl || null,
    tunnelProviderName,
    tunnelStatus,
    tunnelErrorMessage,
    isTunnelActive: !!publicTunnelUrl
  };
}

function broadcastAdminUpdate(eventType = 'DATA_UPDATED', payload = {}) {
  const dashboardData = db.getAdminDashboardData();
  const message = JSON.stringify({
    type: eventType,
    timestamp: new Date().toISOString(),
    payload,
    dashboard: dashboardData,
    network: getNetworkPayload()
  });
  for (const res of sseClients) {
    try {
      res.write(`data: ${message}\n\n`);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

function stopPublicTunnel() {
  if (tunnelProcess) {
    try {
      if (typeof tunnelProcess.kill === 'function') {
        tunnelProcess.kill();
      } else if (typeof tunnelProcess.close === 'function') {
        tunnelProcess.close();
      }
    } catch (e) {}
    tunnelProcess = null;
  }
  if (tunnelPid && isProcessAlive(tunnelPid)) {
    try {
      process.kill(tunnelPid);
    } catch (e) {}
  }
  tunnelPid = null;
  publicTunnelUrl = null;
  brandedShortUrl = null;
  tunnelProviderName = null;
  tunnelStatus = 'IDLE';
}

// 1. Birincil Motor: Cloudflare Quick Tunnel (Bağımsız / Kalıcı Arka Plan Süreci)
function startCloudflareTunnel(port) {
  return new Promise((resolve, reject) => {
    const binPath = path.join(
      __dirname,
      'node_modules',
      'cloudflared',
      'bin',
      process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    );

    if (!fs.existsSync(binPath)) {
      return reject(new Error('cloudflared ikili dosyası bulunamadı.'));
    }

    const proc = spawn(binPath, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    proc.unref();

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { proc.kill(); } catch (e) {}
        reject(new Error('Cloudflare tünel zaman aşımına uğradı.'));
      }
    }, 18000);

    const handleOutput = (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          proc,
          pid: proc.pid,
          url: match[0],
          provider: 'Cloudflare Güvenli Tünel (Kurumsal Yönlendirme Aktif)'
        });
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

// 2. İkincil Yedek Motor: Windows OpenSSH üzerinden localhost.run (Şifresiz HTTPS)
function startSshLocalhostRunTunnel(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ssh',
      [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=30',
        '-R', `80:127.0.0.1:${port}`,
        'nokey@localhost.run'
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { proc.kill(); } catch (e) {}
        reject(new Error('SSH tüneli zaman aşımına uğradı.'));
      }
    }, 15000);

    const handleOutput = (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ proc, pid: proc.pid, url: match[0], provider: 'Localhost.run HTTPS Tüneli' });
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

async function ensurePublicTunnelRunning(forceRestart = false) {
  if (forceRestart) {
    stopPublicTunnel();
  }

  // Eğer önceki çalışmadan aktif bir tünel süreci (PID) varsa aynı linki koru!
  if (!forceRestart && !publicTunnelUrl) {
    const saved = loadSavedTunnelState();
    if (saved) {
      tunnelPid = saved.pid;
      publicTunnelUrl = saved.publicTunnelUrl;
      const slug = getSchoolSlug();
      brandedShortUrl =
        saved.brandedShortUrl && saved.brandedShortUrl.includes('ulvis.net')
          ? saved.brandedShortUrl
          : await createBrandedSchoolShortUrl(`${publicTunnelUrl}/${slug}`, slug);
      tunnelProviderName = saved.tunnelProviderName || 'Cloudflare Güvenli Tünel';
      tunnelStatus = 'ACTIVE';
      saveTunnelState();
      console.log(`  [MEVCUT CANLI TÜNEL KORUNDU]: ${brandedShortUrl} -> ${publicTunnelUrl}/${slug}`);
      broadcastAdminUpdate('TUNNEL_READY', { publicTunnelUrl, brandedShortUrl });
      return {
        success: true,
        publicTunnelUrl: brandedShortUrl,
        rawTunnelUrl: publicTunnelUrl,
        brandedShortUrl,
        tunnelProviderName,
        tunnelStatus: 'ACTIVE'
      };
    }
  }

  if (publicTunnelUrl && (tunnelProcess || isProcessAlive(tunnelPid))) {
    const slug = getSchoolSlug();
    return {
      success: true,
      publicTunnelUrl: brandedShortUrl || `${publicTunnelUrl}/${slug}`,
      rawTunnelUrl: publicTunnelUrl,
      brandedShortUrl,
      tunnelProviderName,
      tunnelStatus: 'ACTIVE'
    };
  }

  tunnelStatus = 'STARTING';
  tunnelErrorMessage = null;
  broadcastAdminUpdate('TUNNEL_STARTING');

  // Önce Cloudflare Quick Tunnel dene
  try {
    const cf = await startCloudflareTunnel(PORT);
    tunnelProcess = cf.proc;
    tunnelPid = cf.pid;
    publicTunnelUrl = cf.url;
    tunnelProviderName = cf.provider;
    tunnelStatus = 'ACTIVE';

    const slug = getSchoolSlug();
    const targetWithSlug = `${publicTunnelUrl}/${slug}`;
    brandedShortUrl = await createBrandedSchoolShortUrl(targetWithSlug, slug);
    saveTunnelState();

    console.log(`  [ARKA PLAN CANLI TÜNEL]: ${targetWithSlug}`);
    if (brandedShortUrl) {
      console.log(`  [KURUMSAL GÖRÜNÜR LİNK]: ${brandedShortUrl}`);
    }
    broadcastAdminUpdate('TUNNEL_READY', { publicTunnelUrl, brandedShortUrl });
    return {
      success: true,
      publicTunnelUrl: brandedShortUrl || targetWithSlug,
      rawTunnelUrl: publicTunnelUrl,
      brandedShortUrl,
      tunnelProviderName,
      tunnelStatus: 'ACTIVE'
    };
  } catch (cfErr) {
    console.warn('Cloudflare tünel başlatılamadı, SSH yedek tünel deneniyor:', cfErr.message);
  }

  // Yedek 1: SSH localhost.run dene
  try {
    const sshTun = await startSshLocalhostRunTunnel(PORT);
    tunnelProcess = sshTun.proc;
    tunnelPid = sshTun.pid;
    publicTunnelUrl = sshTun.url;
    tunnelProviderName = sshTun.provider;
    tunnelStatus = 'ACTIVE';
    const slug = getSchoolSlug();
    brandedShortUrl = await createBrandedSchoolShortUrl(`${publicTunnelUrl}/${slug}`, slug);
    saveTunnelState();
    broadcastAdminUpdate('TUNNEL_READY', { publicTunnelUrl, brandedShortUrl });
    return {
      success: true,
      publicTunnelUrl: brandedShortUrl || `${publicTunnelUrl}/${slug}`,
      rawTunnelUrl: publicTunnelUrl,
      brandedShortUrl,
      tunnelProviderName,
      tunnelStatus: 'ACTIVE'
    };
  } catch (sshErr) {
    console.warn('SSH tünel başlatılamadı, localtunnel deneniyor:', sshErr.message);
  }

  // Yedek 2: Localtunnel dene
  try {
    const localtunnel = require('localtunnel');
    const lt = await localtunnel({ port: PORT });
    tunnelProcess = lt;
    publicTunnelUrl = lt.url;
    tunnelProviderName = 'Localtunnel Servisi';
    tunnelStatus = 'ACTIVE';
    lt.on('close', () => {
      publicTunnelUrl = null;
      tunnelStatus = 'IDLE';
    });
    broadcastAdminUpdate('TUNNEL_READY', { publicTunnelUrl });
    return {
      success: true,
      publicTunnelUrl,
      tunnelProviderName,
      tunnelStatus: 'ACTIVE'
    };
  } catch (ltErr) {
    tunnelStatus = 'ERROR';
    tunnelErrorMessage = ltErr.message;
    broadcastAdminUpdate('TUNNEL_ERROR', { error: ltErr.message });
    return {
      success: false,
      message: 'Canlı internet tüneli başlatılamadı: ' + ltErr.message
    };
  }
}

// Yönetici yetki kontrolü
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const queryToken = req.query.token || null;
  const token = bearerToken || queryToken;

  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Yönetici oturumu geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapınız.'
    });
  }
  next();
}

// ============================================================================
// 1. ÖĞRENCİ / GENEL (PUBLIC) API UÇ NOKTALARI
// (Güvenlik Kuralı #25: Öğrenci listesi ve diğer öğrencilerin seçimleri asla dönülmez!)
// ============================================================================

app.get('/api/public/config', (req, res) => {
  const period = db.checkElectionPeriod();
  const activeClubs = db.getClubsWithStats(true);
  res.json({
    schoolName: db.data.settings.schoolName,
    academicYear: db.data.settings.academicYear,
    classes: db.data.classes,
    requireStudentVerification: db.data.settings.requireStudentVerification,
    selectionStart: db.data.settings.selectionStart,
    selectionEnd: db.data.settings.selectionEnd,
    electionPeriod: period,
    totalActiveClubs: activeClubs.length
  });
});

// Öğrenci Kimlik Doğrulama (#24) ve Tek Kulüp Kuralı (#5)
app.post('/api/student/verify', (req, res) => {
  const period = db.checkElectionPeriod();
  if (!period.active) {
    return res.status(403).json({
      verified: false,
      periodClosed: true,
      reason: period.reason,
      message: period.message,
      startFormatted: period.startFormatted,
      endFormatted: period.endFormatted
    });
  }

  const { firstName, lastName, className, studentNo } = req.body || {};
  const result = db.verifyStudent({ firstName, lastName, className, studentNo });

  if (!result.verified) {
    return res.status(400).json(result);
  }

  if (result.alreadySelected) {
    return res.status(200).json(result);
  }

  // Doğrulama başarılı -> Sadece aktif kulüplerin isim ve kontenjan sayılarını dön
  const clubs = db.getClubsWithStats(true).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    teacher: c.teacher,
    quota: c.quota,
    filled: c.filled,
    available: c.available,
    isFull: c.isFull
  }));

  res.json({
    verified: true,
    alreadySelected: false,
    message: 'Öğrenciniz doğrulandı.',
    student: result.student,
    clubs
  });
});

// Öğrenci Kulüp Seçimi Onaylama (#6, #7) — 3 Tercihli Havuz Sistemi
app.post('/api/student/select', (req, res) => {
  const { firstName, lastName, className, studentNo, clubIds, clubId } = req.body || {};
  const result = db.submitSelection({ firstName, lastName, className, studentNo, clubIds, clubId });

  if (!result.success) {
    const status = result.errorCode === 'ALREADY_SELECTED' ? 409 : 400;
    return res.status(status).json(result);
  }

  // Yönetici paneline anlık bildirim gönder
  broadcastAdminUpdate('NEW_STUDENT_SELECTION', {
    selection: result.selection
  });

  res.json(result);
});

// Otomatik Dağıtma (1. -> 2. -> 3. Tercih ve <=3 Öğrenci Kuralı ile Yerleştirme)
app.post('/api/admin/pool/recalculate', requireAdmin, (req, res) => {
  const { clearManualOverrides } = req.body || {};
  if (clearManualOverrides) {
    db.data.selections.forEach((s) => {
      s.isManualAssignment = false;
    });
  }
  db.recalculatePoolPlacements();
  db.save();
  broadcastAdminUpdate('POOL_RECALCULATED');

  res.json({
    success: true,
    message: 'Otomatik Dağıtma tamamlandı! Öğrenciler 1. tercihlerine ve (≤3 öğrenci kuralına göre) 2. / 3. tercihlerine yerleştirildi.',
    dashboard: db.getAdminDashboardData()
  });
});

// Dağıtımı Geri Alıp Öğrencileri Tekrar Havuzda Bekleyen Duruma Çekme
app.post('/api/admin/pool/reset-to-pending', requireAdmin, (req, res) => {
  db.resetPoolPlacementsToPending();
  db.save();
  broadcastAdminUpdate('POOL_RESET_TO_PENDING');

  res.json({
    success: true,
    message: 'Tüm öğrenci yerleştirmeleri geri alındı; öğrenciler 3 tercihleriyle havuzda bekliyor.',
    dashboard: db.getAdminDashboardData()
  });
});

// ============================================================================
// 2. YÖNETİCİ KİMLİK DOĞRULAMA VE CANLI AKIŞ (SSE)
// ============================================================================

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const validUser = db.data.settings.adminUsername || 'admin';
  const validPass = db.data.settings.adminPassword || '123456';

  if (
    String(username || '').trim() === validUser &&
    String(password || '').trim() === validPass
  ) {
    const token = crypto.randomBytes(24).toString('hex');
    adminTokens.add(token);
    return res.json({
      success: true,
      token,
      schoolName: db.data.settings.schoolName
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Kullanıcı adı veya şifre hatalı!'
  });
});

app.get('/api/admin/events', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const data = db.getAdminDashboardData();
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
  const currentOrigin = `${protocol}://${host}`;

  res.json({
    success: true,
    ...data,
    network: getNetworkPayload(currentOrigin)
  });
});

// ============================================================================
// 3. KULÜP YÖNETİMİ (#14, #15)
// ============================================================================

app.post('/api/admin/clubs', requireAdmin, (req, res) => {
  const { name, description, quota, teacher, active } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: 'Kulüp adı zorunludur.' });
  }

  const parsedQuota = Math.max(1, parseInt(quota, 10) || 20);
  const newClub = {
    id: `club-${Date.now()}`,
    name: String(name).trim().toLocaleUpperCase('tr-TR'),
    description: String(description || '').trim(),
    quota: parsedQuota,
    teacher: String(teacher || '').trim(),
    active: active !== false,
    createdAt: new Date().toISOString()
  };

  db.data.clubs.push(newClub);
  db.save();
  broadcastAdminUpdate('CLUB_ADDED', { club: newClub });

  res.json({
    success: true,
    message: 'Kulüp başarıyla eklendi.',
    club: newClub,
    dashboard: db.getAdminDashboardData()
  });
});

app.put('/api/admin/clubs/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const club = db.data.clubs.find((c) => c.id === id);
  if (!club) {
    return res.status(404).json({ success: false, message: 'Kulüp bulunamadı.' });
  }

  const { name, description, quota, teacher, active } = req.body || {};
  if (name !== undefined && String(name).trim()) {
    const newName = String(name).trim().toLocaleUpperCase('tr-TR');
    club.name = newName;
    db.data.selections.forEach((sel) => {
      if (sel.clubId === club.id) {
        sel.clubName = newName;
      }
    });
  }
  if (description !== undefined) club.description = String(description).trim();
  if (quota !== undefined) club.quota = Math.max(1, parseInt(quota, 10) || 1);
  if (teacher !== undefined) club.teacher = String(teacher).trim();
  if (active !== undefined) club.active = Boolean(active);

  db.save();
  broadcastAdminUpdate('CLUB_UPDATED', { club });

  res.json({
    success: true,
    message: 'Kulüp bilgileri güncellendi.',
    club,
    dashboard: db.getAdminDashboardData()
  });
});

app.delete('/api/admin/clubs/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const idx = db.data.clubs.findIndex((c) => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Kulüp bulunamadı.' });
  }

  const removed = db.data.clubs.splice(idx, 1)[0];
  db.data.selections = db.data.selections.filter((sel) => sel.clubId !== id);
  db.save();
  broadcastAdminUpdate('CLUB_DELETED', { clubId: id });

  res.json({
    success: true,
    message: `${removed.name} silindi.`,
    dashboard: db.getAdminDashboardData()
  });
});

// ============================================================================
// 4. ÖĞRENCİ KULÜBÜNÜ DEĞİŞTİRME VE SEÇİM YÖNETİMİ (#26)
// ============================================================================

app.put('/api/admin/selections/change-club', requireAdmin, (req, res) => {
  const { className, studentNo, firstName, lastName, newClubId } = req.body || {};
  const normClass = normalizeClass(className);
  const normNo = normalizeStudentNo(studentNo);

  if (!normClass || !normNo || !newClubId) {
    return res.status(400).json({
      success: false,
      message: 'Öğrenci sınıfı, numarası ve yeni kulüp bilgisi gereklidir.'
    });
  }

  const club = db.data.clubs.find((c) => c.id === newClubId);
  if (!club) {
    return res.status(404).json({ success: false, message: 'Seçilen yeni kulüp bulunamadı.' });
  }

  let existingSel = db.data.selections.find(
    (s) =>
      normalizeClass(s.className) === normClass &&
      normalizeStudentNo(s.studentNo) === normNo
  );

  const nowIso = new Date().toISOString();

  if (existingSel) {
    existingSel.clubId = club.id;
    existingSel.clubName = club.name;
    existingSel.isManualAssignment = true;
    existingSel.assignedChoiceOrder = 0;
    existingSel.placementReason = 'Yönetici tarafından manuel olarak atandı.';
    existingSel.selectedAt = nowIso;
    existingSel.dateFormatted = formatDateTr(nowIso);
  } else {
    const regStudent = db.data.students.find(
      (s) =>
        normalizeClass(s.className) === normClass &&
        normalizeStudentNo(s.studentNo) === normNo
    );
    existingSel = {
      id: `sel-${Date.now()}`,
      firstName: regStudent ? regStudent.firstName : String(firstName || '').trim(),
      lastName: regStudent ? regStudent.lastName : String(lastName || '').trim(),
      className: normClass,
      studentNo: normNo,
      choices: [club.id],
      choiceNames: [club.name],
      clubId: club.id,
      clubName: club.name,
      isManualAssignment: true,
      assignedChoiceOrder: 0,
      placementReason: 'Yönetici tarafından manuel olarak atandı.',
      selectedAt: nowIso,
      dateFormatted: formatDateTr(nowIso)
    };
    db.data.selections.push(existingSel);
  }

  db.recalculatePoolPlacements();
  db.save();
  broadcastAdminUpdate('STUDENT_CLUB_CHANGED', { selection: existingSel });

  res.json({
    success: true,
    message: `${existingSel.firstName} ${existingSel.lastName} isimli öğrencinin kulübü "${club.name}" olarak güncellendi.`,
    selection: existingSel,
    dashboard: db.getAdminDashboardData()
  });
});

app.delete('/api/admin/selections/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const idx = db.data.selections.findIndex((s) => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Seçim kaydı bulunamadı.' });
  }

  const removed = db.data.selections.splice(idx, 1)[0];
  db.save();
  broadcastAdminUpdate('SELECTION_DELETED', { id });

  res.json({
    success: true,
    message: `${removed.firstName} ${removed.lastName} öğrencisinin kulüp seçimi sıfırlandı.`,
    dashboard: db.getAdminDashboardData()
  });
});

// ============================================================================
// 5. ÖĞRENCİ EKLEME, TEKLİ/TOPLU ÖĞRENCİ SİLME VE EXCEL/CSV YÜKLEME (#23)
// ============================================================================

app.post('/api/admin/students/add', requireAdmin, (req, res) => {
  const { firstName, lastName, className, studentNo } = req.body || {};
  const normClass = normalizeClass(className);
  const normNo = normalizeStudentNo(studentNo);

  if (!firstName || !lastName || !normClass || !normNo) {
    return res.status(400).json({
      success: false,
      message: 'Ad, Soyad, Sınıf ve Öğrenci No alanları zorunludur.'
    });
  }

  const existing = db.data.students.find(
    (s) =>
      normalizeClass(s.className) === normClass &&
      normalizeStudentNo(s.studentNo) === normNo
  );

  if (existing) {
    existing.firstName = String(firstName).trim();
    existing.lastName = String(lastName).trim();
    existing.className = normClass;
    existing.studentNo = normNo;
  } else {
    db.data.students.push({
      id: `st-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      className: normClass,
      studentNo: normNo
    });
  }

  if (!db.data.classes.includes(normClass)) {
    db.data.classes.push(normClass);
    db.data.classes.sort((a, b) => a.localeCompare(b, 'tr'));
  }

  db.save();
  broadcastAdminUpdate('STUDENTS_UPDATED');

  res.json({
    success: true,
    message: 'Öğrenci başarıyla kaydedildi.',
    dashboard: db.getAdminDashboardData()
  });
});

// Öğrenciyi hem kayıtlı listeden hem de kulüp seçimlerinden tamamen silme (ID veya Sınıf+No ile)
app.post('/api/admin/students/delete', requireAdmin, (req, res) => {
  const { id, className, studentNo } = req.body || {};
  const normClass = normalizeClass(className);
  const normNo = normalizeStudentNo(studentNo);

  let targetClass = normClass;
  let targetNo = normNo;
  let removedName = '';

  if (id) {
    const foundSt = db.data.students.find((s) => s.id === id);
    if (foundSt) {
      targetClass = normalizeClass(foundSt.className);
      targetNo = normalizeStudentNo(foundSt.studentNo);
      removedName = `${foundSt.firstName} ${foundSt.lastName}`;
    }
  }

  const beforeSt = db.data.students.length;
  const beforeSel = db.data.selections.length;

  db.data.students = db.data.students.filter((s) => {
    if (id && s.id === id) return false;
    if (
      targetClass &&
      targetNo &&
      normalizeClass(s.className) === targetClass &&
      normalizeStudentNo(s.studentNo) === targetNo
    ) {
      if (!removedName) removedName = `${s.firstName} ${s.lastName}`;
      return false;
    }
    return true;
  });

  db.data.selections = db.data.selections.filter((sel) => {
    if (id && (`auto-${sel.id}` === id || sel.id === id)) {
      if (!removedName) removedName = `${sel.firstName} ${sel.lastName}`;
      return false;
    }
    if (
      targetClass &&
      targetNo &&
      normalizeClass(sel.className) === targetClass &&
      normalizeStudentNo(sel.studentNo) === targetNo
    ) {
      if (!removedName) removedName = `${sel.firstName} ${sel.lastName}`;
      return false;
    }
    return true;
  });

  if (db.data.students.length === beforeSt && db.data.selections.length === beforeSel) {
    return res.status(404).json({ success: false, message: 'Silinecek öğrenci kaydı bulunamadı.' });
  }

  db.save();
  broadcastAdminUpdate('STUDENTS_UPDATED');

  res.json({
    success: true,
    message: `${removedName || 'Öğrenci'} sistemden tamamen silindi.`,
    dashboard: db.getAdminDashboardData()
  });
});

// Seçili öğrencileri toplu silme
app.post('/api/admin/students/delete-bulk', requireAdmin, (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Silinecek öğrenci seçilmedi.' });
  }

  const keysToRemove = new Set(
    items.map((i) => `${normalizeClass(i.className)}_${normalizeStudentNo(i.studentNo)}`)
  );

  db.data.students = db.data.students.filter(
    (s) => !keysToRemove.has(`${normalizeClass(s.className)}_${normalizeStudentNo(s.studentNo)}`)
  );
  db.data.selections = db.data.selections.filter(
    (sel) => !keysToRemove.has(`${normalizeClass(sel.className)}_${normalizeStudentNo(sel.studentNo)}`)
  );

  db.save();
  broadcastAdminUpdate('STUDENTS_UPDATED');

  res.json({
    success: true,
    message: `${keysToRemove.size} öğrenci sistemden silindi.`,
    dashboard: db.getAdminDashboardData()
  });
});

// Tüm öğrencileri ve seçimleri toplu temizleme
app.delete('/api/admin/students-all', requireAdmin, (req, res) => {
  db.data.students = [];
  db.data.selections = [];
  db.save();
  broadcastAdminUpdate('STUDENTS_CLEARED');

  res.json({
    success: true,
    message: 'Tüm öğrenci listesi ve kulüp seçimleri temizlendi.',
    dashboard: db.getAdminDashboardData()
  });
});

app.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const student = db.data.students.find((s) => s.id === id);

  if (student) {
    const tClass = normalizeClass(student.className);
    const tNo = normalizeStudentNo(student.studentNo);
    db.data.students = db.data.students.filter((s) => s.id !== id);
    db.data.selections = db.data.selections.filter(
      (sel) => !(normalizeClass(sel.className) === tClass && normalizeStudentNo(sel.studentNo) === tNo)
    );
  } else {
    db.data.selections = db.data.selections.filter(
      (sel) => sel.id !== id && `auto-${sel.id}` !== id
    );
  }

  db.save();
  broadcastAdminUpdate('STUDENTS_UPDATED');

  res.json({
    success: true,
    message: 'Öğrenci sistemden silindi.',
    dashboard: db.getAdminDashboardData()
  });
});

// Excel (.xlsx, .xls) veya CSV (.csv) veya JSON olarak toplu öğrenci yükleme
app.post('/api/admin/students/upload', requireAdmin, (req, res) => {
  try {
    const { fileBase64, rows: directRows, replaceExisting } = req.body || {};
    let parsedRows = [];

    if (Array.isArray(directRows)) {
      parsedRows = directRows;
    } else if (fileBase64) {
      const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
      const buffer = Buffer.from(base64Data, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      parsedRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Yüklenecek dosya verisi bulunamadı.'
      });
    }

    if (!parsedRows || parsedRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dosyada geçerli öğrenci satırı bulunamadı.'
      });
    }

    const newStudents = [];
    for (const row of parsedRows) {
      const keys = Object.keys(row);
      const getVal = (candidates) => {
        for (const k of keys) {
          const normKey = normalizeTr(k)
            .replace(/Ğ/g, 'G')
            .replace(/Ü/g, 'U')
            .replace(/Ş/g, 'S')
            .replace(/İ/g, 'I')
            .replace(/Ö/g, 'O')
            .replace(/Ç/g, 'C')
            .replace(/[^A-Z0-9]/g, '');
          if (candidates.includes(normKey)) return String(row[k] ?? '').trim();
        }
        return '';
      };

      let firstName = getVal(['AD', 'ADI', 'OGRENCIADI', 'ISIM', 'FIRSTNAME']);
      let lastName = getVal(['SOYAD', 'SOYADI', 'OGRENCISOYADI', 'SOYISIM', 'LASTNAME']);
      const fullName = getVal(['ADSOYAD', 'ADISOYADI', 'OGRENCIADSOYAD', 'ISIMSOYISIM']);
      if ((!firstName || !lastName) && fullName) {
        const parts = fullName.split(/\s+/);
        if (parts.length >= 2) {
          lastName = parts.pop();
          firstName = parts.join(' ');
        } else {
          firstName = fullName;
        }
      }

      const className = normalizeClass(getVal(['SINIF', 'SINIFI', 'SUBE', 'SINIFSUBE', 'CLASS']));
      const studentNo = normalizeStudentNo(
        getVal(['OGRENCINO', 'OGRENCINUMARASI', 'NO', 'NUMARA', 'OKULNO', 'STUDENTNO'])
      );

      if (!firstName && !className && keys.length >= 4) {
        firstName = String(row[keys[0]] ?? '').trim();
        lastName = String(row[keys[1]] ?? '').trim();
        const c = normalizeClass(row[keys[2]]);
        const n = normalizeStudentNo(row[keys[3]]);
        if (firstName && lastName && c && n && normalizeTr(firstName) !== 'AD') {
          newStudents.push({ firstName, lastName, className: c, studentNo: n });
        }
        continue;
      }

      if (firstName && lastName && className && studentNo) {
        newStudents.push({ firstName, lastName, className, studentNo });
      }
    }

    if (newStudents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dosyadaki sütunlar (Ad, Soyad, Sınıf, Öğrenci No) okunamadı. Lütfen şablona uygun dosya yükleyiniz.'
      });
    }

    if (replaceExisting) {
      db.data.students = [];
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const item of newStudents) {
      const existing = db.data.students.find(
        (s) =>
          normalizeClass(s.className) === item.className &&
          normalizeStudentNo(s.studentNo) === item.studentNo
      );
      if (existing) {
        existing.firstName = item.firstName;
        existing.lastName = item.lastName;
        updatedCount++;
      } else {
        db.data.students.push({
          id: `st-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          firstName: item.firstName,
          lastName: item.lastName,
          className: item.className,
          studentNo: item.studentNo
        });
        addedCount++;
      }

      if (!db.data.classes.includes(item.className)) {
        db.data.classes.push(item.className);
      }
    }

    db.data.classes.sort((a, b) => a.localeCompare(b, 'tr'));
    db.save();
    broadcastAdminUpdate('STUDENTS_UPLOADED');

    res.json({
      success: true,
      message: `Toplam ${newStudents.length} öğrenci işlendi (${addedCount} yeni eklendi, ${updatedCount} güncellendi).`,
      addedCount,
      updatedCount,
      dashboard: db.getAdminDashboardData()
    });
  } catch (err) {
    console.error('Öğrenci yükleme hatası:', err);
    res.status(500).json({
      success: false,
      message: 'Dosya işlenirken hata oluştu: ' + err.message
    });
  }
});

app.get('/api/admin/students/template.xlsx', requireAdmin, (req, res) => {
  const buf = generateStudentTemplateXlsx(db.data.students);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="Okul_Ogrenci_Listesi_Sablonu.xlsx"');
  res.send(buf);
});

// ============================================================================
// 6. SINIF EKLEME VE SINIF SİLME YÖNETİMİ
// ============================================================================

app.post('/api/admin/classes', requireAdmin, (req, res) => {
  const normClass = normalizeClass(req.body?.className);
  if (!normClass) {
    return res.status(400).json({ success: false, message: 'Geçerli bir sınıf adı giriniz (Örn: 6C).' });
  }
  if (!db.data.classes.includes(normClass)) {
    db.data.classes.push(normClass);
    db.data.classes.sort((a, b) => a.localeCompare(b, 'tr'));
    db.save();
    broadcastAdminUpdate('CLASSES_UPDATED');
  }
  res.json({
    success: true,
    message: `${normClass} sınıfı eklendi.`,
    dashboard: db.getAdminDashboardData()
  });
});

app.delete('/api/admin/classes/:className', requireAdmin, (req, res) => {
  const normClass = normalizeClass(req.params.className);
  if (!normClass) {
    return res.status(400).json({ success: false, message: 'Geçersiz sınıf adı.' });
  }

  const deleteStudents = req.query.deleteStudents !== 'false';

  db.data.classes = db.data.classes.filter((c) => normalizeClass(c) !== normClass);

  let removedStudentsCount = 0;
  if (deleteStudents) {
    const beforeCount = db.data.students.length;
    db.data.students = db.data.students.filter((s) => normalizeClass(s.className) !== normClass);
    removedStudentsCount = beforeCount - db.data.students.length;
    db.data.selections = db.data.selections.filter((sel) => normalizeClass(sel.className) !== normClass);
  }

  db.save();
  broadcastAdminUpdate('CLASSES_UPDATED');

  res.json({
    success: true,
    message: deleteStudents
      ? `${normClass} sınıfı ve bu sınıftaki ${removedStudentsCount} öğrenci kaydı silindi.`
      : `${normClass} sınıfı listeden kaldırıldı.`,
    dashboard: db.getAdminDashboardData()
  });
});

// ============================================================================
// 7. WORD (.DOCX) VE PDF (.PDF) DIŞA AKTARMA (#19, #20, #21, #28)
// ============================================================================

function getClubAndStudents(clubId) {
  const clubs = db.getClubsWithStats(false);
  const club = clubs.find((c) => c.id === clubId);
  if (!club) return null;

  const students = db.data.selections
    .filter((sel) => sel.clubId === clubId)
    .sort((a, b) => {
      if (a.className !== b.className) return a.className.localeCompare(b.className, 'tr');
      return (parseInt(a.studentNo, 10) || 0) - (parseInt(b.studentNo, 10) || 0);
    });

  return { club, students };
}

// Tek Kulüp Word İndir (#19)
app.get('/api/admin/export/club/:clubId/docx', requireAdmin, async (req, res) => {
  try {
    const info = getClubAndStudents(req.params.clubId);
    if (!info) return res.status(404).send('Kulüp bulunamadı.');

    const buffer = await generateClubDocx({
      schoolName: db.data.settings.schoolName,
      academicYear: db.data.settings.academicYear,
      club: info.club,
      students: info.students
    });

    const fileName = `${sanitizeFileName(info.club.name)}.docx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Word oluşturma hatası:', err);
    res.status(500).send('Word dosyası oluşturulamadı: ' + err.message);
  }
});

// Tek Kulüp PDF İndir (#20)
app.get('/api/admin/export/club/:clubId/pdf', requireAdmin, async (req, res) => {
  try {
    const info = getClubAndStudents(req.params.clubId);
    if (!info) return res.status(404).send('Kulüp bulunamadı.');

    const buffer = await generateClubPdf({
      schoolName: db.data.settings.schoolName,
      academicYear: db.data.settings.academicYear,
      club: info.club,
      students: info.students
    });

    const fileName = `${sanitizeFileName(info.club.name)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error('PDF oluşturma hatası:', err);
    res.status(500).send('PDF dosyası oluşturulamadı: ' + err.message);
  }
});

// Tüm Kulüpleri Word'e Aktar (#21)
app.get('/api/admin/export/all-clubs/docx', requireAdmin, async (req, res) => {
  try {
    const clubs = db.getClubsWithStats(false);
    const clubsWithStudents = clubs.map((club) => ({
      club,
      students: db.data.selections
        .filter((sel) => sel.clubId === club.id)
        .sort((a, b) => {
          if (a.className !== b.className) return a.className.localeCompare(b.className, 'tr');
          return (parseInt(a.studentNo, 10) || 0) - (parseInt(b.studentNo, 10) || 0);
        })
    }));

    const buffer = await generateAllClubsDocx({
      schoolName: db.data.settings.schoolName,
      academicYear: db.data.settings.academicYear,
      clubsWithStudents
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="Tum_Kulupler_Ogrenci_Listesi.docx"');
    res.send(buffer);
  } catch (err) {
    console.error('Tüm kulüpler Word hatası:', err);
    res.status(500).send('Dosya oluşturulamadı: ' + err.message);
  }
});

// Tüm Kulüpleri PDF'e Aktar (#21)
app.get('/api/admin/export/all-clubs/pdf', requireAdmin, async (req, res) => {
  try {
    const clubs = db.getClubsWithStats(false);
    const clubsWithStudents = clubs.map((club) => ({
      club,
      students: db.data.selections
        .filter((sel) => sel.clubId === club.id)
        .sort((a, b) => {
          if (a.className !== b.className) return a.className.localeCompare(b.className, 'tr');
          return (parseInt(a.studentNo, 10) || 0) - (parseInt(b.studentNo, 10) || 0);
        })
    }));

    const buffer = await generateAllClubsPdf({
      schoolName: db.data.settings.schoolName,
      academicYear: db.data.settings.academicYear,
      clubsWithStudents
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Tum_Kulupler_Ogrenci_Listesi.pdf"');
    res.send(buffer);
  } catch (err) {
    console.error('Tüm kulüpler PDF hatası:', err);
    res.status(500).send('Dosya oluşturulamadı: ' + err.message);
  }
});

// Genel Rapor Word / PDF Dışa Aktarma (#28)
app.post('/api/admin/export/report/:format', requireAdmin, async (req, res) => {
  try {
    const { format } = req.params;
    const { reportTitle, subtitle, headers, rows, fileName } = req.body || {};

    if (format === 'docx') {
      const buffer = await generateGenericReportDocx({
        schoolName: db.data.settings.schoolName,
        academicYear: db.data.settings.academicYear,
        reportTitle: reportTitle || 'OKUL KULÜP RAPORU',
        subtitle: subtitle || '',
        headers: headers || [],
        rows: rows || []
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName || 'Kulup_Raporu'}.docx"`
      );
      return res.send(buffer);
    } else {
      const buffer = await generateGenericReportPdf({
        schoolName: db.data.settings.schoolName,
        academicYear: db.data.settings.academicYear,
        reportTitle: reportTitle || 'OKUL KULÜP RAPORU',
        subtitle: subtitle || '',
        headers: headers || [],
        rows: rows || []
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName || 'Kulup_Raporu'}.pdf"`
      );
      return res.send(buffer);
    }
  } catch (err) {
    console.error('Rapor dışa aktarma hatası:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 8. QR KOD VE PAYLAŞIM LİNKİ / CANLI İNTERNET TÜNELİ (#17, #18)
// ============================================================================

app.get('/api/admin/qrcode', requireAdmin, async (req, res) => {
  try {
    const slug = getSchoolSlug();
    let targetUrl = req.query.url || `http://localhost:${PORT}`;
    if (
      publicTunnelUrl &&
      (targetUrl === slug ||
        targetUrl === `https://${slug}` ||
        targetUrl === `http://${slug}` ||
        targetUrl === `https://www.${slug}.net` ||
        targetUrl === `http://www.${slug}.net` ||
        targetUrl === `https://${slug}.net`)
    ) {
      targetUrl = `${publicTunnelUrl.replace(/\/+$/, '')}/${slug}`;
    }
    const download = req.query.download === '1';

    const pngBuffer = await QRCode.toBuffer(targetUrl, {
      type: 'png',
      width: 600,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF'
      }
    });

    res.setHeader('Content-Type', 'image/png');
    if (download) {
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Ogrenci_Kulup_Secim_QR_Kodu.png"'
      );
    }
    res.send(pngBuffer);
  } catch (err) {
    res.status(500).json({ success: false, message: 'QR Kod oluşturulamadı: ' + err.message });
  }
});

app.post('/api/admin/tunnel/start', requireAdmin, async (req, res) => {
  try {
    const forceRestart = Boolean(req.body?.restart);
    const result = await ensurePublicTunnelRunning(forceRestart);
    if (!result.success) {
      return res.status(500).json(result);
    }
    res.json({
      success: true,
      publicTunnelUrl: result.publicTunnelUrl,
      tunnelProviderName: result.tunnelProviderName,
      message: 'Okul dışı erişim için şifresiz canlı internet bağlantısı aktif!'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Canlı tünel başlatılamadı: ' + err.message
    });
  }
});

// ============================================================================
// 9. YEDEKLEME VE GERİ YÜKLEME (#27) VE AYARLAR (#16)
// ============================================================================

app.get('/api/admin/backup/json', requireAdmin, (req, res) => {
  const payload = {
    backupVersion: '1.0',
    exportedAt: new Date().toISOString(),
    schoolName: db.data.settings.schoolName,
    data: db.data
  };
  const fileName = `Kulup_Sistemi_Yedek_${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(JSON.stringify(payload, null, 2));
});

app.get('/api/admin/backup/csv', requireAdmin, (req, res) => {
  const dash = db.getAdminDashboardData();
  const header = ['Sıra', 'Ad', 'Soyad', 'Sınıf', 'Öğrenci No', 'Seçilen Kulüp', 'Seçim Durumu', 'Seçim Tarihi'];
  const lines = [header.join(';')];

  dash.allStudents.forEach((st, idx) => {
    const row = [
      idx + 1,
      `"${(st.firstName || '').replace(/"/g, '""')}"`,
      `"${(st.lastName || '').replace(/"/g, '""')}"`,
      `"${st.className || ''}"`,
      `"${st.studentNo || ''}"`,
      `"${(st.clubName || 'SEÇİM YAPMADI').replace(/"/g, '""')}"`,
      st.hasSelected ? 'Seçti' : 'Seçmedi',
      st.dateFormatted || '-'
    ];
    lines.push(row.join(';'));
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const fileName = `Ogrenci_Kulup_Secimleri_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csvContent);
});

app.post('/api/admin/backup/restore', requireAdmin, (req, res) => {
  try {
    const { backupData } = req.body || {};
    const target = backupData?.data ? backupData.data : backupData;

    if (!target || !Array.isArray(target.clubs) || !Array.isArray(target.selections)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz yedek dosyası formatı!'
      });
    }

    db.data = {
      settings: target.settings || db.data.settings,
      classes: Array.isArray(target.classes) ? target.classes : db.data.classes,
      clubs: target.clubs,
      students: Array.isArray(target.students) ? target.students : [],
      selections: target.selections
    };
    db.save();
    broadcastAdminUpdate('BACKUP_RESTORED');

    res.json({
      success: true,
      message: 'Yedek verileri başarıyla geri yüklendi.',
      dashboard: db.getAdminDashboardData()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Yedek geri yüklenirken hata oluştu: ' + err.message
    });
  }
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const {
    schoolName,
    academicYear,
    principalName,
    selectionStart,
    selectionEnd,
    isSelectionOpen,
    requireStudentVerification,
    adminUsername,
    adminPassword,
    customPublicUrl,
    smsAnnouncementTemplate,
    cloudSync
  } = req.body || {};

  const s = db.data.settings;
  if (schoolName !== undefined) s.schoolName = String(schoolName).trim();
  if (academicYear !== undefined) s.academicYear = String(academicYear).trim();
  if (principalName !== undefined) s.principalName = String(principalName).trim();
  if (selectionStart !== undefined) s.selectionStart = selectionStart;
  if (selectionEnd !== undefined) s.selectionEnd = selectionEnd;
  if (isSelectionOpen !== undefined) s.isSelectionOpen = Boolean(isSelectionOpen);
  if (requireStudentVerification !== undefined) {
    s.requireStudentVerification = Boolean(requireStudentVerification);
  }
  if (adminUsername !== undefined && String(adminUsername).trim()) {
    s.adminUsername = String(adminUsername).trim();
  }
  if (adminPassword !== undefined && String(adminPassword).trim()) {
    s.adminPassword = String(adminPassword).trim();
  }
  if (customPublicUrl !== undefined) {
    s.customPublicUrl = String(customPublicUrl).trim();
  }
  if (smsAnnouncementTemplate !== undefined) {
    s.smsAnnouncementTemplate = String(smsAnnouncementTemplate).trim();
  }
  if (cloudSync && typeof cloudSync === 'object') {
    s.cloudSync = {
      ...s.cloudSync,
      ...cloudSync
    };
  }

  db.save();
  broadcastAdminUpdate('SETTINGS_UPDATED');

  res.json({
    success: true,
    message: 'Sistem ayarları başarıyla kaydedildi.',
    dashboard: db.getAdminDashboardData()
  });
});

app.post('/api/admin/reset-demo', requireAdmin, (req, res) => {
  const dashboard = db.resetToDemoData();
  broadcastAdminUpdate('DEMO_RESET');
  res.json({
    success: true,
    message: 'Sistem örnek okul verilerine sıfırlandı.',
    dashboard
  });
});

// SPA Yönlendirmeleri (/admin, /secim, /balikesirbahcesehirkoleji vb. kurumsal adresler)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/secim', '/balikesirbahcesehirkoleji', '/balikesir-bahcesehir-koleji', '/kulup-secimi'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:customSlug', (req, res, next) => {
  const s = String(req.params.customSlug || '').toLowerCase();
  if (s.includes('.') || s === 'api') return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const lanUrls = getLocalNetworkUrls(PORT);
  console.log('================================================================');
  console.log('  PROFESYONEL ONLINE ÖĞRENCİ KULÜP SEÇİM SİSTEMİ AKTİF');
  console.log('================================================================');
  console.log(`  Yerel Adres (Bilgisayar): http://localhost:${PORT}`);
  if (lanUrls.length > 0) {
    console.log(`  Ağ Adresi (Telefon/Tablet): ${lanUrls[0]}`);
  }
  console.log(`  Yönetici Paneli:           http://localhost:${PORT}/?panel=admin`);
  console.log(`  Öğrenci Seçim Ekranı:      http://localhost:${PORT}/`);
  console.log('================================================================');

  // Sunucu açılır açılmaz Okul Dışı Canlı İnternet Bağlantısını (Cloudflare Tunnel) otomatik başlat!
  ensurePublicTunnelRunning(false).catch((err) => {
    console.warn('Otomatik tünel başlatma uyarısı:', err.message);
  });
});
