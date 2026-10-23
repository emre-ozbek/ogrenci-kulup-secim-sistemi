// ============================================================================
// PROFESYONEL ONLINE ÖĞRENCİ KULÜP SEÇİM SİSTEMİ - İSTEMCİ UYGULAMASI (app.js)
// ============================================================================

const state = {
  mode: 'student', // 'student' | 'admin'
  publicConfig: null,
  verifiedStudent: null,
  availableClubs: [],
  selectedChoices: [], // [club1, club2, club3] - 1., 2. ve 3. tercih kulüpleri
  pendingClubSelection: null,

  // Yönetici durumu
  adminToken: sessionStorage.getItem('kulup_admin_token') || 'demo-admin-session-token',
  isAdminLoggedIn: sessionStorage.getItem('kulup_admin_logged_in') === 'true',
  activeAdminTab: 'dashboard',
  dashboardData: null,
  networkInfo: null,
  selectedShareBaseUrl: '',
  selectedClubIdForDetail: null,
  selectedClassForReport: '6A',
  activeReportType: 'all',
  selectedStudentKeys: new Set(),
  selectedClassStudentKeys: new Set(),
  smsEditorInitialized: false,
  smsEditorDirty: false,
  lastInjectedShareUrl: '',
  sseConnection: null,
  barChartInstance: null,
  pieChartInstance: null
};

// HTML Karakter Güvenliği (XSS Koruması)
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Toast Bildirim Gösterimi
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-item';
  const colors = {
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#38bdf8'
  };
  toast.style.borderLeftColor = colors[type] || colors.info;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 3800);
}

// Yardımcı API İstek Fonksiyonu
async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (state.adminToken) {
    headers['Authorization'] = `Bearer ${state.adminToken}`;
  }
  const response = await fetch(url, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

// ============================================================================
// BAŞLANGIÇ YÜKLEMESİ
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const pathName = window.location.pathname.toLowerCase();
  const isAdminRoute = params.get('panel') === 'admin' || pathName.endsWith('/admin');
  const isCustomStudentRoute =
    !isAdminRoute &&
    (params.get('mode') === 'student' ||
      pathName.endsWith('/secim') ||
      pathName.includes('balikesirbahcesehirkoleji') ||
      (pathName !== '/' && pathName !== '/index.html'));

  // Eğer doğrudan öğrenci seçim linkiyle (/balikesirbahcesehirkoleji, ?mode=student veya /secim) girilmişse
  if (isCustomStudentRoute) {
    const adminBtn = document.getElementById('btnSwitchAdmin');
    const studentBtn = document.getElementById('btnSwitchStudent');
    if (adminBtn) adminBtn.style.display = 'none';
    if (studentBtn) studentBtn.style.display = 'none';

    // Tarayıcı adres çubuğunda ?mode=student yerine kurumsal /balikesirbahcesehirkoleji görünsün
    try {
      if (window.location.search.includes('mode=student') || pathName === '/') {
        window.history.replaceState({}, '', '/balikesirbahcesehirkoleji');
      }
    } catch (e) {}
  }

  await loadPublicConfig();

  if (isAdminRoute) {
    switchMainMode('admin');
  } else {
    switchMainMode('student');
  }
});

async function loadPublicConfig() {
  try {
    const { ok, data } = await apiFetch('/api/public/config');
    if (ok && data) {
      state.publicConfig = data;
      applyPublicConfigToUI(data);
    }
  } catch (err) {
    console.error('Yapılandırma yüklenemedi:', err);
  }
}

function applyPublicConfigToUI(cfg) {
  const schoolName = cfg.schoolName || 'CUMHURİYET ORTAOKULU';
  const academicYear = cfg.academicYear || 'Online Öğrenci Kulüp Seçim Sistemi';

  document.getElementById('headerSchoolName').textContent = schoolName;
  document.getElementById('headerAcademicYear').textContent = academicYear;
  document.getElementById('studentHeroSchoolBadge').textContent = schoolName;

  // Sınıf açılır listesini güncelle (#3)
  const classSelect = document.getElementById('stClassName');
  if (classSelect && Array.isArray(cfg.classes)) {
    const currentVal = classSelect.value;
    classSelect.innerHTML =
      `<option value="">Sınıf Seçiniz</option>` +
      cfg.classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (currentVal && cfg.classes.includes(currentVal)) {
      classSelect.value = currentVal;
    }
  }

  // Seçim süresi kontrolü (#16)
  const period = cfg.electionPeriod;
  const closedView = document.getElementById('studentPeriodClosedView');
  const loginStep = document.getElementById('studentLoginStep');
  const selectionStep = document.getElementById('studentClubSelectionStep');
  const successStep = document.getElementById('studentSuccessStep');

  if (period && !period.active) {
    closedView.style.display = 'block';
    loginStep.style.display = 'none';
    selectionStep.style.display = 'none';
    successStep.style.display = 'none';
    document.getElementById('periodClosedHeading').textContent =
      period.message || 'KULÜP SEÇİM SÜRESİ SONA ERMİŞTİR.';
    document.getElementById('closedStartText').textContent = period.startFormatted || '-';
    document.getElementById('closedEndText').textContent = period.endFormatted || '-';
  } else {
    closedView.style.display = 'none';
    if (!state.verifiedStudent && successStep.style.display === 'none') {
      loginStep.style.display = 'block';
    }
  }
}

// ============================================================================
// EKRAN MODU GEÇİŞİ (ÖĞRENCİ <-> YÖNETİCİ)
// ============================================================================
async function switchMainMode(mode) {
  state.mode = mode;
  const studentView = document.getElementById('studentMainView');
  const adminView = document.getElementById('adminMainView');
  const btnStudent = document.getElementById('btnSwitchStudent');
  const btnAdmin = document.getElementById('btnSwitchAdmin');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');

  if (mode === 'admin') {
    studentView.style.display = 'none';
    adminView.style.display = 'block';
    btnStudent?.classList.remove('active');
    btnAdmin?.classList.add('active');

    if (state.isAdminLoggedIn) {
      showAdminAuthenticatedUI();
      await refreshAdminData();
      connectAdminSSE();
    } else {
      document.getElementById('adminLoginGate').style.display = 'block';
      document.getElementById('adminAuthenticatedLayout').style.display = 'none';
      if (mobileMenuBtn) mobileMenuBtn.style.display = 'none';
    }
  } else {
    adminView.style.display = 'none';
    studentView.style.display = 'block';
    btnAdmin?.classList.remove('active');
    btnStudent?.classList.add('active');
    if (mobileMenuBtn) mobileMenuBtn.style.display = 'none';
    await loadPublicConfig();
  }
}

function toggleMobileSidebar() {
  const sb = document.getElementById('adminSidebar');
  if (sb) sb.classList.toggle('mobile-open');
}

// ============================================================================
// 1. ÖĞRENCİ KİMLİK DOĞRULAMA VE KULÜP SEÇİM AKIŞI (#3, #4, #5, #6, #7, #24)
// ============================================================================

async function handleStudentVerify(e) {
  e.preventDefault();
  const firstName = document.getElementById('stFirstName').value.trim();
  const lastName = document.getElementById('stLastName').value.trim();
  const className = document.getElementById('stClassName').value.trim();
  const studentNo = document.getElementById('stStudentNo').value.trim();

  const alertEl = document.getElementById('studentVerifyAlert');
  const alreadyBox = document.getElementById('alreadySelectedBox');
  const btn = document.getElementById('btnVerifyStudent');

  alertEl.style.display = 'none';
  alreadyBox.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Doğrulanıyor...';

  try {
    const { ok, status, data } = await apiFetch('/api/student/verify', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, className, studentNo })
    });

    btn.disabled = false;
    btn.textContent = 'Devam Et ve Kulüpleri Listele →';

    if (status === 403 && data.periodClosed) {
      await loadPublicConfig();
      return;
    }

    if (!ok || !data.verified) {
      alertEl.className = 'alert-box alert-error';
      alertEl.innerHTML = `
        <span style="font-size:1.2rem;">❌</span>
        <div>${escapeHtml(
          data.message ||
            'Girmiş olduğunuz bilgiler sistemde kayıtlı öğrenci bilgileriyle eşleşmemektedir. Lütfen bilgilerinizi kontrol ediniz.'
        )}</div>
      `;
      alertEl.style.display = 'flex';
      return;
    }

    if (data.alreadySelected && data.selection) {
      alreadyBox.style.display = 'block';
      document.getElementById('alreadyStName').textContent =
        `${data.selection.firstName} ${data.selection.lastName}`;
      document.getElementById('alreadyStClassNo').textContent =
        `${data.selection.className} — No: ${data.selection.studentNo}`;
      const alreadyClubEl = document.getElementById('alreadyStClub');
      if (alreadyClubEl) {
        alreadyClubEl.textContent = 'Seçimi Başarıyla Tamamladınız';
      }
      document.getElementById('alreadyStDate').textContent = data.selection.dateFormatted || '-';
      showToast('Bu öğrenci için daha önce kulüp seçimi yapılmıştır.', 'warning');
      return;
    }

    state.verifiedStudent = data.student;
    state.availableClubs = data.clubs || [];
    state.selectedChoices = [];

    showToast('Öğrenciniz doğrulandı. Lütfen 1., 2. ve 3. tercih kulüplerinizi seçiniz.', 'success');

    document.getElementById('verifiedStudentSummary').textContent =
      `${state.verifiedStudent.firstName} ${state.verifiedStudent.lastName} — ${state.verifiedStudent.className} Sınıfı (No: ${state.verifiedStudent.studentNo})`;

    renderStudentChoiceSlots();
    renderStudentClubsGrid();

    document.getElementById('studentLoginStep').style.display = 'none';
    document.getElementById('studentClubSelectionStep').style.display = 'block';
    document.getElementById('studentSuccessStep').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Devam Et ve Kulüpleri Listele →';
    alertEl.className = 'alert-box alert-error';
    alertEl.textContent = 'Sunucu ile bağlantı kurulamadı. Lütfen tekrar deneyiniz.';
    alertEl.style.display = 'flex';
  }
}

// Öğrencinin 1., 2. ve 3. tercih kutularını render etme
function renderStudentChoiceSlots() {
  const container = document.getElementById('studentChoiceSlotsContainer');
  const confirmBtn = document.getElementById('btnOpen3ChoicesConfirm');
  if (!container) return;

  const count = state.selectedChoices.length;
  const selectableCount = (state.availableClubs || []).filter((c) => !c.isFull && c.available > 0).length;
  const requiredCount = Math.min(3, Math.max(1, selectableCount));

  if (confirmBtn) {
    confirmBtn.disabled = count < requiredCount;
    confirmBtn.textContent = `✓ Tercihlerimi Tamamladım (${count}/${requiredCount})`;
  }

  const slotConfigs = [
    { order: 1, title: '1. TERCİH KULÜBÜ', border: '#2563eb', bg: '#eff6ff', badgeBg: '#1d4ed8' },
    { order: 2, title: '2. TERCİH KULÜBÜ', border: '#0284c7', bg: '#f0f9ff', badgeBg: '#0369a1' },
    { order: 3, title: '3. TERCİH KULÜBÜ', border: '#7c3aed', bg: '#f5f3ff', badgeBg: '#6d28d9' }
  ];

  container.innerHTML = slotConfigs
    .map((slot, idx) => {
      const chosen = state.selectedChoices[idx];
      if (!chosen) {
        return `
          <div style="border: 2px dashed #cbd5e1; border-radius: 12px; padding: 0.9rem; background: #f8fafc; display:flex; flex-direction:column; justify-content:space-between; min-height: 92px;">
            <div style="font-size: 0.78rem; font-weight: 800; color: #475569; text-transform: uppercase;">
              ${slot.order}. TERCİH KULÜBÜ
            </div>
            <div style="color: #94a3b8; font-size: 0.85rem; font-weight: 600; margin-top: 0.35rem;">
              Henüz seçilmedi — Aşağıdaki listeden ${slot.order}. tercihinizi seçiniz
            </div>
          </div>
        `;
      }

      return `
        <div style="border: 2px solid ${slot.border}; border-radius: 12px; padding: 0.85rem; background: ${slot.bg}; display:flex; flex-direction:column; justify-content:space-between; min-height: 92px; box-shadow: 0 2px 6px rgba(15,23,42,0.06);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:0.4rem;">
            <span style="background:${slot.badgeBg}; color:#fff; font-size:0.74rem; font-weight:800; padding:0.18rem 0.55rem; border-radius:999px;">
              ${slot.order}. TERCİHİNİZ
            </span>
            <div style="display:flex; gap:0.25rem;">
              ${
                idx > 0
                  ? `<button type="button" class="btn btn-outline btn-sm" style="padding:0.15rem 0.45rem; font-size:0.75rem;" title="Üst Tercihe Taşı" onclick="moveStudentChoiceOrder(${idx}, -1)">↑</button>`
                  : ''
              }
              ${
                idx < state.selectedChoices.length - 1
                  ? `<button type="button" class="btn btn-outline btn-sm" style="padding:0.15rem 0.45rem; font-size:0.75rem;" title="Alt Tercihe Taşı" onclick="moveStudentChoiceOrder(${idx}, 1)">↓</button>`
                  : ''
              }
              <button type="button" class="btn btn-danger btn-sm" style="padding:0.15rem 0.45rem; font-size:0.75rem;" title="Tercihi Kaldır" onclick="removeStudentChoice(${idx})">✕</button>
            </div>
          </div>
          <div style="font-weight: 800; color: #0f172a; font-size: 0.96rem; margin-top: 0.45rem;">
            ${escapeHtml(chosen.name)}
          </div>
        </div>
      `;
    })
    .join('');
}

function toggleStudentClubChoice(clubId) {
  const existingIdx = state.selectedChoices.findIndex((c) => c.id === clubId);
  if (existingIdx !== -1) {
    state.selectedChoices.splice(existingIdx, 1);
    renderStudentChoiceSlots();
    renderStudentClubsGrid();
    return;
  }

  if (state.selectedChoices.length >= 3) {
    showToast('En fazla 3 kulüp tercihi yapabilirsiniz. Değiştirmek için üstteki kutudan bir tercihi çıkarınız.', 'warning');
    return;
  }

  const club = (state.availableClubs || []).find((c) => c.id === clubId);
  if (!club) return;

  if (club.isFull || club.available <= 0) {
    showToast('Bu kulübün kontenjanı dolmuştur.', 'error');
    return;
  }

  state.selectedChoices.push(club);
  const order = state.selectedChoices.length;
  showToast(`${club.name}, ${order}. tercih olarak eklendi.`, 'info');

  renderStudentChoiceSlots();
  renderStudentClubsGrid();
}

function removeStudentChoice(idx) {
  if (idx >= 0 && idx < state.selectedChoices.length) {
    state.selectedChoices.splice(idx, 1);
    renderStudentChoiceSlots();
    renderStudentClubsGrid();
  }
}

function moveStudentChoiceOrder(idx, direction) {
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= state.selectedChoices.length) return;
  const temp = state.selectedChoices[idx];
  state.selectedChoices[idx] = state.selectedChoices[targetIdx];
  state.selectedChoices[targetIdx] = temp;
  renderStudentChoiceSlots();
  renderStudentClubsGrid();
}

function renderStudentClubsGrid() {
  const grid = document.getElementById('studentClubsGrid');
  if (!grid) return;

  if (!state.availableClubs || state.availableClubs.length === 0) {
    grid.innerHTML = `
      <div class="panel-card" style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: #64748b;">
        Henüz aktif kulüp tanımlanmamıştır.
      </div>
    `;
    return;
  }

  grid.innerHTML = state.availableClubs
    .map((club) => {
      const percent = club.quota > 0 ? Math.min(100, Math.round((club.filled / club.quota) * 100)) : 100;
      const isFull = club.isFull || club.available <= 0;
      const choiceIdx = state.selectedChoices.findIndex((c) => c.id === club.id);
      const isChosen = choiceIdx !== -1;
      const nextOrder = state.selectedChoices.length + 1;

      return `
        <div class="club-card ${isFull && !isChosen ? 'club-full' : ''}" style="${isChosen ? 'border: 2.5px solid #2563eb; background: #f8fafc; box-shadow: 0 8px 20px rgba(37,99,235,0.14);' : ''}">
          <div class="club-card-top">
            <div class="club-card-title">
              <span>${escapeHtml(club.name)}</span>
              ${
                isChosen
                  ? `<span class="badge badge-primary" style="font-size:0.8rem;">⭐ ${choiceIdx + 1}. TERCİHİNİZ</span>`
                  : isFull
                  ? `<span class="badge badge-danger">DOLU</span>`
                  : `<span class="badge badge-success">${club.available} Boş</span>`
              }
            </div>
            ${
              club.teacher
                ? `<div class="club-teacher-tag">👨‍🏫 Danışman: ${escapeHtml(club.teacher)}</div>`
                : ''
            }
            <p class="club-card-desc">${escapeHtml(club.description || 'Öğrenci sosyal etkinlik kulübü çalışmaları.')}</p>
          </div>

          <div>
            <div class="club-quota-stats">
              <div class="quota-numbers-row">
                <div class="quota-item-box">
                  <span class="quota-label">Kontenjan</span>
                  <span class="quota-val">${club.quota}</span>
                </div>
                <div class="quota-item-box">
                  <span class="quota-label">Dolu</span>
                  <span class="quota-val">${club.filled}</span>
                </div>
                <div class="quota-item-box">
                  <span class="quota-label">Boş</span>
                  <span class="quota-val ${isFull ? 'text-danger' : 'text-success'}">${club.available}</span>
                </div>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill ${isFull ? 'fill-full' : ''}" style="width: ${percent}%;"></div>
              </div>
            </div>

            ${
              isChosen
                ? `<button type="button" class="btn btn-danger btn-club-select" onclick="toggleStudentClubChoice('${escapeHtml(club.id)}')">
                     ✕ ${choiceIdx + 1}. TERCİHTEN ÇIKAR
                   </button>`
                : isFull
                ? `<button type="button" class="btn btn-club-full" disabled>KONTENJAN DOLU</button>`
                : state.selectedChoices.length >= 3
                ? `<button type="button" class="btn btn-outline btn-club-select" disabled>3 TERCİH SEÇİLDİ</button>`
                : `<button type="button" class="btn btn-primary btn-club-select" onclick="toggleStudentClubChoice('${escapeHtml(club.id)}')">
                     + ${nextOrder}. TERCİH OLARAK SEÇ
                   </button>`
            }
          </div>
        </div>
      `;
    })
    .join('');
}

function openConfirmSelectionModal() {
  if (!state.verifiedStudent) return;
  const selectableCount = (state.availableClubs || []).filter((c) => !c.isFull && c.available > 0).length;
  const requiredCount = Math.min(3, Math.max(1, selectableCount));

  if (state.selectedChoices.length < requiredCount) {
    showToast(`Lütfen sırasıyla ${requiredCount} kulüp tercihinizi tamamlayınız.`, 'warning');
    return;
  }

  document.getElementById('confirmFullName').textContent =
    `${state.verifiedStudent.firstName} ${state.verifiedStudent.lastName}`;
  document.getElementById('confirmClass').textContent = state.verifiedStudent.className;
  document.getElementById('confirmStudentNo').textContent = state.verifiedStudent.studentNo;

  const listContainer = document.getElementById('confirmChoicesListContainer');
  if (listContainer) {
    listContainer.innerHTML = state.selectedChoices
      .map(
        (club, idx) => `
        <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1.5px solid #bfdbfe; border-radius:8px; padding:0.6rem 0.85rem;">
          <span style="font-weight:800; color:#1e40af; font-size:0.88rem;">${idx + 1}. Tercih:</span>
          <span style="font-weight:800; color:#0f172a; font-size:0.95rem;">${escapeHtml(club.name)}</span>
        </div>
      `
      )
      .join('');
  }

  document.getElementById('confirmSelectionModal').style.display = 'flex';
}

function closeConfirmSelectionModal() {
  document.getElementById('confirmSelectionModal').style.display = 'none';
}

async function submitConfirmedSelection() {
  if (!state.verifiedStudent || state.selectedChoices.length === 0) return;

  const btn = document.getElementById('btnFinalConfirmSelection');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor...';

  try {
    const clubIds = state.selectedChoices.map((c) => c.id);
    const { ok, data } = await apiFetch('/api/student/select', {
      method: 'POST',
      body: JSON.stringify({
        firstName: state.verifiedStudent.firstName,
        lastName: state.verifiedStudent.lastName,
        className: state.verifiedStudent.className,
        studentNo: state.verifiedStudent.studentNo,
        clubIds
      })
    });

    btn.disabled = false;
    btn.textContent = '✓ Seçimimi Onaylıyorum';
    closeConfirmSelectionModal();

    if (!ok || !data.success) {
      showToast(data.message || 'Seçim kaydedilemedi.', 'error');
      if (data.errorCode === 'ALREADY_SELECTED') {
        resetStudentFlow();
      }
      return;
    }

    const sel = data.selection;
    document.getElementById('successFullName').textContent = `${sel.firstName} ${sel.lastName}`;
    document.getElementById('successClass').textContent = sel.className;
    document.getElementById('successStudentNo').textContent = sel.studentNo;
    document.getElementById('successDate').textContent = sel.dateFormatted;

    document.getElementById('studentLoginStep').style.display = 'none';
    document.getElementById('studentClubSelectionStep').style.display = 'none';
    document.getElementById('studentSuccessStep').style.display = 'block';

    showToast('Seçimi başarıyla tamamladınız!', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '✓ Seçimimi Onaylıyorum';
    showToast('Kayıt sırasında bağlantı hatası oluştu.', 'error');
  }
}

function resetStudentFlow() {
  state.verifiedStudent = null;
  state.selectedChoices = [];
  state.pendingClubSelection = null;
  document.getElementById('studentVerifyForm').reset();
  document.getElementById('studentVerifyAlert').style.display = 'none';
  document.getElementById('alreadySelectedBox').style.display = 'none';
  document.getElementById('studentClubSelectionStep').style.display = 'none';
  document.getElementById('studentSuccessStep').style.display = 'none';
  document.getElementById('studentLoginStep').style.display = 'block';
  loadPublicConfig();
}

// ============================================================================
// 2. YÖNETİCİ GİRİŞİ VE CANLI SENKRONİZASYON (#8, #10)
// ============================================================================

async function handleAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('admUsername').value.trim();
  const password = document.getElementById('admPassword').value.trim();
  const alertEl = document.getElementById('adminLoginAlert');
  alertEl.style.display = 'none';

  const { ok, data } = await apiFetch('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  if (!ok || !data.success) {
    alertEl.className = 'alert-box alert-error';
    alertEl.textContent = data.message || 'Kullanıcı adı veya şifre hatalı!';
    alertEl.style.display = 'flex';
    return;
  }

  state.adminToken = data.token;
  state.isAdminLoggedIn = true;
  sessionStorage.setItem('kulup_admin_token', data.token);
  sessionStorage.setItem('kulup_admin_logged_in', 'true');

  showAdminAuthenticatedUI();
  await refreshAdminData();
  connectAdminSSE();
  showToast('Yönetici paneline hoş geldiniz.', 'success');
}

function showAdminAuthenticatedUI() {
  document.getElementById('adminLoginGate').style.display = 'none';
  document.getElementById('adminAuthenticatedLayout').style.display = 'flex';
  if (window.innerWidth <= 768) {
    document.getElementById('mobileMenuBtn').style.display = 'inline-flex';
  }
}

function handleAdminLogout() {
  state.isAdminLoggedIn = false;
  sessionStorage.removeItem('kulup_admin_logged_in');
  sessionStorage.removeItem('kulup_admin_token');
  if (state.sseConnection) {
    state.sseConnection.close();
    state.sseConnection = null;
  }
  switchMainMode('admin');
}

function connectAdminSSE() {
  if (state.sseConnection) {
    state.sseConnection.close();
  }
  try {
    const evtSource = new EventSource(`/api/admin/events?token=${encodeURIComponent(state.adminToken)}`);
    evtSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.network) {
          const prevTunnel = state.networkInfo?.publicTunnelUrl;
          state.networkInfo = { ...state.networkInfo, ...msg.network };
          if (msg.network.publicTunnelUrl && !prevTunnel) {
            state.selectedShareBaseUrl = msg.network.publicTunnelUrl;
          }
        }
        if (msg.dashboard) {
          state.dashboardData = msg.dashboard;
          renderAllAdminViews();
        }
        if (msg.type === 'NEW_STUDENT_SELECTION' && msg.payload?.selection) {
          const s = msg.payload.selection;
          showToast(
            `🔔 Yeni Tercih Havuzda: ${s.firstName} ${s.lastName} (${s.className}) — 3 tercihini tamamladı`,
            'success'
          );
        }
      } catch (e) {}
    };
    state.sseConnection = evtSource;
  } catch (err) {
    console.warn('SSE başlatılamadı:', err);
  }
}

async function refreshAdminData() {
  const { ok, status, data } = await apiFetch('/api/admin/dashboard');
  if (status === 401) {
    handleAdminLogout();
    return;
  }
  if (ok && data.success) {
    state.dashboardData = data;
    state.networkInfo = data.network;
    if (data.network?.publicTunnelUrl && (!state.selectedShareBaseUrl || state.selectedShareBaseUrl === window.location.origin)) {
      state.selectedShareBaseUrl = data.network.publicTunnelUrl;
    }
    renderAllAdminViews();
  }
}

function switchAdminTab(tabName) {
  state.activeAdminTab = tabName;
  document.querySelectorAll('.sidebar-link').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.admin-tab-section').forEach((sec) => {
    sec.style.display = sec.id === `tab-${tabName}` ? 'block' : 'none';
  });
  const sb = document.getElementById('adminSidebar');
  if (sb) sb.classList.remove('mobile-open');

  renderAllAdminViews();
}

// ============================================================================
// 3. YÖNETİCİ PANELİ GÖRÜNÜMLERİNİ RENDER ETME
// ============================================================================

function renderAllAdminViews() {
  const d = state.dashboardData;
  if (!d) return;

  if (d.settings) {
    document.getElementById('headerSchoolName').textContent = d.settings.schoolName;
    document.getElementById('headerAcademicYear').textContent = d.settings.academicYear;
  }

  document.getElementById('navBadgeStudents').textContent = d.stats.totalStudents;
  document.getElementById('navBadgeClubs').textContent = d.stats.totalClubs;
  document.getElementById('navBadgeUnselected').textContent = d.stats.unselectedCount;

  document.getElementById('statTotalStudents').textContent = d.stats.totalStudents;
  document.getElementById('statSelectedCount').textContent = d.stats.selectedCount;
  const pct =
    d.stats.totalStudents > 0
      ? Math.round((d.stats.selectedCount / d.stats.totalStudents) * 100)
      : 0;
  document.getElementById('statSelectedPercent').textContent = `%${pct} tamamlandı (${d.stats.pendingPoolCount || 0} havuzda bekliyor)`;
  document.getElementById('statUnselectedCount').textContent = d.stats.unselectedCount;
  document.getElementById('statTotalClubs').textContent = d.stats.totalClubs;
  document.getElementById('statQuotaSummary').textContent =
    `Toplam Kontenjan: ${d.stats.totalQuota} (Boş: ${d.stats.remainingQuota})`;

  const poolPendingBadge = document.getElementById('poolPendingBadge');
  if (poolPendingBadge) {
    poolPendingBadge.textContent = `⏳ Havuzda Dağıtım Bekleyen: ${d.stats.pendingPoolCount || 0} Öğrenci`;
  }
  const poolDistributedBadge = document.getElementById('poolDistributedBadge');
  if (poolDistributedBadge) {
    poolDistributedBadge.textContent = `✓ Yerleştirilen: ${d.stats.distributedCount || 0} Öğrenci`;
  }
  const poolBreakdownBadge = document.getElementById('poolBreakdownBadge');
  if (poolBreakdownBadge) {
    poolBreakdownBadge.textContent = `1. Tercih: ${d.stats.placedIn1st || 0} | 2. Tercih: ${d.stats.placedIn2nd || 0} | 3. Tercih: ${d.stats.placedIn3rd || 0}`;
  }

  const statusBadge = document.getElementById('electionStatusBadge');
  if (d.electionPeriod?.active) {
    statusBadge.className = 'badge badge-success';
    statusBadge.textContent = `Seçim Süreci Aktif (${d.electionPeriod.endFormatted || ''}'e kadar)`;
  } else {
    statusBadge.className = 'badge badge-danger';
    statusBadge.textContent = 'Seçim Süreci Kapalı / Süresi Doldu';
  }

  renderShareLinkAndQrSection();
  renderDashboardCharts();
  renderDashboardRecentTable();
  populateAdminFilterDropdowns();
  renderStudentsManageTable();
  renderAdminClubsSection();
  renderClassBasedReportSection();
  renderUnselectedStudentsTab();
  renderActiveSystemReport();
  renderExportsCenterTab();
  renderRegisteredStudentsUploadTab();
  populateSettingsForm();
}

// ============================================================================
// LINK PAYLAŞIMI VE QR KOD (#17, #18)
// ============================================================================
function isBrandDisplayValue(val, slug) {
  const lower = String(val || '').trim().toLowerCase().replace(/\/+$/, '');
  return (
    lower === slug ||
    lower === `https://${slug}` ||
    lower === `http://${slug}` ||
    lower === `https://www.${slug}.net` ||
    lower === `http://www.${slug}.net` ||
    lower === `https://${slug}.net`
  );
}

function buildStudentShareUrl(baseOrFullUrl) {
  if (!baseOrFullUrl) return '';
  const cleaned = String(baseOrFullUrl).replace(/\/+$/, '');
  const slug = state.networkInfo?.schoolSlug || 'balikesirbahcesehirkoleji';
  if (isBrandDisplayValue(cleaned, slug)) return `https://${slug}`;
  if (cleaned.toLowerCase().endsWith(`/${slug}`)) return cleaned;
  return `${cleaned}/${slug}`;
}

// Görünür ad sadece "balikesirbahcesehirkoleji" dir; gerçekte açılan çalışan bağlantı sunucudan gelir
function getActualWorkingShareUrl() {
  const net = state.networkInfo || {};
  const slug = net.schoolSlug || 'balikesirbahcesehirkoleji';
  const rawTunnelWithSlug = net.rawTunnelUrl ? `${net.rawTunnelUrl.replace(/\/+$/, '')}/${slug}` : '';
  const workingUrl = net.workingShareUrl || rawTunnelWithSlug || `${window.location.origin}/${slug}`;
  const currentVal = document.getElementById('studentShareLinkInput')?.value || state.selectedShareBaseUrl || '';
  if (!currentVal || isBrandDisplayValue(currentVal, slug)) return workingUrl;
  return currentVal;
}

function renderShareLinkAndQrSection() {
  const net = state.networkInfo || {};
  const slug = net.schoolSlug || 'balikesirbahcesehirkoleji';
  const selectorContainer = document.getElementById('networkUrlSelector');
  const tunnelBanner = document.getElementById('tunnelStatusBanner');
  const tunnelText = document.getElementById('tunnelStatusText');

  const visibleBrandedLink = `https://${slug}`;
  const rawTunnelWithSlug = net.rawTunnelUrl ? `${net.rawTunnelUrl.replace(/\/+$/, '')}/${slug}` : '';
  const actualWorkingUrl = net.workingShareUrl || rawTunnelWithSlug || `${window.location.origin}/${slug}`;

  if (tunnelBanner && tunnelText) {
    if (net.isTunnelActive || rawTunnelWithSlug) {
      tunnelBanner.className = 'alert-box alert-success';
      tunnelText.innerHTML = `
        <div>
          <strong>🏫 Kurumsal Veli / Öğrenci Bağlantısı Aktif!</strong><br/>
          Görünür Kurumsal Adres:
          <a href="${escapeHtml(actualWorkingUrl)}" target="_blank" style="color:#15803d; font-weight:800; text-decoration:underline; margin-left:4px;">
            ${escapeHtml(visibleBrandedLink)}
          </a>
          <div style="font-size:0.78rem; color:#166534; margin-top:3px;">
            🔒 Arka planda canlı tünel bağlantısı üzerinden doğrudan öğrenci kulüp seçim ekranı açılır.
          </div>
        </div>
      `;
    } else if (net.tunnelStatus === 'STARTING') {
      tunnelBanner.className = 'alert-box alert-info';
      tunnelText.innerHTML = `<strong>Okul dışı kurumsal canlı internet bağlantısı hazırlanıyor...</strong> Birkaç saniye içinde otomatik olarak aktif olacaktır.`;
    } else {
      tunnelBanner.className = 'alert-box alert-warning';
      tunnelText.innerHTML = `
        Okul dışı canlı bağlantı henüz oluşturulmadı. Sağdaki <strong>"🔄 Canlı İnternet Linkini Yenile"</strong> butonuna tıklayarak hemen aktif edebilirsiniz.
      `;
    }
  }

  const urls = [
    { label: `🏫 Kurumsal Bağlantı (${visibleBrandedLink})`, url: visibleBrandedLink }
  ];
  if (rawTunnelWithSlug) {
    urls.push({ label: '🌐 Arka Plan Canlı Tünel Linki', url: rawTunnelWithSlug });
  }
  if (Array.isArray(net.lanUrls) && net.lanUrls.length > 0) {
    net.lanUrls.forEach((u) => {
      urls.push({ label: `📶 Okul İçi Wi-Fi (${u.replace('http://', '')})`, url: buildStudentShareUrl(u) });
    });
  }
  urls.push({ label: '💻 Bu Bilgisayar', url: buildStudentShareUrl(window.location.origin) });

  const availableUrlStrings = urls.map((u) => u.url);
  if (!state.selectedShareBaseUrl || !availableUrlStrings.includes(state.selectedShareBaseUrl)) {
    state.selectedShareBaseUrl = urls[0].url;
  }

  if (selectorContainer) {
    selectorContainer.innerHTML = urls
      .map(
        (item) => `
        <button
          type="button"
          class="btn btn-sm ${state.selectedShareBaseUrl === item.url ? 'btn-primary' : 'btn-outline'}"
          onclick="selectShareBaseUrl('${escapeHtml(item.url)}')"
        >
          ${escapeHtml(item.label)}
        </button>
      `
      )
      .join('');
  }

  const fullShareUrl = buildStudentShareUrl(state.selectedShareBaseUrl);
  const linkInput = document.getElementById('studentShareLinkInput');
  if (linkInput) {
    linkInput.value = fullShareUrl;
    linkInput.oncopy = (e) => {
      e.preventDefault();
      copyStudentShareLink();
    };
  }

  syncSmsEditorWithCurrentLink(fullShareUrl, false);

  const qrTargetUrl = getActualWorkingShareUrl();
  const qrImg = document.getElementById('studentQrImage');
  if (qrImg) {
    qrImg.src = `/api/admin/qrcode?url=${encodeURIComponent(qrTargetUrl)}&token=${encodeURIComponent(state.adminToken)}`;
  }
}

const DEFAULT_SMS_ANNOUNCEMENT_TEMPLATE =
  '{OKUL_ADI}: Değerli velimiz ve öğrencimiz, öğrenci kulüp seçiminizi aşağıdaki resmi okul bağlantısına tıklayarak gerçekleştirebilirsiniz: {LINK}';

function formatSelectionDeadlineTr(isoStr) {
  if (!isoStr) return '30.10.2026 23:59';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function resolveSmsTemplateText(templateStr, linkUrl) {
  const school = state.dashboardData?.settings?.schoolName || 'Özel Balıkesir Bahçeşehir Koleji';
  const deadline = formatSelectionDeadlineTr(state.dashboardData?.settings?.selectionEnd);
  const activeLink = linkUrl || document.getElementById('studentShareLinkInput')?.value || '';

  return String(templateStr || DEFAULT_SMS_ANNOUNCEMENT_TEMPLATE)
    .replace(/\{OKUL_ADI\}/gi, school)
    .replace(/\{LINK\}/gi, activeLink)
    .replace(/\{SON_TARIH\}/gi, deadline);
}

function convertEditorTextToTemplate(editorText) {
  let tpl = String(editorText || '').trim();
  if (!tpl) return DEFAULT_SMS_ANNOUNCEMENT_TEMPLATE;

  const currentLink = document.getElementById('studentShareLinkInput')?.value || '';
  if (currentLink && tpl.includes(currentLink)) {
    tpl = tpl.split(currentLink).join('{LINK}');
  } else if (state.lastInjectedShareUrl && tpl.includes(state.lastInjectedShareUrl)) {
    tpl = tpl.split(state.lastInjectedShareUrl).join('{LINK}');
  }
  return tpl;
}

function syncSmsEditorWithCurrentLink(newLinkUrl, forceReloadFromSaved = false) {
  const editor = document.getElementById('smsAnnouncementEditor');
  if (!editor) return;

  const savedTemplate =
    state.dashboardData?.settings?.smsAnnouncementTemplate || DEFAULT_SMS_ANNOUNCEMENT_TEMPLATE;

  if (!state.smsEditorInitialized || forceReloadFromSaved) {
    editor.value = resolveSmsTemplateText(savedTemplate, newLinkUrl);
    state.lastInjectedShareUrl = newLinkUrl;
    state.smsEditorInitialized = true;
    state.smsEditorDirty = false;
    setSmsSavedBadgeState(true);
  } else if (newLinkUrl && state.lastInjectedShareUrl && newLinkUrl !== state.lastInjectedShareUrl) {
    // Kullanıcı bağlantı türünü değiştirdiğinde metin içerisindeki eski linki yeni linkle güncelle
    if (editor.value.includes(state.lastInjectedShareUrl)) {
      editor.value = editor.value.split(state.lastInjectedShareUrl).join(newLinkUrl);
    } else if (editor.value.includes('{LINK}')) {
      editor.value = editor.value.split('{LINK}').join(newLinkUrl);
    }
    state.lastInjectedShareUrl = newLinkUrl;
  }

  updateSmsCharCounter();
}

function setSmsSavedBadgeState(isSaved) {
  const badge = document.getElementById('smsSavedStatusBadge');
  if (!badge) return;
  if (isSaved) {
    badge.className = 'badge badge-success';
    badge.textContent = '✓ Kayıtlı Metin';
  } else {
    badge.className = 'badge badge-warning';
    badge.textContent = '✏️ Düzenlendi';
  }
}

// Metindeki görünür adı (balikesirbahcesehirkoleji) tıklanabilir, gizli hedefli bir bağlantıya çevirir
function buildRichAnnouncementHtml() {
  const slug = state.networkInfo?.schoolSlug || 'balikesirbahcesehirkoleji';
  const href = escapeHtml(getActualWorkingShareUrl());
  const safeText = escapeHtml(getFinalSmsAnnouncementText()).replace(/\r?\n/g, '<br>');
  const pattern = new RegExp(
    `(?<![\\w./-])(?:https?:\\/\\/)?(?:www\\.)?${slug}(?:\\.net)?(?![\\w.-])`,
    'gi'
  );
  return safeText.replace(
    pattern,
    () => `<a href="${href}" target="_blank" rel="noopener" style="color:#1d4ed8; font-weight:700;">https://${slug}</a>`
  );
}

function renderRichAnnouncementPreview() {
  const box = document.getElementById('richAnnouncementPreview');
  if (box) box.innerHTML = buildRichAnnouncementHtml();
}

async function copyRichAnnouncement() {
  if (state.smsEditorDirty) {
    saveSmsAnnouncementTemplate(true);
  }
  const html = buildRichAnnouncementHtml();
  const plain = getFinalSmsAnnouncementText();
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        })
      ]);
    } else {
      await navigator.clipboard.writeText(plain);
    }
    showToast('Mesaj kopyalandı. E-posta/Word içine yapıştırınca sadece "balikesirbahcesehirkoleji" görünür, tıklanınca doğru bağlantı açılır.', 'success');
  } catch (e) {
    await navigator.clipboard.writeText(plain);
    showToast('Tarayıcı zengin metni desteklemedi; düz metin (çalışan bağlantıyla) kopyalandı.', 'warning');
  }
}

function updateSmsCharCounter() {
  renderRichAnnouncementPreview();
  const editor = document.getElementById('smsAnnouncementEditor');
  const counterBadge = document.getElementById('smsCharCountBadge');
  if (!editor || !counterBadge) return;

  const text = getFinalSmsAnnouncementText();
  const len = text.length;
  const smsParts = Math.max(1, Math.ceil(len / 155));
  counterBadge.textContent = `${len} Karakter • ${smsParts} SMS`;
}

function handleSmsEditorInput() {
  state.smsEditorDirty = true;
  setSmsSavedBadgeState(false);
  updateSmsCharCounter();
}

function getFinalSmsAnnouncementText() {
  const editor = document.getElementById('smsAnnouncementEditor');
  const link = document.getElementById('studentShareLinkInput')?.value || '';
  if (editor && editor.value.trim()) {
    return resolveSmsTemplateText(editor.value.trim(), link);
  }
  const savedTemplate =
    state.dashboardData?.settings?.smsAnnouncementTemplate || DEFAULT_SMS_ANNOUNCEMENT_TEMPLATE;
  return resolveSmsTemplateText(savedTemplate, link);
}

function applySmsPreset(presetType) {
  const editor = document.getElementById('smsAnnouncementEditor');
  if (!editor) return;

  const link = document.getElementById('studentShareLinkInput')?.value || '';
  let presetTemplate = DEFAULT_SMS_ANNOUNCEMENT_TEMPLATE;

  if (presetType === 'short') {
    presetTemplate =
      '{OKUL_ADI}: Değerli velimiz, öğrenci kulüp seçiminizi aşağıdaki resmi okul bağlantısından yapabilirsiniz: {LINK}';
  } else if (presetType === 'official') {
    presetTemplate =
      'Sayın Velimiz ve Sevgili Öğrencimiz,\n{OKUL_ADI} öğrenci kulüp seçimleri başlamıştır. Son seçim tarihi {SON_TARIH} olup, aşağıdaki resmi okul bağlantısına tıklayarak 1., 2. ve 3. kulüp tercihlerinizi gerçekleştirebilirsiniz:\n{LINK}';
  } else if (presetType === 'whatsapp') {
    presetTemplate =
      '🏫 *{OKUL_ADI} - Öğrenci Kulüp Seçim Sistemi*\n\nDeğerli Velilerimiz ve Öğrencilerimiz,\nKulüp seçim ekranımız açılmıştır. Telefon, tablet veya bilgisayarınızdan aşağıdaki resmi okul bağlantısına tıklayarak kulüp tercihlerinizi yapabilirsiniz:\n\n👉 {LINK}';
  }

  editor.value = resolveSmsTemplateText(presetTemplate, link);
  state.lastInjectedShareUrl = link;
  state.smsEditorDirty = true;
  setSmsSavedBadgeState(false);
  updateSmsCharCounter();
  editor.focus();
  showToast('Şablon metin kutusuna uygulandı. Dilediğiniz gibi düzenleyebilirsiniz.', 'info');
}

function insertIntoSmsEditor(tokenType) {
  const editor = document.getElementById('smsAnnouncementEditor');
  if (!editor) return;

  const link = document.getElementById('studentShareLinkInput')?.value || '';
  const school = state.dashboardData?.settings?.schoolName || 'Özel Balıkesir Bahçeşehir Koleji';
  const deadline = formatSelectionDeadlineTr(state.dashboardData?.settings?.selectionEnd);

  let insertVal = '';
  if (tokenType === 'LINK') insertVal = link;
  else if (tokenType === 'SCHOOL') insertVal = school;
  else if (tokenType === 'DEADLINE') insertVal = deadline;

  const start = editor.selectionStart ?? editor.value.length;
  const end = editor.selectionEnd ?? editor.value.length;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  const prefix = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const suffix = after.length > 0 && !/^\s/.test(after) ? ' ' : '';

  editor.value = `${before}${prefix}${insertVal}${suffix}${after}`;
  state.smsEditorDirty = true;
  setSmsSavedBadgeState(false);
  updateSmsCharCounter();
  editor.focus();
}

async function saveSmsAnnouncementTemplate(silent = false) {
  const editor = document.getElementById('smsAnnouncementEditor');
  if (!editor) return;

  const rawText = editor.value.trim();
  if (!rawText) {
    if (!silent) showToast('Duyuru metni boş bırakılamaz.', 'warning');
    return;
  }

  const smsAnnouncementTemplate = convertEditorTextToTemplate(rawText);
  const { ok, data } = await apiFetch('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ smsAnnouncementTemplate })
  });

  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    state.smsEditorDirty = false;
    setSmsSavedBadgeState(true);
    const setTplInput = document.getElementById('setSmsAnnouncementTemplate');
    if (setTplInput) {
      setTplInput.value = smsAnnouncementTemplate;
    }
    if (!silent) {
      showToast('Düzenlediğiniz SMS / Duyuru metni başarıyla kaydedildi!', 'success');
    }
  } else if (!silent) {
    showToast(data.message || 'Duyuru metni kaydedilemedi.', 'error');
  }
}

async function resetSmsAnnouncementTemplate() {
  const link = document.getElementById('studentShareLinkInput')?.value || '';
  const editor = document.getElementById('smsAnnouncementEditor');
  if (editor) {
    editor.value = resolveSmsTemplateText(DEFAULT_SMS_ANNOUNCEMENT_TEMPLATE, link);
    state.lastInjectedShareUrl = link;
  }
  await saveSmsAnnouncementTemplate(true);
  updateSmsCharCounter();
  showToast('Varsayılan SMS / Duyuru metnine sıfırlandı.', 'info');
}

function selectShareBaseUrl(url) {
  state.selectedShareBaseUrl = url;
  renderShareLinkAndQrSection();
}

function getRunnableSmsAnnouncementText() {
  const rawSms = getFinalSmsAnnouncementText();
  const slug = state.networkInfo?.schoolSlug || 'balikesirbahcesehirkoleji';
  const actualUrl = getActualWorkingShareUrl();
  if (!actualUrl) return rawSms;

  // Metindeki görünür ad (balikesirbahcesehirkoleji) gönderim sırasında çalışan canlı bağlantıyla değiştirilir
  const pattern = new RegExp(
    `(?<![\\w./-])(?:https?:\\/\\/)?(?:www\\.)?${slug}(?:\\.net)?(?![\\w.-])`,
    'gi'
  );
  return rawSms.replace(pattern, () => actualUrl);
}

async function copyStudentShareLink() {
  const input = document.getElementById('studentShareLinkInput');
  if (!input) return;
  const visibleUrl = input.value;
  const actualUrl = getActualWorkingShareUrl();
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      const htmlContent = `<a href="${escapeHtml(actualUrl)}">${escapeHtml(visibleUrl)}</a>`;
      const item = new ClipboardItem({
        'text/plain': new Blob([actualUrl], { type: 'text/plain' }),
        'text/html': new Blob([htmlContent], { type: 'text/html' })
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(actualUrl);
    }
  } catch (e) {
    await navigator.clipboard.writeText(actualUrl);
  }
  showToast('Canlı öğrenci kulüp seçim bağlantısı panoya kopyalandı!', 'success');
}

function shareViaWhatsApp() {
  if (state.smsEditorDirty) {
    saveSmsAnnouncementTemplate(true);
  }
  const text = getFinalSmsAnnouncementText();
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function shareViaEmail() {
  if (state.smsEditorDirty) {
    saveSmsAnnouncementTemplate(true);
  }
  const school = state.dashboardData?.settings?.schoolName || 'Okul Yönetimi';
  const subject = `${school} - Online Öğrenci Kulüp Seçim Linki`;
  const body = getFinalSmsAnnouncementText();
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function copySmsTemplate() {
  if (state.smsEditorDirty) {
    saveSmsAnnouncementTemplate(true);
  }
  const displaySms = getFinalSmsAnnouncementText();
  const runnableSms = displaySms;
  const visibleUrl = document.getElementById('studentShareLinkInput')?.value || 'https://balikesirbahcesehirkoleji';
  const actualUrl = getActualWorkingShareUrl();

  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      const htmlSms = escapeHtml(displaySms).replace(
        escapeHtml(visibleUrl),
        `<a href="${escapeHtml(actualUrl)}">${escapeHtml(visibleUrl)}</a>`
      );
      const item = new ClipboardItem({
        'text/plain': new Blob([runnableSms], { type: 'text/plain' }),
        'text/html': new Blob([htmlSms], { type: 'text/html' })
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(runnableSms);
    }
  } catch (e) {
    await navigator.clipboard.writeText(runnableSms);
  }
  showToast('Düzenlenen SMS / Duyuru metni (aktif canlı bağlantıyla) panoya kopyalandı!', 'success');
}

function openStudentPreviewInNewTab() {
  const actualUrl = getActualWorkingShareUrl();
  window.open(actualUrl, '_blank');
}

function downloadStudentQrCode() {
  const actualUrl = getActualWorkingShareUrl();
  const downloadUrl = `/api/admin/qrcode?url=${encodeURIComponent(actualUrl)}&download=1&token=${encodeURIComponent(state.adminToken)}`;
  window.open(downloadUrl, '_blank');
}

async function startPublicInternetTunnel(forceRestart = true) {
  const btn = document.getElementById('btnStartPublicTunnel');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '🌐 Canlı İnternet Linki Oluşturuluyor...';
  }
  const { ok, data } = await apiFetch('/api/admin/tunnel/start', {
    method: 'POST',
    body: JSON.stringify({ restart: Boolean(forceRestart) })
  });
  if (btn) {
    btn.disabled = false;
    btn.textContent = '🔄 Canlı İnternet Linkini Yenile';
  }
  if (ok && data.publicTunnelUrl) {
    state.selectedShareBaseUrl = data.publicTunnelUrl;
    await refreshAdminData();
    showToast('Okul dışı erişim için canlı internet bağlantısı hazır!', 'success');
  } else {
    showToast(data.message || 'Canlı tünel başlatılamadı.', 'error');
  }
}

// ============================================================================
// DASHBOARD GRAFİKLERİ (#29)
// ============================================================================
function renderDashboardCharts() {
  const clubs = state.dashboardData?.clubs || [];
  const labels = clubs.map((c) => c.name.replace(' KULÜBÜ', ''));
  const filledData = clubs.map((c) => c.filled);
  const quotaData = clubs.map((c) => c.quota);

  const palette = [
    '#2563eb',
    '#16a34a',
    '#d97706',
    '#9333ea',
    '#0284c7',
    '#dc2626',
    '#0d9488',
    '#4f46e5',
    '#db2777',
    '#65a30d'
  ];

  if (typeof Chart === 'undefined') return;

  const barCtx = document.getElementById('clubBarChart');
  if (barCtx) {
    if (state.barChartInstance) state.barChartInstance.destroy();
    state.barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Seçen Öğrenci Sayısı (Dolu)',
            data: filledData,
            backgroundColor: '#2563eb',
            borderRadius: 6
          },
          {
            label: 'Kulüp Kontenjanı',
            data: quotaData,
            backgroundColor: '#cbd5e1',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }

  const pieCtx = document.getElementById('clubPieChart');
  if (pieCtx) {
    if (state.pieChartInstance) state.pieChartInstance.destroy();
    state.pieChartInstance = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: filledData,
            backgroundColor: labels.map((_, i) => palette[i % palette.length]),
            borderWidth: 2,
            borderColor: '#ffffff'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' }
        }
      }
    });
  }
}

// ============================================================================
// ANLIK ÖĞRENCİ SEÇİM LİSTESİ VE HAVUZ ATAMA YARDIMCILARI (#10)
// ============================================================================
function formatStudentChoicesHtml(s) {
  const hasChoices = Array.isArray(s?.choiceNames) && s.choiceNames.length > 0;
  if (!s || (!s.hasSelected && !s.clubId && !hasChoices)) {
    return `<span style="color:#94a3b8; font-size:0.82rem;">Tercih Yok</span>`;
  }
  const names = hasChoices ? s.choiceNames : [s.clubName || '-'];
  return `
    <div style="display:flex; flex-direction:column; gap:2px; font-size:0.78rem; line-height:1.3;">
      <div><strong style="color:#1d4ed8;">1.</strong> ${escapeHtml((names[0] || '-').replace(' KULÜBÜ', ''))}</div>
      ${names[1] ? `<div><strong style="color:#0369a1;">2.</strong> ${escapeHtml(names[1].replace(' KULÜBÜ', ''))}</div>` : ''}
      ${names[2] ? `<div><strong style="color:#6d28d9;">3.</strong> ${escapeHtml(names[2].replace(' KULÜBÜ', ''))}</div>` : ''}
    </div>
  `;
}

function formatPlacementBadgeHtml(s) {
  if (!s || (!s.hasSelected && !s.clubId && !(Array.isArray(s.choices) && s.choices.length > 0))) {
    return `<span class="badge badge-warning">Seçim Yapmadı</span>`;
  }
  if (s.placementStatus === 'PENDING' || !s.clubId) {
    return `<span class="badge badge-warning" title="Otomatik Dağıtma butonuna basılması bekleniyor">⏳ Havuzda (Dağıtım Bekliyor)</span>`;
  }
  const reason = s.placementReason || '';
  if (s.isManualAssignment) {
    return `<span class="badge badge-info" title="${escapeHtml(reason)}">👤 Yönetici Ataması</span>`;
  }
  const order = s.assignedChoiceOrder || 1;
  if (order === 1) {
    return `<span class="badge badge-success" title="${escapeHtml(reason)}">✓ 1. Tercihine Yerleşti</span>`;
  }
  if (order === 2) {
    return `<span class="badge badge-warning" title="${escapeHtml(reason)}">↪ 2. Tercihe Atandı (1. <=3)</span>`;
  }
  return `<span class="badge badge-danger" title="${escapeHtml(reason)}">↪ 3. Tercihe Kaydedildi (1.&2. <=3)</span>`;
}

async function handleRecalculatePool(clearManualOverrides = false) {
  const { ok, data } = await apiFetch('/api/admin/pool/recalculate', {
    method: 'POST',
    body: JSON.stringify({ clearManualOverrides: Boolean(clearManualOverrides) })
  });
  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'success');
  } else {
    showToast(data.message || 'Otomatik dağıtma işlemi yapılamadı.', 'error');
  }
}

async function handleResetPoolToPending() {
  if (!confirm('Mevcut kulüp yerleştirmelerini geri alıp tüm öğrencileri 3 tercihleriyle birlikte "Havuzda Dağıtım Bekliyor" durumuna çekmek istediğinize emin misiniz?')) {
    return;
  }
  const { ok, data } = await apiFetch('/api/admin/pool/reset-to-pending', {
    method: 'POST'
  });
  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'info');
  } else {
    showToast(data.message || 'İşlem başarısız oldu.', 'error');
  }
}

function renderDashboardRecentTable() {
  const tbody = document.getElementById('dashboardLiveSelectionsBody');
  if (!tbody || !state.dashboardData) return;

  const q = (document.getElementById('quickDashboardSearch')?.value || '')
    .trim()
    .toLocaleUpperCase('tr-TR');

  let list = state.dashboardData.selections || [];
  if (q) {
    list = list.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.className} ${s.studentNo} ${s.clubName || ''} ${(s.choiceNames || []).join(' ')}`
        .toLocaleUpperCase('tr-TR')
        .includes(q)
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#64748b; padding:1.5rem;">Kayıt bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((s, idx) => {
      const isPlaced = !!(s.clubId && s.placementStatus !== 'PENDING');
      return `
      <tr>
        <td><strong>${idx + 1}</strong></td>
        <td><strong>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</strong></td>
        <td><span class="badge badge-gray">${escapeHtml(s.className)}</span></td>
        <td><strong>${escapeHtml(s.studentNo)}</strong></td>
        <td>${formatStudentChoicesHtml({ ...s, hasSelected: true })}</td>
        <td>
          ${
            isPlaced
              ? `<span class="badge badge-primary">${escapeHtml(s.clubName)}</span>`
              : `<span class="badge badge-warning">⏳ Havuzda Bekliyor</span>`
          }
        </td>
        <td>${formatPlacementBadgeHtml({ ...s, hasSelected: true })}</td>
        <td>${escapeHtml(s.dateFormatted)}</td>
        <td style="white-space:nowrap;">
          <button
            class="btn btn-outline btn-sm"
            onclick="openChangeStudentClubModal('${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName)}', '${escapeHtml(s.lastName)}', '${escapeHtml(s.clubName || 'Havuzda Bekliyor')}', '${escapeHtml(s.clubId || '')}')"
          >
            ✏️ Kulüp Değiştir
          </button>
          <button
            class="btn btn-danger btn-sm"
            onclick="handleDeleteStudentRecord('', '${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName + ' ' + s.lastName)}')"
            title="Öğrenciyi Sil"
          >
            🗑️ Öğrenciyi Sil
          </button>
        </td>
      </tr>
    `;
    })
    .join('');
}

// ============================================================================
// ÖĞRENCİLER SEKMESİ, ARAMA VE ÖĞRENCİ SİLME İŞLEMLERİ (#10, #11, #26)
// ============================================================================
function populateAdminFilterDropdowns() {
  const d = state.dashboardData;
  if (!d) return;

  const classSelect = document.getElementById('filterStudentClass');
  if (classSelect) {
    const val = classSelect.value;
    classSelect.innerHTML =
      `<option value="">Tüm Sınıflar</option>` +
      d.classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    classSelect.value = val;
  }

  const clubSelect = document.getElementById('filterStudentClub');
  if (clubSelect) {
    const val = clubSelect.value;
    clubSelect.innerHTML =
      `<option value="">Tüm Kulüpler</option>` +
      d.clubs.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    clubSelect.value = val;
  }

  const unselClassFilter = document.getElementById('unselectedClassFilter');
  if (unselClassFilter) {
    const val = unselClassFilter.value;
    unselClassFilter.innerHTML =
      `<option value="">Tüm Sınıflar</option>` +
      d.classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    unselClassFilter.value = val;
  }
}

function resetStudentFilters() {
  document.getElementById('filterStudentSearch').value = '';
  document.getElementById('filterStudentClass').value = '';
  document.getElementById('filterStudentClub').value = '';
  document.getElementById('filterStudentStatus').value = '';
  renderStudentsManageTable();
}

function updateBulkDeleteStudentsButton() {
  const btn = document.getElementById('btnBulkDeleteStudents');
  const countSpan = document.getElementById('selectedStudentsCountSpan');
  if (!btn || !countSpan) return;
  const count = state.selectedStudentKeys.size;
  countSpan.textContent = count;
  btn.style.display = count > 0 ? 'inline-flex' : 'none';
}

function toggleStudentRowCheckbox(key, checked) {
  if (checked) {
    state.selectedStudentKeys.add(key);
  } else {
    state.selectedStudentKeys.delete(key);
  }
  updateBulkDeleteStudentsButton();
}

function toggleSelectAllStudents(checked) {
  const checkboxes = document.querySelectorAll('.student-row-chk');
  checkboxes.forEach((chk) => {
    chk.checked = checked;
    const key = chk.dataset.key;
    if (key) {
      if (checked) state.selectedStudentKeys.add(key);
      else state.selectedStudentKeys.delete(key);
    }
  });
  updateBulkDeleteStudentsButton();
}

function renderStudentsManageTable() {
  const tbody = document.getElementById('studentsManageTableBody');
  if (!tbody || !state.dashboardData) return;

  const q = (document.getElementById('filterStudentSearch')?.value || '')
    .trim()
    .toLocaleUpperCase('tr-TR');
  const cls = document.getElementById('filterStudentClass')?.value || '';
  const clubId = document.getElementById('filterStudentClub')?.value || '';
  const status = document.getElementById('filterStudentStatus')?.value || '';

  let list = state.dashboardData.allStudents || [];

  if (q) {
    list = list.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.className} ${s.studentNo} ${s.clubName || ''} ${(s.choiceNames || []).join(' ')}`
        .toLocaleUpperCase('tr-TR')
        .includes(q)
    );
  }
  if (cls) {
    list = list.filter((s) => s.className === cls);
  }
  if (clubId) {
    list = list.filter((s) => s.clubId === clubId);
  }
  if (status === 'selected') {
    list = list.filter((s) => s.hasSelected);
  } else if (status === 'pending') {
    list = list.filter((s) => s.hasSelected && !s.isPlaced);
  } else if (status === 'unselected') {
    list = list.filter((s) => !s.hasSelected);
  } else if (status === 'choice1') {
    list = list.filter((s) => s.isPlaced && (s.assignedChoiceOrder || 1) === 1);
  } else if (status === 'choice2') {
    list = list.filter((s) => s.isPlaced && s.assignedChoiceOrder === 2);
  } else if (status === 'choice3') {
    list = list.filter((s) => s.isPlaced && s.assignedChoiceOrder === 3);
  }

  updateBulkDeleteStudentsButton();

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#64748b;">Arama kriterlerine uygun öğrenci bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((s, idx) => {
      const key = `${s.className}_${s.studentNo}`;
      const isChecked = state.selectedStudentKeys.has(key);
      return `
      <tr>
        <td>
          <input
            type="checkbox"
            class="student-row-chk"
            data-key="${escapeHtml(key)}"
            ${isChecked ? 'checked' : ''}
            onchange="toggleStudentRowCheckbox('${escapeHtml(key)}', this.checked)"
          />
        </td>
        <td><strong>${idx + 1}</strong></td>
        <td><strong>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</strong></td>
        <td><span class="badge badge-gray">${escapeHtml(s.className)}</span></td>
        <td><strong>${escapeHtml(s.studentNo)}</strong></td>
        <td>${formatStudentChoicesHtml(s)}</td>
        <td>
          ${
            s.isPlaced
              ? `<span class="badge badge-primary">${escapeHtml(s.clubName)}</span>`
              : s.hasSelected
              ? `<span class="badge badge-warning">⏳ Havuzda Bekliyor</span>`
              : `<span class="badge badge-gray">Henüz Seçmedi</span>`
          }
        </td>
        <td>${formatPlacementBadgeHtml(s)}</td>
        <td>${escapeHtml(s.dateFormatted || '-')}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button
            class="btn btn-outline btn-sm"
            onclick="openChangeStudentClubModal('${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName)}', '${escapeHtml(s.lastName)}', '${escapeHtml(s.clubName || (s.hasSelected ? 'Havuzda Bekliyor' : 'Seçim Yapmadı'))}', '${escapeHtml(s.clubId || '')}')"
          >
            🔄 ${s.isPlaced ? 'Kulüp Değiştir' : 'Kulüp Ata'}
          </button>
          ${
            s.hasSelected && s.selectionId
              ? `<button class="btn btn-secondary btn-sm" onclick="handleResetStudentSelection('${escapeHtml(s.selectionId)}')" title="Sadece Kulüp Seçimini Sıfırla">↩️ Seçimi Sıfırla</button>`
              : ''
          }
          <button
            class="btn btn-danger btn-sm"
            onclick="handleDeleteStudentRecord('${escapeHtml(s.id)}', '${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName + ' ' + s.lastName)}')"
            title="Öğrenciyi Sistemden Tamamen Sil"
          >
            🗑️ Öğrenciyi Sil
          </button>
        </td>
      </tr>
    `;
    })
    .join('');
}

// Öğrenciyi Sistemden Tamamen Silme Fonksiyonu
async function handleDeleteStudentRecord(id, className, studentNo, fullName) {
  const display = fullName ? `"${fullName}" (${className} - ${studentNo})` : `${className} - ${studentNo} numaralı`;
  if (!confirm(`${display} öğrencisini ve varsa kulüp seçim kaydını sistemden tamamen silmek istediğinize emin misiniz?`)) {
    return;
  }

  const { ok, data } = await apiFetch('/api/admin/students/delete', {
    method: 'POST',
    body: JSON.stringify({ id, className, studentNo })
  });

  if (ok && data.success) {
    state.selectedStudentKeys.delete(`${className}_${studentNo}`);
    state.selectedClassStudentKeys.delete(`${className}_${studentNo}`);
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'info');
  } else {
    showToast(data.message || 'Öğrenci silinemedi.', 'error');
  }
}

// Seçili Öğrencileri Toplu Silme
async function handleBulkDeleteSelectedStudents() {
  const count = state.selectedStudentKeys.size;
  if (count === 0) return;
  if (!confirm(`Seçili ${count} öğrenciyi sistemden tamamen silmek istediğinize emin misiniz?`)) return;

  const items = Array.from(state.selectedStudentKeys).map((k) => {
    const [className, studentNo] = k.split('_');
    return { className, studentNo };
  });

  const { ok, data } = await apiFetch('/api/admin/students/delete-bulk', {
    method: 'POST',
    body: JSON.stringify({ items })
  });

  if (ok && data.success) {
    state.selectedStudentKeys.clear();
    const chkAll = document.getElementById('chkSelectAllStudents');
    if (chkAll) chkAll.checked = false;
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'info');
  } else {
    showToast(data.message || 'Toplu silme başarısız oldu.', 'error');
  }
}

// Tüm Öğrencileri Silme
async function handleDeleteAllStudentsConfirm() {
  if (!confirm('DİKKAT: Sistemdeki TÜM kayıtlı öğrencileri ve kulüp seçimlerini silmek istediğinize emin misiniz?')) {
    return;
  }

  const { ok, data } = await apiFetch('/api/admin/students-all', { method: 'DELETE' });
  if (ok && data.success) {
    state.selectedStudentKeys.clear();
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'info');
  } else {
    showToast(data.message || 'Öğrenciler silinemedi.', 'error');
  }
}

// #26 Yöneticinin Öğrenci Kulübünü Değiştirmesi
function openChangeStudentClubModal(className, studentNo, firstName, lastName, currentClubName, currentClubId) {
  document.getElementById('chgStClass').value = className;
  document.getElementById('chgStNo').value = studentNo;
  document.getElementById('chgStFirst').value = firstName;
  document.getElementById('chgStLast').value = lastName;

  document.getElementById('chgDisplayStudentName').textContent = `${firstName} ${lastName}`;
  document.getElementById('chgDisplayClassNo').textContent = `${className} — No: ${studentNo}`;
  document.getElementById('chgDisplayCurrentClub').textContent = currentClubName || 'Seçim Yapmadı';

  const select = document.getElementById('chgNewClubSelect');
  const clubs = state.dashboardData?.clubs || [];
  select.innerHTML = clubs
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}" ${c.id === currentClubId ? 'selected' : ''}>
          ${escapeHtml(c.name)} (Dolu: ${c.filled}/${c.quota})
        </option>`
    )
    .join('');

  document.getElementById('changeStudentClubModal').style.display = 'flex';
}

function closeChangeStudentClubModal() {
  document.getElementById('changeStudentClubModal').style.display = 'none';
}

async function handleConfirmChangeStudentClub(e) {
  e.preventDefault();
  const className = document.getElementById('chgStClass').value;
  const studentNo = document.getElementById('chgStNo').value;
  const firstName = document.getElementById('chgStFirst').value;
  const lastName = document.getElementById('chgStLast').value;
  const newClubId = document.getElementById('chgNewClubSelect').value;

  const { ok, data } = await apiFetch('/api/admin/selections/change-club', {
    method: 'PUT',
    body: JSON.stringify({ className, studentNo, firstName, lastName, newClubId })
  });

  closeChangeStudentClubModal();
  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'success');
  } else {
    showToast(data.message || 'Kulüp değiştirilemedi.', 'error');
  }
}

async function handleResetStudentSelection(selectionId) {
  if (!confirm('Bu öğrencinin kulüp seçimini sıfırlamak istediğinize emin misiniz?')) return;
  const { ok, data } = await apiFetch(`/api/admin/selections/${selectionId}`, {
    method: 'DELETE'
  });
  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'info');
  }
}

// ============================================================================
// KULÜPLER SEKMESİ VE KULÜP BAZLI LİSTE (#12, #14, #15)
// ============================================================================
function renderAdminClubsSection() {
  const grid = document.getElementById('adminClubsGrid');
  if (!grid || !state.dashboardData) return;

  const clubs = state.dashboardData.clubs || [];
  if (!state.selectedClubIdForDetail && clubs.length > 0) {
    state.selectedClubIdForDetail = clubs[0].id;
  }

  grid.innerHTML = clubs
    .map((club) => {
      const pct = club.quota > 0 ? Math.min(100, Math.round((club.filled / club.quota) * 100)) : 100;
      const isSelected = state.selectedClubIdForDetail === club.id;
      const c1 = club.choice1Count || 0;
      const c2 = club.choice2Count || 0;
      const c3 = club.choice3Count || 0;

      let statusBadgeHtml = '';
      if (!club.active) {
        statusBadgeHtml = `<span class="badge badge-gray">PASİF</span>`;
      } else if (club.isFull) {
        statusBadgeHtml = `<span class="badge badge-danger">KONTENJAN DOLU</span>`;
      } else if (club.filled >= 4) {
        statusBadgeHtml = `<span class="badge badge-success">AÇILDI (${club.filled} Öğrenci)</span>`;
      } else if (c1 > 0 && c1 <= 3 && club.filled <= 3) {
        statusBadgeHtml = `<span class="badge badge-warning" title="3 ve daha az öğrenci seçtiği için kulüp açılmadı, öğrenciler alt tercihlerine aktarıldı.">AÇILMADI (<=3 Barajı)</span>`;
      } else {
        statusBadgeHtml = `<span class="badge badge-info">En Az 4 Öğrenci Bekleniyor</span>`;
      }

      return `
        <div
          class="club-card"
          style="cursor:pointer; ${isSelected ? 'border: 2.5px solid #2563eb; background:#f8fafc;' : ''}"
          onclick="selectClubForAdminDetail('${escapeHtml(club.id)}')"
        >
          <div class="club-card-top">
            <div class="club-card-title">
              <span>${escapeHtml(club.name)}</span>
              ${statusBadgeHtml}
            </div>
            ${club.teacher ? `<div class="club-teacher-tag">👨‍🏫 ${escapeHtml(club.teacher)}</div>` : ''}
            <p class="club-card-desc">${escapeHtml(club.description || '')}</p>
            <div style="font-size:0.77rem; font-weight:700; color:#334155; background:#f1f5f9; padding:0.35rem 0.6rem; border-radius:6px; margin-bottom:0.5rem;">
              Havuz Talebi: <strong style="color:#1d4ed8;">1.Tercih: ${c1}</strong> | <strong style="color:#0369a1;">2.Tercih: ${c2}</strong> | <strong style="color:#6d28d9;">3.Tercih: ${c3}</strong>
            </div>
          </div>

          <div>
            <div class="club-quota-stats">
              <div class="quota-numbers-row">
                <div class="quota-item-box">
                  <span class="quota-label">Kontenjan</span>
                  <span class="quota-val">${club.quota}</span>
                </div>
                <div class="quota-item-box">
                  <span class="quota-label">Yerleşen</span>
                  <span class="quota-val">${club.filled}</span>
                </div>
                <div class="quota-item-box">
                  <span class="quota-label">Boş</span>
                  <span class="quota-val ${club.isFull ? 'text-danger' : 'text-success'}">${club.available}</span>
                </div>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill ${club.isFull ? 'fill-full' : ''}" style="width:${pct}%;"></div>
              </div>
            </div>

            <div style="display:flex; gap:0.4rem; flex-wrap:wrap;" onclick="event.stopPropagation()">
              <button class="btn btn-primary btn-sm" style="flex:1;" onclick="selectClubForAdminDetail('${escapeHtml(club.id)}')">
                👥 Öğrencileri Gör (${club.filled})
              </button>
              <button class="btn btn-outline btn-sm" onclick="openClubFormModal('${escapeHtml(club.id)}')">
                ✏️ Düzenle
              </button>
              <button class="btn btn-danger btn-sm" onclick="handleDeleteClub('${escapeHtml(club.id)}')" title="Kulübü Sil">
                🗑️ Sil
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  renderSelectedClubStudentsDetail();
}

function selectClubForAdminDetail(clubId) {
  state.selectedClubIdForDetail = clubId;
  renderAdminClubsSection();
  const detailPanel = document.getElementById('selectedClubDetailPanel');
  if (detailPanel) {
    detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// #12 Kulüp Bazlı Öğrenci Listesi
function renderSelectedClubStudentsDetail() {
  const panel = document.getElementById('selectedClubDetailPanel');
  if (!panel || !state.dashboardData) return;

  const club = (state.dashboardData.clubs || []).find((c) => c.id === state.selectedClubIdForDetail);
  if (!club) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  const students = (state.dashboardData.selections || [])
    .filter((s) => s.clubId === club.id)
    .sort((a, b) => {
      if (a.className !== b.className) return a.className.localeCompare(b.className, 'tr');
      return (parseInt(a.studentNo, 10) || 0) - (parseInt(b.studentNo, 10) || 0);
    });

  document.getElementById('clubDetailTitle').textContent = club.name;
  const openRuleText =
    club.filled >= 4
      ? 'Kulüp Açıldı (En az 4 öğrenci kuralı sağlandı)'
      : 'Kulüp Açılmadı (3 ve daha az öğrenci olduğu için öğrenciler alt tercihlerine yönlendirilir)';
  document.getElementById('clubDetailSubtitle').textContent =
    `Yerleşen Öğrenci: ${students.length} / Kontenjan: ${club.quota} (Boş: ${club.available}) — ${openRuleText}`;

  document.getElementById('btnClubExportDocx').onclick = () => downloadSingleClubFile(club.id, 'docx');
  document.getElementById('btnClubExportPdf').onclick = () => downloadSingleClubFile(club.id, 'pdf');

  const tbody = document.getElementById('clubDetailStudentsBody');
  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#64748b;">Bu kulüpte yerleşmiş öğrenci bulunmamaktadır (3 ve daha az öğrenci seçtiyse otomatik olarak 2. veya 3. tercihlerine atanmıştır).</td></tr>`;
    return;
  }

  tbody.innerHTML = students
    .map(
      (s, idx) => `
      <tr>
        <td><strong>${idx + 1}</strong></td>
        <td>
          <strong>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</strong>
          <div style="margin-top:2px;">${formatPlacementBadgeHtml({ ...s, hasSelected: true })}</div>
        </td>
        <td><span class="badge badge-gray">${escapeHtml(s.className)}</span></td>
        <td><strong>${escapeHtml(s.studentNo)}</strong></td>
        <td>${escapeHtml(s.dateFormatted)}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button
            class="btn btn-outline btn-sm"
            onclick="openChangeStudentClubModal('${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName)}', '${escapeHtml(s.lastName)}', '${escapeHtml(s.clubName)}', '${escapeHtml(s.clubId)}')"
          >
            ✏️ Kulüp Değiştir
          </button>
          <button
            class="btn btn-secondary btn-sm"
            onclick="handleResetStudentSelection('${escapeHtml(s.id)}')"
            title="Kulüpten Çıkar"
          >
            ↩️ Kulüpten Çıkar
          </button>
          <button
            class="btn btn-danger btn-sm"
            onclick="handleDeleteStudentRecord('', '${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName + ' ' + s.lastName)}')"
            title="Öğrenciyi Sistemden Sil"
          >
            🗑️ Öğrenciyi Sil
          </button>
        </td>
      </tr>
    `
    )
    .join('');
}

// #15 Kulüp Ekleme / Düzenleme Modalı
function openClubFormModal(clubId = null) {
  const modal = document.getElementById('clubFormModal');
  if (!modal) return;

  if (clubId) {
    const club = (state.dashboardData?.clubs || []).find((c) => c.id === clubId);
    if (!club) return;
    document.getElementById('clubModalTitle').textContent = 'Kulüp Bilgilerini Düzenle';
    document.getElementById('editClubId').value = club.id;
    document.getElementById('editClubName').value = club.name;
    document.getElementById('editClubDesc').value = club.description || '';
    document.getElementById('editClubQuota').value = club.quota;
    document.getElementById('editClubTeacher').value = club.teacher || '';
    document.getElementById('editClubActive').checked = club.active !== false;
  } else {
    document.getElementById('clubModalTitle').textContent = 'Yeni Kulüp Ekle';
    document.getElementById('editClubId').value = '';
    document.getElementById('editClubName').value = '';
    document.getElementById('editClubDesc').value = '';
    document.getElementById('editClubQuota').value = 20;
    document.getElementById('editClubTeacher').value = '';
    document.getElementById('editClubActive').checked = true;
  }

  modal.style.display = 'flex';
}

function closeClubFormModal() {
  document.getElementById('clubFormModal').style.display = 'none';
}

async function handleSaveClubForm(e) {
  e.preventDefault();
  const id = document.getElementById('editClubId').value;
  const payload = {
    name: document.getElementById('editClubName').value.trim(),
    description: document.getElementById('editClubDesc').value.trim(),
    quota: parseInt(document.getElementById('editClubQuota').value, 10) || 20,
    teacher: document.getElementById('editClubTeacher').value.trim(),
    active: document.getElementById('editClubActive').checked
  };

  const url = id ? `/api/admin/clubs/${id}` : '/api/admin/clubs';
  const method = id ? 'PUT' : 'POST';

  const { ok, data } = await apiFetch(url, {
    method,
    body: JSON.stringify(payload)
  });

  closeClubFormModal();
  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    if (!id && data.club) {
      state.selectedClubIdForDetail = data.club.id;
    }
    renderAllAdminViews();
    showToast(data.message, 'success');
  } else {
    showToast(data.message || 'Kulüp kaydedilemedi.', 'error');
  }
}

async function handleDeleteClub(clubId) {
  const club = (state.dashboardData?.clubs || []).find((c) => c.id === clubId);
  if (!club) return;
  if (!confirm(`"${club.name}" kulübünü silmek istediğinize emin misiniz?`)) return;

  const { ok, data } = await apiFetch(`/api/admin/clubs/${clubId}`, { method: 'DELETE' });
  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    if (state.selectedClubIdForDetail === clubId) {
      state.selectedClubIdForDetail = state.dashboardData.clubs[0]?.id || null;
    }
    renderAllAdminViews();
    showToast(data.message, 'info');
  }
}

// ============================================================================
// SINIFLAR, HER SINIFA ÖĞRENCİ EKLEME / SİLME VE SINIF BAZLI RAPOR (#13)
// ============================================================================
function renderClassBasedReportSection() {
  const d = state.dashboardData;
  if (!d) return;

  const classes = d.classes || [];
  if (!classes.includes(state.selectedClassForReport) && classes.length > 0) {
    state.selectedClassForReport = classes[0];
  } else if (classes.length === 0) {
    state.selectedClassForReport = '';
  }

  const allStudents = d.allStudents || [];

  const pillsContainer = document.getElementById('classPillsContainer');
  if (pillsContainer) {
    if (classes.length === 0) {
      pillsContainer.innerHTML = `<div style="color:#64748b; font-size:0.9rem;">Henüz tanımlı sınıf bulunmamaktadır. Yukarıdan yeni sınıf ekleyebilirsiniz.</div>`;
    } else {
      pillsContainer.innerHTML = classes
        .map((c) => {
          const isSelected = state.selectedClassForReport === c;
          const cnt = allStudents.filter((s) => s.className === c).length;
          return `
          <div style="display:inline-flex; align-items:center; border-radius:9px; overflow:hidden; border:1.5px solid ${isSelected ? '#1e3a8a' : '#cbd5e1'}; background:${isSelected ? '#1e3a8a' : '#ffffff'}; box-shadow:0 1px 3px rgba(15,23,42,0.06);">
            <button
              type="button"
              style="padding:0.5rem 0.85rem; border:none; background:transparent; color:${isSelected ? '#ffffff' : '#0f172a'}; font-weight:800; font-size:0.88rem; cursor:pointer;"
              onclick="selectClassForReport('${escapeHtml(c)}')"
            >
              ${escapeHtml(c)} Sınıfı (${cnt})
            </button>
            <button
              type="button"
              title="${escapeHtml(c)} Sınıfına Öğrenci Ekle"
              style="padding:0.5rem 0.65rem; border:none; border-left:1px solid ${isSelected ? 'rgba(255,255,255,0.22)' : '#e2e8f0'}; background:${isSelected ? 'rgba(22,163,74,0.85)' : '#f0fdf4'}; color:${isSelected ? '#ffffff' : '#15803d'}; font-weight:800; font-size:0.78rem; cursor:pointer;"
              onclick="openClassAddStudentModal('${escapeHtml(c)}', event)"
            >
              + Öğrenci Ekle
            </button>
            <button
              type="button"
              title="${escapeHtml(c)} Sınıfını Sil"
              style="padding:0.5rem 0.6rem; border:none; border-left:1px solid ${isSelected ? 'rgba(255,255,255,0.22)' : '#e2e8f0'}; background:transparent; color:${isSelected ? '#fca5a5' : '#dc2626'}; font-weight:800; cursor:pointer;"
              onclick="handleDeleteClassByName('${escapeHtml(c)}', event)"
            >
              🗑️
            </button>
          </div>
        `;
        })
        .join('');
    }
  }

  const cls = state.selectedClassForReport;
  const classStudents = cls ? allStudents.filter((s) => s.className === cls) : [];

  const headingEl = document.getElementById('selectedClassReportHeading');
  if (headingEl) {
    headingEl.textContent = cls ? `${cls} SINIFI (${classStudents.length} Öğrenci)` : 'SINIF SEÇİLMEDİ';
  }

  const quickLabel = document.getElementById('quickAddClassLabel');
  if (quickLabel) {
    quickLabel.textContent = cls || '-';
  }

  const addBtnHeader = document.getElementById('btnOpenAddStudentSelectedClass');
  if (addBtnHeader) {
    addBtnHeader.textContent = cls ? `➕ ${cls} Sınıfına Öğrenci Ekle` : '➕ Seçili Sınıfa Öğrenci Ekle';
    addBtnHeader.disabled = !cls;
  }

  const quickSubmitBtn = document.getElementById('btnQuickAddStudentToClass');
  if (quickSubmitBtn) {
    quickSubmitBtn.textContent = cls ? `➕ ${cls} Sınıfına Ekle` : '➕ Öğrenciyi Sınıfa Ekle';
    quickSubmitBtn.disabled = !cls;
  }

  const delBtn = document.getElementById('btnDeleteSelectedClass');
  if (delBtn) {
    delBtn.textContent = cls ? `🗑️ ${cls} Sınıfını Sil` : '🗑️ Seçili Sınıfı Sil';
    delBtn.disabled = !cls;
  }

  updateBulkDeleteClassStudentsButton();

  const arrowBox = document.getElementById('classArrowSummaryBox');
  const tbody = document.getElementById('classReportTableBody');

  if (arrowBox) {
    arrowBox.innerHTML = classStudents
      .map(
        (s) => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.65rem 0.9rem; display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
          <div style="display:flex; flex-direction:column;">
            <span style="font-weight:700; font-size:0.9rem; color:#0f172a;">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)} <span style="color:#64748b; font-size:0.78rem;">(No: ${escapeHtml(s.studentNo)})</span></span>
            <span style="font-weight:700; font-size:0.8rem; color:${s.isPlaced ? '#1e3a8a' : s.hasSelected ? '#0284c7' : '#d97706'};">
              → ${escapeHtml(s.isPlaced && s.clubName ? s.clubName.replace(' KULÜBÜ', '') : s.hasSelected ? 'Havuzda Bekliyor' : 'Seçmedi')}
            </span>
          </div>
          <button
            type="button"
            class="btn btn-danger btn-sm"
            style="padding:0.25rem 0.5rem; font-size:0.78rem;"
            title="Bu Öğrenciyi Sil"
            onclick="handleDeleteStudentRecord('${escapeHtml(s.id)}', '${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName + ' ' + s.lastName)}')"
          >
            🗑️ Sil
          </button>
        </div>
      `
      )
      .join('');
  }

  if (tbody) {
    if (classStudents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:1.5rem; color:#64748b;">Bu sınıfta kayıtlı öğrenci bulunmamaktadır. Yukarıdaki formdan hemen öğrenci ekleyebilirsiniz.</td></tr>`;
    } else {
      tbody.innerHTML = classStudents
        .map((s, idx) => {
          const key = `${s.className}_${s.studentNo}`;
          const isChecked = state.selectedClassStudentKeys.has(key);
          return `
          <tr>
            <td>
              <input
                type="checkbox"
                class="class-student-row-chk"
                data-key="${escapeHtml(key)}"
                ${isChecked ? 'checked' : ''}
                onchange="toggleClassStudentRowCheckbox('${escapeHtml(key)}', this.checked)"
              />
            </td>
            <td><strong>${idx + 1}</strong></td>
            <td><strong>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</strong></td>
            <td><span class="badge badge-gray">${escapeHtml(s.className)}</span></td>
            <td><strong>${escapeHtml(s.studentNo)}</strong></td>
            <td>${formatStudentChoicesHtml(s)}</td>
            <td>
              ${
                s.isPlaced
                  ? `<span class="badge badge-primary">${escapeHtml(s.clubName)}</span>`
                  : s.hasSelected
                  ? `<span class="badge badge-warning">⏳ Havuzda Bekliyor</span>`
                  : `<span class="badge badge-gray">Henüz Seçim Yapmadı</span>`
              }
            </td>
            <td>${escapeHtml(s.dateFormatted || '-')}</td>
            <td style="text-align:right; white-space:nowrap;">
              <button
                class="btn btn-outline btn-sm"
                onclick="openChangeStudentClubModal('${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName)}', '${escapeHtml(s.lastName)}', '${escapeHtml(s.clubName || (s.hasSelected ? 'Havuzda Bekliyor' : 'Seçim Yapmadı'))}', '${escapeHtml(s.clubId || '')}')"
              >
                ✏️ ${s.isPlaced ? 'Kulüp Değiştir' : 'Kulüp Ata'}
              </button>
              <button
                class="btn btn-danger btn-sm"
                onclick="handleDeleteStudentRecord('${escapeHtml(s.id)}', '${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName + ' ' + s.lastName)}')"
                title="Öğrenciyi Sil"
              >
                🗑️ Öğrenciyi Sil
              </button>
            </td>
          </tr>
        `;
        })
        .join('');
    }
  }
}

function selectClassForReport(cls) {
  state.selectedClassForReport = cls;
  state.selectedClassStudentKeys.clear();
  const chkAll = document.getElementById('chkSelectAllClassStudents');
  if (chkAll) chkAll.checked = false;
  renderClassBasedReportSection();
}

// Sınıflar sekmesinden hızlı öğrenci ekleme (Form)
async function handleQuickAddStudentToCurrentClass(e) {
  e.preventDefault();
  const className = state.selectedClassForReport;
  if (!className) {
    showToast('Lütfen önce bir sınıf seçiniz.', 'warning');
    return;
  }

  const firstName = document.getElementById('clsQuickAddFirst').value.trim();
  const lastName = document.getElementById('clsQuickAddLast').value.trim();
  const studentNo = document.getElementById('clsQuickAddNo').value.trim();

  const { ok, data } = await apiFetch('/api/admin/students/add', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, className, studentNo })
  });

  if (ok && data.success) {
    document.getElementById('clsQuickAddFirst').value = '';
    document.getElementById('clsQuickAddLast').value = '';
    document.getElementById('clsQuickAddNo').value = '';
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(`${firstName} ${lastName} (${className} - No: ${studentNo}) başarıyla eklendi!`, 'success');
  } else {
    showToast(data.message || 'Öğrenci eklenemedi.', 'error');
  }
}

// Herhangi bir sınıfa öğrenci ekleme modalını açma
function openClassAddStudentModal(className, evt) {
  if (evt) evt.stopPropagation();
  const targetCls = className || state.selectedClassForReport;
  if (!targetCls) {
    showToast('Lütfen önce bir sınıf seçiniz.', 'warning');
    return;
  }

  state.selectedClassForReport = targetCls;
  renderClassBasedReportSection();

  document.getElementById('modalTargetClassName').value = targetCls;
  document.getElementById('classAddModalTitle').textContent = `${targetCls} SINIFINA ÖĞRENCİ EKLE`;
  document.getElementById('modalAddFirst').value = '';
  document.getElementById('modalAddLast').value = '';
  document.getElementById('modalAddNo').value = '';
  document.getElementById('modalBulkClassPasteText').value = '';

  document.getElementById('classAddStudentModal').style.display = 'flex';
}

function closeClassAddStudentModal() {
  document.getElementById('classAddStudentModal').style.display = 'none';
}

async function handleModalSingleAddToClass(e) {
  e.preventDefault();
  const className = document.getElementById('modalTargetClassName').value || state.selectedClassForReport;
  const firstName = document.getElementById('modalAddFirst').value.trim();
  const lastName = document.getElementById('modalAddLast').value.trim();
  const studentNo = document.getElementById('modalAddNo').value.trim();

  const { ok, data } = await apiFetch('/api/admin/students/add', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, className, studentNo })
  });

  if (ok && data.success) {
    document.getElementById('modalAddFirst').value = '';
    document.getElementById('modalAddLast').value = '';
    document.getElementById('modalAddNo').value = '';
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(`${firstName} ${lastName} (${className}) sınıfa eklendi!`, 'success');
  } else {
    showToast(data.message || 'Öğrenci eklenemedi.', 'error');
  }
}

async function handleModalBulkAddToClass() {
  const className = document.getElementById('modalTargetClassName').value || state.selectedClassForReport;
  const raw = document.getElementById('modalBulkClassPasteText')?.value || '';
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    showToast('Lütfen eklenecek öğrenci satırlarını yapıştırınız.', 'warning');
    return;
  }

  const rows = [];
  for (const line of lines) {
    const parts = line.split(/[;\t,]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      rows.push({
        Ad: parts[0],
        Soyad: parts[1],
        Sınıf: className,
        'Öğrenci No': parts[parts.length >= 4 ? 3 : 2]
      });
    }
  }

  if (rows.length === 0) {
    showToast('Satırlar "Ad; Soyad; Öğrenci No" formatında olmalıdır.', 'error');
    return;
  }

  const { ok, data } = await apiFetch('/api/admin/students/upload', {
    method: 'POST',
    body: JSON.stringify({ rows, replaceExisting: false })
  });

  if (ok && data.success) {
    document.getElementById('modalBulkClassPasteText').value = '';
    closeClassAddStudentModal();
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(`${rows.length} öğrenci ${className} sınıfına başarıyla eklendi!`, 'success');
  } else {
    showToast(data.message || 'Öğrenciler eklenemedi.', 'error');
  }
}

function updateBulkDeleteClassStudentsButton() {
  const btn = document.getElementById('btnBulkDeleteClassStudents');
  const countSpan = document.getElementById('selectedClassStudentsCountSpan');
  if (!btn || !countSpan) return;
  const count = state.selectedClassStudentKeys.size;
  countSpan.textContent = count;
  btn.style.display = count > 0 ? 'inline-flex' : 'none';
}

function toggleClassStudentRowCheckbox(key, checked) {
  if (checked) {
    state.selectedClassStudentKeys.add(key);
  } else {
    state.selectedClassStudentKeys.delete(key);
  }
  updateBulkDeleteClassStudentsButton();
}

function toggleSelectAllClassStudents(checked) {
  const checkboxes = document.querySelectorAll('.class-student-row-chk');
  checkboxes.forEach((chk) => {
    chk.checked = checked;
    const key = chk.dataset.key;
    if (key) {
      if (checked) state.selectedClassStudentKeys.add(key);
      else state.selectedClassStudentKeys.delete(key);
    }
  });
  updateBulkDeleteClassStudentsButton();
}

async function handleBulkDeleteClassStudents() {
  const count = state.selectedClassStudentKeys.size;
  if (count === 0) return;
  if (!confirm(`Seçili ${count} öğrenciyi sınıftan ve sistemden silmek istediğinize emin misiniz?`)) return;

  const items = Array.from(state.selectedClassStudentKeys).map((k) => {
    const [className, studentNo] = k.split('_');
    return { className, studentNo };
  });

  const { ok, data } = await apiFetch('/api/admin/students/delete-bulk', {
    method: 'POST',
    body: JSON.stringify({ items })
  });

  if (ok && data.success) {
    state.selectedClassStudentKeys.clear();
    const chkAll = document.getElementById('chkSelectAllClassStudents');
    if (chkAll) chkAll.checked = false;
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'info');
  } else {
    showToast(data.message || 'Seçili öğrenciler silinemedi.', 'error');
  }
}

async function handleClearAllStudentsInClass() {
  const cls = state.selectedClassForReport;
  if (!cls) return;
  const classStudents = (state.dashboardData?.allStudents || []).filter((s) => s.className === cls);
  if (classStudents.length === 0) {
    showToast(`${cls} sınıfında silinecek öğrenci bulunmamaktadır.`, 'warning');
    return;
  }

  if (!confirm(`${cls} sınıfındaki TÜM öğrencileri (${classStudents.length} öğrenci) silmek istediğinize emin misiniz? (Sınıf tanımı korunacaktır)`)) {
    return;
  }

  const items = classStudents.map((s) => ({ className: s.className, studentNo: s.studentNo }));
  const { ok, data } = await apiFetch('/api/admin/students/delete-bulk', {
    method: 'POST',
    body: JSON.stringify({ items })
  });

  if (ok && data.success) {
    state.selectedClassStudentKeys.clear();
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(`${cls} sınıfındaki ${classStudents.length} öğrenci silindi.`, 'info');
  } else {
    showToast(data.message || 'Öğrenciler silinemedi.', 'error');
  }
}

async function handleAddClass() {
  const input = document.getElementById('newClassNameInput');
  const val = input.value.trim();
  if (!val) return;

  const { ok, data } = await apiFetch('/api/admin/classes', {
    method: 'POST',
    body: JSON.stringify({ className: val })
  });
  if (ok && data.success) {
    input.value = '';
    state.dashboardData = data.dashboard;
    state.selectedClassForReport = val.toLocaleUpperCase('tr-TR');
    renderAllAdminViews();
    await loadPublicConfig();
    showToast(data.message, 'success');
  }
}

async function handleDeleteSelectedClass() {
  if (!state.selectedClassForReport) return;
  await handleDeleteClassByName(state.selectedClassForReport);
}

async function handleDeleteClassByName(className, evt) {
  if (evt) evt.stopPropagation();
  if (!className) return;

  const classStudentCount = (state.dashboardData?.allStudents || []).filter(
    (s) => s.className === className
  ).length;

  const msg =
    classStudentCount > 0
      ? `"${className}" sınıfını ve bu sınıfa kayıtlı ${classStudentCount} öğrenciyi sistemden silmek istediğinize emin misiniz?`
      : `"${className}" sınıfını silmek istediğinize emin misiniz?`;

  if (!confirm(msg)) return;

  const { ok, data } = await apiFetch(
    `/api/admin/classes/${encodeURIComponent(className)}?deleteStudents=true`,
    { method: 'DELETE' }
  );

  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    state.selectedClassForReport = state.dashboardData.classes[0] || '';
    state.selectedClassStudentKeys.clear();
    renderAllAdminViews();
    await loadPublicConfig();
    showToast(data.message, 'info');
  } else {
    showToast(data.message || 'Sınıf silinemedi.', 'error');
  }
}

async function exportCurrentClassReport(format) {
  const cls = state.selectedClassForReport;
  if (!cls) return;
  const students = (state.dashboardData?.allStudents || []).filter((s) => s.className === cls);
  const headers = ['Sıra', 'Ad Soyad', 'Sınıf', 'Öğrenci No', 'Seçtiği Kulüp', 'Tarih'];
  const rows = students.map((s, idx) => [
    idx + 1,
    `${s.firstName} ${s.lastName}`,
    s.className,
    s.studentNo,
    s.clubName || 'SEÇİM YAPMADI',
    s.dateFormatted || '-'
  ]);

  await downloadCustomReportFile(format, {
    reportTitle: `${cls} SINIFI ÖĞRENCİ KULÜP LİSTESİ`,
    subtitle: `Toplam Öğrenci: ${students.length}`,
    headers,
    rows,
    fileName: `${cls}_Sinifi_Kulup_Listesi`
  });
}

// ============================================================================
// KULÜP SEÇMEYEN ÖĞRENCİLER (#22)
// ============================================================================
function renderUnselectedStudentsTab() {
  const d = state.dashboardData;
  if (!d) return;

  const clsFilter = document.getElementById('unselectedClassFilter')?.value || '';
  let list = d.unselectedStudents || [];
  if (clsFilter) {
    list = list.filter((s) => s.className === clsFilter);
  }

  const chipsBox = document.getElementById('unselectedQuickChips');
  const tbody = document.getElementById('unselectedTableBody');

  if (chipsBox) {
    chipsBox.innerHTML = list
      .map(
        (s) => `
        <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:0.6rem 0.9rem; font-weight:700; color:#92400e; font-size:0.88rem; display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
          <span>⏳ ${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)} – ${escapeHtml(s.className)} – ${escapeHtml(s.studentNo)}</span>
          <button
            type="button"
            style="border:none; background:transparent; color:#dc2626; cursor:pointer; font-size:0.9rem;"
            title="Öğrenciyi Sil"
            onclick="handleDeleteStudentRecord('${escapeHtml(s.id)}', '${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName + ' ' + s.lastName)}')"
          >
            🗑️
          </button>
        </div>
      `
      )
      .join('');
  }

  if (tbody) {
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#16a34a; font-weight:700;">🎉 Harika! Tüm öğrenciler kulüp seçimini tamamlamıştır.</td></tr>`;
    } else {
      tbody.innerHTML = list
        .map(
          (s, idx) => `
          <tr>
            <td><strong>${idx + 1}</strong></td>
            <td><strong>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</strong></td>
            <td><span class="badge badge-gray">${escapeHtml(s.className)}</span></td>
            <td><strong>${escapeHtml(s.studentNo)}</strong></td>
            <td><span class="badge badge-warning">Kulüp Seçmedi</span></td>
            <td style="text-align:right; white-space:nowrap;">
              <button
                class="btn btn-primary btn-sm"
                onclick="openChangeStudentClubModal('${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName)}', '${escapeHtml(s.lastName)}', 'Seçim Yapmadı', '')"
              >
                + Kulüp Ata
              </button>
              <button
                class="btn btn-danger btn-sm"
                onclick="handleDeleteStudentRecord('${escapeHtml(s.id)}', '${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName + ' ' + s.lastName)}')"
              >
                🗑️ Öğrenciyi Sil
              </button>
            </td>
          </tr>
        `
        )
        .join('');
    }
  }
}

async function exportUnselectedStudents(format) {
  const list = state.dashboardData?.unselectedStudents || [];
  const headers = ['Sıra', 'Ad Soyad', 'Sınıf', 'Öğrenci No', 'Durum'];
  const rows = list.map((s, i) => [
    i + 1,
    `${s.firstName} ${s.lastName}`,
    s.className,
    s.studentNo,
    'Kulüp Seçimi Yapmadı'
  ]);
  await downloadCustomReportFile(format, {
    reportTitle: 'KULÜP SEÇİMİ YAPMAYAN ÖĞRENCİLER LİSTESİ',
    subtitle: `Toplam Seçim Yapmayan Öğrenci: ${list.length}`,
    headers,
    rows,
    fileName: 'Kulup_Secmeyen_Ogrenciler_Listesi'
  });
}

// ============================================================================
// 8 KAPSAMLI SİSTEM RAPORU (#28)
// ============================================================================
function selectSystemReport(reportType) {
  state.activeReportType = reportType;
  document.querySelectorAll('.report-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.report === reportType);
  });

  const subSelect = document.getElementById('reportSubFilterSelect');
  const d = state.dashboardData;
  if (reportType === 'by-club' && d) {
    subSelect.style.display = 'inline-block';
    subSelect.innerHTML = d.clubs
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
      .join('');
  } else if (reportType === 'by-class' && d) {
    subSelect.style.display = 'inline-block';
    subSelect.innerHTML = d.classes
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)} Sınıfı</option>`)
      .join('');
  } else {
    subSelect.style.display = 'none';
  }

  renderActiveSystemReport();
}

function buildActiveReportSpec() {
  const d = state.dashboardData;
  if (!d) return null;

  const type = state.activeReportType;
  const subVal = document.getElementById('reportSubFilterSelect')?.value;

  if (type === 'all') {
    return {
      title: '1. TÜM ÖĞRENCİLER KULÜP DURUM RAPORU',
      subtitle: `Toplam Öğrenci: ${d.allStudents.length} (Seçen: ${d.stats.selectedCount}, Seçmeyen: ${d.stats.unselectedCount})`,
      fileName: 'Tum_Ogrenciler_Raporu',
      headers: ['Sıra', 'Ad Soyad', 'Sınıf', 'Öğrenci No', 'Kulüp', 'Tarih'],
      rows: d.allStudents.map((s, i) => [
        i + 1,
        `${s.firstName} ${s.lastName}`,
        s.className,
        s.studentNo,
        s.clubName || 'SEÇİM YAPMADI',
        s.dateFormatted || '-'
      ])
    };
  }

  if (type === 'selected') {
    const selected = d.allStudents.filter((s) => s.hasSelected);
    return {
      title: '2. KULÜP SEÇEN ÖĞRENCİLER RAPORU',
      subtitle: `Toplam Seçim Yapan Öğrenci: ${selected.length}`,
      fileName: 'Kulup_Secen_Ogrenciler_Raporu',
      headers: ['Sıra', 'Ad Soyad', 'Sınıf', 'Öğrenci No', 'Seçilen Kulüp', 'Seçim Tarihi'],
      rows: selected.map((s, i) => [
        i + 1,
        `${s.firstName} ${s.lastName}`,
        s.className,
        s.studentNo,
        s.clubName,
        s.dateFormatted || '-'
      ])
    };
  }

  if (type === 'unselected') {
    const unsel = d.unselectedStudents || [];
    return {
      title: '3. KULÜP SEÇMEYEN ÖĞRENCİLER RAPORU',
      subtitle: `Henüz Kulüp Seçmeyen Öğrenci Sayısı: ${unsel.length}`,
      fileName: 'Kulup_Secmeyen_Ogrenciler_Raporu',
      headers: ['Sıra', 'Ad Soyad', 'Sınıf', 'Öğrenci No', 'Durum'],
      rows: unsel.map((s, i) => [
        i + 1,
        `${s.firstName} ${s.lastName}`,
        s.className,
        s.studentNo,
        'Seçim Yapmadı'
      ])
    };
  }

  if (type === 'by-club') {
    const club = d.clubs.find((c) => c.id === subVal) || d.clubs[0];
    const list = d.selections.filter((s) => club && s.clubId === club.id);
    return {
      title: `4. KULÜP BAZLI ÖĞRENCİ LİSTESİ — ${club ? club.name : ''}`,
      subtitle: `Kayıtlı Öğrenci: ${list.length} / Kontenjan: ${club ? club.quota : 0}`,
      fileName: club ? `${club.name}_Raporu` : 'Kulup_Bazli_Rapor',
      headers: ['Sıra', 'Ad Soyad', 'Sınıf', 'Öğrenci No', 'Seçim Tarihi'],
      rows: list.map((s, i) => [
        i + 1,
        `${s.firstName} ${s.lastName}`,
        s.className,
        s.studentNo,
        s.dateFormatted || '-'
      ])
    };
  }

  if (type === 'by-class') {
    const cls = subVal || d.classes[0] || '6A';
    const list = d.allStudents.filter((s) => s.className === cls);
    return {
      title: `5. SINIF BAZLI KULÜP LİSTESİ — ${cls} SINIFI`,
      subtitle: `${cls} Sınıfı Toplam Öğrenci: ${list.length}`,
      fileName: `${cls}_Sinifi_Kulup_Raporu`,
      headers: ['Sıra', 'Ad Soyad', 'Sınıf', 'Öğrenci No', 'Kulübü', 'Seçim Tarihi'],
      rows: list.map((s, i) => [
        i + 1,
        `${s.firstName} ${s.lastName}`,
        s.className,
        s.studentNo,
        s.clubName || 'SEÇİM YAPMADI',
        s.dateFormatted || '-'
      ])
    };
  }

  if (type === 'quota') {
    return {
      title: '6. KULÜP KONTENJAN VE DOLULUK RAPORU',
      subtitle: `Toplam Kulüp: ${d.clubs.length} | Toplam Kontenjan: ${d.stats.totalQuota}`,
      fileName: 'Kulup_Kontenjan_Raporu',
      headers: ['Sıra', 'Kulüp Adı', 'Danışman Öğretmen', 'Kontenjan', 'Dolu', 'Boş', 'Durum'],
      rows: d.clubs.map((c, i) => [
        i + 1,
        c.name,
        c.teacher || '-',
        c.quota,
        c.filled,
        c.available,
        c.isFull ? 'KONTENJAN DOLU' : 'Boş Yer Var'
      ])
    };
  }

  if (type === 'dates') {
    return {
      title: '7. ÖĞRENCİ SEÇİM TARİHLERİ VE ZAMAN DAMGASI RAPORU',
      subtitle: `Seçim Aralığı: ${d.electionPeriod?.startFormatted || '-'} — ${d.electionPeriod?.endFormatted || '-'}`,
      fileName: 'Ogrenci_Secim_Tarihleri_Raporu',
      headers: ['Sıra', 'Ad Soyad', 'Sınıf', 'Öğrenci No', 'Seçilen Kulüp', 'Kayıt Tarihi'],
      rows: d.selections.map((s, i) => [
        i + 1,
        `${s.firstName} ${s.lastName}`,
        s.className,
        s.studentNo,
        s.clubName,
        s.dateFormatted
      ])
    };
  }

  const totalSel = Math.max(1, d.stats.selectedCount);
  return {
    title: '8. TÜM KULÜPLERİN DAĞILIM VE YÜZDE RAPORU',
    subtitle: `Toplam Seçim Yapan Öğrenci: ${d.stats.selectedCount}`,
    fileName: 'Tum_Kuluplerin_Dagilim_Raporu',
    headers: ['Sıra', 'Kulüp Adı', 'Öğrenci Sayısı', 'Kontenjan Doluluk %', 'Genel Dağılım Payı %'],
    rows: d.clubs.map((c, i) => [
      i + 1,
      c.name,
      c.filled,
      `%${c.quota > 0 ? Math.round((c.filled / c.quota) * 100) : 0}`,
      `%${Math.round((c.filled / totalSel) * 100)}`
    ])
  };
}

function renderActiveSystemReport() {
  const spec = buildActiveReportSpec();
  if (!spec) return;

  document.getElementById('activeReportTitle').textContent = spec.title;
  document.getElementById('activeReportSubtitle').textContent = spec.subtitle;

  const thead = document.getElementById('activeReportTableHead');
  const tbody = document.getElementById('activeReportTableBody');

  thead.innerHTML = `<tr>${spec.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  if (spec.rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${spec.headers.length}" style="text-align:center; padding:1.5rem; color:#64748b;">Bu raporda gösterilecek kayıt bulunamadı.</td></tr>`;
  } else {
    tbody.innerHTML = spec.rows
      .map(
        (row) => `<tr>${row.map((cell, i) => `<td>${i === 0 ? `<strong>${escapeHtml(cell)}</strong>` : escapeHtml(cell)}</td>`).join('')}</tr>`
      )
      .join('');
  }
}

async function downloadActiveReport(format) {
  const spec = buildActiveReportSpec();
  if (!spec) return;
  await downloadCustomReportFile(format, {
    reportTitle: spec.title,
    subtitle: spec.subtitle,
    headers: spec.headers,
    rows: spec.rows,
    fileName: spec.fileName
  });
}

async function downloadCustomReportFile(format, payload) {
  try {
    showToast(`${format.toUpperCase()} dosyası hazırlanıyor...`, 'info');
    const response = await fetch(`/api/admin/export/report/${format}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.adminToken}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Dosya oluşturulamadı');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payload.fileName || 'Rapor'}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Dosya başarıyla indirildi!', 'success');
  } catch (err) {
    showToast('Dosya indirilirken hata oluştu: ' + err.message, 'error');
  }
}

// ============================================================================
// WORD (.DOCX) VE PDF (.PDF) ÇIKTI MERKEZİ (#19, #20, #21)
// ============================================================================
function renderExportsCenterTab() {
  const grid = document.getElementById('exportClubsListGrid');
  if (!grid || !state.dashboardData) return;

  const clubs = state.dashboardData.clubs || [];
  grid.innerHTML = clubs
    .map(
      (club) => `
      <div class="club-card">
        <div class="club-card-top">
          <div class="club-card-title">
            <span>${escapeHtml(club.name)}</span>
            <span class="badge badge-primary">${club.filled} Öğrenci</span>
          </div>
          <p class="club-card-desc" style="margin-bottom:0.5rem;">
            Kontenjan: ${club.quota} | Dolu: ${club.filled} | Boş: ${club.available}
          </p>
        </div>
        <div style="display:flex; flex-direction:column; gap:0.55rem;">
          <button class="btn btn-primary btn-sm" style="width:100%;" onclick="downloadSingleClubFile('${escapeHtml(club.id)}', 'docx')">
            📘 Word Olarak İndir (.docx)
          </button>
          <button class="btn btn-danger btn-sm" style="width:100%;" onclick="downloadSingleClubFile('${escapeHtml(club.id)}', 'pdf')">
            📕 PDF Olarak İndir (.pdf)
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

function downloadSingleClubFile(clubId, format) {
  const url = `/api/admin/export/club/${encodeURIComponent(clubId)}/${format}?token=${encodeURIComponent(state.adminToken)}`;
  window.open(url, '_blank');
  showToast(`${format.toUpperCase()} belgesi indiriliyor...`, 'success');
}

function downloadAllClubsFile(format) {
  const url = `/api/admin/export/all-clubs/${format}?token=${encodeURIComponent(state.adminToken)}`;
  window.open(url, '_blank');
  showToast(`Tüm kulüplerin ${format.toUpperCase()} belgesi indiriliyor...`, 'success');
}

// ============================================================================
// ÖĞRENCİ LİSTESİ YÜKLEME (#23, #24)
// ============================================================================
function renderRegisteredStudentsUploadTab() {
  const d = state.dashboardData;
  if (!d) return;

  const chk = document.getElementById('chkRequireVerificationQuick');
  if (chk && d.settings) {
    chk.checked = d.settings.requireStudentVerification !== false;
  }

  const countLabel = document.getElementById('registeredStudentsCountLabel');
  if (countLabel) countLabel.textContent = d.allStudents.length;

  const tbody = document.getElementById('registeredStudentsTableBody');
  if (!tbody) return;

  if (d.allStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#64748b;">Sistemde kayıtlı öğrenci bulunmamaktadır.</td></tr>`;
    return;
  }

  tbody.innerHTML = d.allStudents
    .map(
      (s, idx) => `
      <tr>
        <td><strong>${idx + 1}</strong></td>
        <td>${escapeHtml(s.firstName)}</td>
        <td>${escapeHtml(s.lastName)}</td>
        <td><span class="badge badge-gray">${escapeHtml(s.className)}</span></td>
        <td><strong>${escapeHtml(s.studentNo)}</strong></td>
        <td>
          ${
            s.hasSelected
              ? `<span class="badge badge-success">✓ ${escapeHtml(s.clubName)}</span>`
              : `<span class="badge badge-warning">Henüz Seçmedi</span>`
          }
        </td>
        <td style="text-align:right; white-space:nowrap;">
          <button
            class="btn btn-danger btn-sm"
            onclick="handleDeleteStudentRecord('${escapeHtml(s.id)}', '${escapeHtml(s.className)}', '${escapeHtml(s.studentNo)}', '${escapeHtml(s.firstName + ' ' + s.lastName)}')"
          >
            🗑️ Öğrenciyi Sil
          </button>
        </td>
      </tr>
    `
    )
    .join('');
}

function downloadStudentExcelTemplate() {
  window.open(`/api/admin/students/template.xlsx?token=${encodeURIComponent(state.adminToken)}`, '_blank');
}

async function handleExcelFileUpload() {
  const fileInput = document.getElementById('excelFileInput');
  const replaceExisting = document.getElementById('chkReplaceStudents')?.checked || false;

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast('Lütfen önce bir Excel (.xlsx, .xls) veya CSV dosyası seçiniz.', 'warning');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async (evt) => {
    const fileBase64 = evt.target.result;
    const { ok, data } = await apiFetch('/api/admin/students/upload', {
      method: 'POST',
      body: JSON.stringify({ fileBase64, replaceExisting })
    });
    if (ok && data.success) {
      fileInput.value = '';
      state.dashboardData = data.dashboard;
      renderAllAdminViews();
      showToast(data.message, 'success');
    } else {
      showToast(data.message || 'Dosya yüklenemedi.', 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function handleBulkTextPasteUpload() {
  const raw = document.getElementById('bulkPasteStudentsText')?.value || '';
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    showToast('Lütfen eklenecek öğrenci satırlarını yapıştırınız.', 'warning');
    return;
  }

  const rows = [];
  for (const line of lines) {
    const parts = line.split(/[;\t,]+/).map((p) => p.trim());
    if (parts.length >= 4) {
      rows.push({
        Ad: parts[0],
        Soyad: parts[1],
        Sınıf: parts[2],
        'Öğrenci No': parts[3]
      });
    }
  }

  if (rows.length === 0) {
    showToast('Satırlar "Ad; Soyad; Sınıf; Öğrenci No" formatında olmalıdır.', 'error');
    return;
  }

  const { ok, data } = await apiFetch('/api/admin/students/upload', {
    method: 'POST',
    body: JSON.stringify({ rows, replaceExisting: false })
  });

  if (ok && data.success) {
    document.getElementById('bulkPasteStudentsText').value = '';
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'success');
  } else {
    showToast(data.message || 'Öğrenciler eklenemedi.', 'error');
  }
}

async function handleAddSingleStudent(e) {
  e.preventDefault();
  const firstName = document.getElementById('addStFirst').value.trim();
  const lastName = document.getElementById('addStLast').value.trim();
  const className = document.getElementById('addStClass').value.trim();
  const studentNo = document.getElementById('addStNo').value.trim();

  const { ok, data } = await apiFetch('/api/admin/students/add', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, className, studentNo })
  });

  if (ok && data.success) {
    document.getElementById('addStFirst').value = '';
    document.getElementById('addStLast').value = '';
    document.getElementById('addStNo').value = '';
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'success');
  } else {
    showToast(data.message || 'Öğrenci eklenemedi.', 'error');
  }
}

async function toggleRequireVerificationQuick(checked) {
  const { ok, data } = await apiFetch('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ requireStudentVerification: checked })
  });
  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    showToast('Öğrenci kimlik doğrulama kuralı güncellendi.', 'success');
  }
}

// ============================================================================
// YEDEKLEME VE GERİ YÜKLEME (#27) VE AYARLAR (#16)
// ============================================================================
function downloadBackupJson() {
  window.open(`/api/admin/backup/json?token=${encodeURIComponent(state.adminToken)}`, '_blank');
  showToast('JSON sistem yedeği indiriliyor...', 'success');
}

function downloadBackupCsv() {
  window.open(`/api/admin/backup/csv?token=${encodeURIComponent(state.adminToken)}`, '_blank');
  showToast('CSV / Excel yedeği indiriliyor...', 'success');
}

function handleRestoreBackup() {
  const input = document.getElementById('restoreBackupFileInput');
  if (!input || !input.files || input.files.length === 0) {
    showToast('Lütfen geri yüklenecek .json yedek dosyasını seçiniz.', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const backupData = JSON.parse(evt.target.result);
      const { ok, data } = await apiFetch('/api/admin/backup/restore', {
        method: 'POST',
        body: JSON.stringify({ backupData })
      });
      if (ok && data.success) {
        input.value = '';
        state.dashboardData = data.dashboard;
        renderAllAdminViews();
        showToast(data.message, 'success');
      } else {
        showToast(data.message || 'Yedek geri yüklenemedi.', 'error');
      }
    } catch (err) {
      showToast('Geçersiz JSON yedek dosyası!', 'error');
    }
  };
  reader.readAsText(input.files[0], 'utf-8');
}

async function handleResetDemoData() {
  if (!confirm('Tüm verileri ilk kurulumdaki örnek okul verilerine sıfırlamak istediğinize emin misiniz?')) return;
  const { ok, data } = await apiFetch('/api/admin/reset-demo', { method: 'POST' });
  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    renderAllAdminViews();
    showToast(data.message, 'success');
  }
}

function populateSettingsForm() {
  const s = state.dashboardData?.settings;
  if (!s) return;

  document.getElementById('setSchoolName').value = s.schoolName || '';
  document.getElementById('setAcademicYear').value = s.academicYear || '';
  document.getElementById('setSelectionStart').value = (s.selectionStart || '').slice(0, 16);
  document.getElementById('setSelectionEnd').value = (s.selectionEnd || '').slice(0, 16);
  document.getElementById('setIsSelectionOpen').checked = s.isSelectionOpen !== false;
  document.getElementById('setRequireVerification').checked = s.requireStudentVerification !== false;
  document.getElementById('setAdminUsername').value = s.adminUsername || 'admin';
  document.getElementById('setAdminPassword').value = s.adminPassword || '123456';
  document.getElementById('setCustomPublicUrl').value = s.customPublicUrl || '';
  const smsTplEl = document.getElementById('setSmsAnnouncementTemplate');
  if (smsTplEl) {
    smsTplEl.value = s.smsAnnouncementTemplate || DEFAULT_SMS_ANNOUNCEMENT_TEMPLATE;
  }

  if (s.cloudSync) {
    document.getElementById('setCloudEnabled').checked = !!s.cloudSync.enabled;
    document.getElementById('setCloudProvider').value = s.cloudSync.provider || 'firebase';
    document.getElementById('setCloudUrl').value =
      s.cloudSync.firebaseDatabaseUrl || s.cloudSync.supabaseUrl || '';
    document.getElementById('setCloudKey').value = s.cloudSync.supabaseKey || '';
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const provider = document.getElementById('setCloudProvider').value;
  const cloudUrl = document.getElementById('setCloudUrl').value.trim();
  const smsTplEl = document.getElementById('setSmsAnnouncementTemplate');

  const payload = {
    schoolName: document.getElementById('setSchoolName').value.trim(),
    academicYear: document.getElementById('setAcademicYear').value.trim(),
    selectionStart: document.getElementById('setSelectionStart').value,
    selectionEnd: document.getElementById('setSelectionEnd').value,
    isSelectionOpen: document.getElementById('setIsSelectionOpen').checked,
    requireStudentVerification: document.getElementById('setRequireVerification').checked,
    adminUsername: document.getElementById('setAdminUsername').value.trim(),
    adminPassword: document.getElementById('setAdminPassword').value.trim(),
    customPublicUrl: document.getElementById('setCustomPublicUrl').value.trim(),
    smsAnnouncementTemplate: smsTplEl
      ? smsTplEl.value.trim() || DEFAULT_SMS_ANNOUNCEMENT_TEMPLATE
      : undefined,
    cloudSync: {
      enabled: document.getElementById('setCloudEnabled').checked,
      provider,
      firebaseDatabaseUrl: provider === 'firebase' ? cloudUrl : '',
      supabaseUrl: provider === 'supabase' ? cloudUrl : '',
      supabaseKey: document.getElementById('setCloudKey').value.trim()
    }
  };

  const { ok, data } = await apiFetch('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

  if (ok && data.success) {
    state.dashboardData = data.dashboard;
    state.smsEditorInitialized = false;
    renderAllAdminViews();
    await loadPublicConfig();
    showToast('Sistem ayarları başarıyla kaydedildi!', 'success');
  } else {
    showToast(data.message || 'Ayarlar kaydedilemedi.', 'error');
  }
}
