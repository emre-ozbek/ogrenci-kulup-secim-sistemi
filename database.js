const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Türkçe karakter duyarlı büyük harf dönüştürme ve boşluk temizleme
function normalizeTr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('tr-TR');
}

function normalizeClass(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .replace(/[\s\-\/]/g, '')
    .toLocaleUpperCase('tr-TR');
}

function normalizeStudentNo(no) {
  if (no === null || no === undefined) return '';
  const cleaned = String(no).trim();
  if (/^\d+$/.test(cleaned)) {
    return String(parseInt(cleaned, 10));
  }
  return cleaned.toLocaleUpperCase('tr-TR');
}

function formatDateTr(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatDateTimeTr(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function createInitialData() {
  const clubs = [
    {
      id: 'club-satranc',
      name: 'SATRANÇ KULÜBÜ',
      description: 'Stratejik düşünme, analiz yeteneği geliştirme ve okul içi/okullar arası satranç turnuvalarına hazırlık çalışmaları.',
      quota: 20,
      active: true,
      teacher: 'Kemalettin Aydın',
      createdAt: '2026-10-15T09:00:00.000Z'
    },
    {
      id: 'club-robotik',
      name: 'ROBOTİK KODLAMA KULÜBÜ',
      description: 'Algoritma tasarımı, robotik kodlama kitleri, sensör uygulamaları ve teknoloji yarışmalarına proje geliştirme.',
      quota: 20,
      active: true,
      teacher: 'Selin Özkan',
      createdAt: '2026-10-15T09:05:00.000Z'
    },
    {
      id: 'club-muzik',
      name: 'MÜZİK KULÜBÜ',
      description: 'Okul korosu, ritim çalışmaları, enstrüman eğitimi ve belirli gün/haftalarda müzik dinletileri organizasyonu.',
      quota: 20,
      active: true,
      teacher: 'Meltem Aksoy',
      createdAt: '2026-10-15T09:10:00.000Z'
    },
    {
      id: 'club-spor',
      name: 'SPOR KULÜBÜ',
      description: 'Futbol, voleybol, basketbol, masa tenisi, atletizm çalışmaları ve okul spor takımı turnuva organizasyonları.',
      quota: 25,
      active: true,
      teacher: 'Burak Demirci',
      createdAt: '2026-10-15T09:15:00.000Z'
    },
    {
      id: 'club-proje',
      name: 'PROJE VE BİLİM KULÜBÜ',
      description: 'TÜBİTAK bilim fuarları, deneysel araştırmalar, fen ve matematik projeleri geliştirme çalışmaları.',
      quota: 15,
      active: true,
      teacher: 'Dr. Hakan Yıldız',
      createdAt: '2026-10-15T09:20:00.000Z'
    },
    {
      id: 'club-resim',
      name: 'GÖRSEL SANATLAR KULÜBÜ',
      description: 'Resim teknikleri, tuval çalışmaları, el sanatları ve yıl sonu okul sanat sergisi hazırlıkları.',
      quota: 20,
      active: true,
      teacher: 'Pınar Karaca',
      createdAt: '2026-10-15T09:25:00.000Z'
    },
    {
      id: 'club-tiyatro',
      name: 'TİYATRO VE DRAMA KULÜBÜ',
      description: 'Yaratıcı drama, sahne sanatları, diksiyon çalışmaları ve yıl sonu okul tiyatro gösterisi.',
      quota: 15,
      active: true,
      teacher: 'Gökhan Erdem',
      createdAt: '2026-10-15T09:30:00.000Z'
    },
    {
      id: 'club-cevre',
      name: 'ÇEVRE VE DOĞA KULÜBÜ',
      description: 'Sıfır atık projeleri, geri dönüşüm bilinci, okul bahçesi ağaçlandırma ve doğa koruma etkinlikleri.',
      quota: 20,
      active: true,
      teacher: 'Esra Çetin',
      createdAt: '2026-10-15T09:35:00.000Z'
    }
  ];

  const classes = ['5A', '5B', '6A', '6B', '7A', '7B', '8A', '8B'];

  const students = [
    // 6A Sınıfı (Ahmet Yılmaz - 6A - 15 henüz kulüp seçmemiş olarak hazır bekliyor)
    { id: 'st-1', firstName: 'Ahmet', lastName: 'Yılmaz', className: '6A', studentNo: '15' },
    { id: 'st-2', firstName: 'Zeynep', lastName: 'Korkmaz', className: '6A', studentNo: '24' },
    { id: 'st-3', firstName: 'Mustafa', lastName: 'Arslan', className: '6A', studentNo: '31' },
    { id: 'st-4', firstName: 'Elif', lastName: 'Aydın', className: '6A', studentNo: '42' },
    { id: 'st-5', firstName: 'Kerem', lastName: 'Özdemir', className: '6A', studentNo: '58' },
    { id: 'st-6', firstName: 'Defne', lastName: 'Şahin', className: '6A', studentNo: '63' },

    // 6B Sınıfı
    { id: 'st-7', firstName: 'Ayşe', lastName: 'Demir', className: '6B', studentNo: '21' },
    { id: 'st-8', firstName: 'Mehmet', lastName: 'Kaya', className: '6B', studentNo: '23' },
    { id: 'st-9', firstName: 'Caner', lastName: 'Polat', className: '6B', studentNo: '35' },
    { id: 'st-10', firstName: 'Yağmur', lastName: 'Çelik', className: '6B', studentNo: '44' },
    { id: 'st-11', firstName: 'Bora', lastName: 'Koç', className: '6B', studentNo: '52' },

    // 5A Sınıfı
    { id: 'st-12', firstName: 'Ecrin', lastName: 'Yıldırım', className: '5A', studentNo: '10' },
    { id: 'st-13', firstName: 'Yiğit', lastName: 'Öztürk', className: '5A', studentNo: '18' },
    { id: 'st-14', firstName: 'Nehir', lastName: 'Aktaş', className: '5A', studentNo: '27' },
    { id: 'st-15', firstName: 'Kaan', lastName: 'Doğan', className: '5A', studentNo: '33' },
    { id: 'st-16', firstName: 'Azra', lastName: 'Kılıç', className: '5A', studentNo: '49' },

    // 5B Sınıfı
    { id: 'st-17', firstName: 'Mert', lastName: 'Çetin', className: '5B', studentNo: '14' },
    { id: 'st-18', firstName: 'Beren', lastName: 'Kara', className: '5B', studentNo: '22' },
    { id: 'st-19', firstName: 'Emir', lastName: 'Şen', className: '5B', studentNo: '36' },
    { id: 'st-20', firstName: 'İrem', lastName: 'Taş', className: '5B', studentNo: '41' },

    // 7A Sınıfı
    { id: 'st-21', firstName: 'Mehmet', lastName: 'Kaya', className: '7A', studentNo: '8' },
    { id: 'st-22', firstName: 'Ayşe', lastName: 'Demir', className: '7A', studentNo: '12' },
    { id: 'st-23', firstName: 'Furkan', lastName: 'Güler', className: '7A', studentNo: '19' },
    { id: 'st-24', firstName: 'Sude', lastName: 'Bozkurt', className: '7A', studentNo: '28' },
    { id: 'st-25', firstName: 'Arda', lastName: 'Yavuz', className: '7A', studentNo: '39' },

    // 7B Sınıfı
    { id: 'st-26', firstName: 'Ceren', lastName: 'Aslan', className: '7B', studentNo: '11' },
    { id: 'st-27', firstName: 'Burak', lastName: 'Tekin', className: '7B', studentNo: '17' },
    { id: 'st-28', firstName: 'Melisa', lastName: 'Ünal', className: '7B', studentNo: '25' },
    { id: 'st-29', firstName: 'Onur', lastName: 'Bulut', className: '7B', studentNo: '34' },

    // 8A Sınıfı
    { id: 'st-30', firstName: 'Selim', lastName: 'Avcı', className: '8A', studentNo: '9' },
    { id: 'st-31', firstName: 'Duru', lastName: 'Güneş', className: '8A', studentNo: '16' },
    { id: 'st-32', firstName: 'Efe', lastName: 'Kaplan', className: '8A', studentNo: '29' },
    { id: 'st-33', firstName: 'Zehra', lastName: 'Sarı', className: '8A', studentNo: '45' },

    // 8B Sınıfı
    { id: 'st-34', firstName: 'Tuna', lastName: 'Yüksel', className: '8B', studentNo: '13' },
    { id: 'st-35', firstName: 'Eylül', lastName: 'Acar', className: '8B', studentNo: '20' },
    { id: 'st-36', firstName: 'Barış', lastName: 'Kurt', className: '8B', studentNo: '32' },
    { id: 'st-37', firstName: 'Aslı', lastName: 'Erdoğan', className: '8B', studentNo: '48' }
  ];

  // Başlangıçta 3 tercihli örnek havuz kayıtları:
  // Satranç (5 kişi 1. tercih -> Açılır), Spor (4 kişi 1. tercih -> Açılır), Robotik (4 kişi 1. tercih -> Açılır), Müzik (4 kişi 1. tercih -> Açılır)
  // Tiyatro (Sadece 2 kişi 1. tercih -> <=3 olduğu için AÇILMAZ, bu öğrenciler otomatik 2. tercihlerine yerleşir!)
  // Çevre (Sadece 1 kişi 1. tercih -> <=3 olduğu için AÇILMAZ, 2. tercihi Tiyatro da açılmadığı için otomatik 3. tercihine yerleşir!)
  const selections = [
    // SATRANÇ 1. Tercih (5 öğrenci -> Kulüp Açılır)
    {
      id: 'sel-1',
      firstName: 'Ayşe',
      lastName: 'Demir',
      className: '6B',
      studentNo: '21',
      choices: ['club-satranc', 'club-robotik', 'club-muzik'],
      selectedAt: '2026-10-21T10:15:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-2',
      firstName: 'Mehmet',
      lastName: 'Kaya',
      className: '7A',
      studentNo: '8',
      choices: ['club-satranc', 'club-spor', 'club-proje'],
      selectedAt: '2026-10-21T11:20:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-3',
      firstName: 'Selim',
      lastName: 'Avcı',
      className: '8A',
      studentNo: '9',
      choices: ['club-satranc', 'club-robotik', 'club-spor'],
      selectedAt: '2026-10-21T11:45:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-4',
      firstName: 'Kerem',
      lastName: 'Özdemir',
      className: '6A',
      studentNo: '58',
      choices: ['club-satranc', 'club-muzik', 'club-resim'],
      selectedAt: '2026-10-21T12:00:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-5',
      firstName: 'Ceren',
      lastName: 'Aslan',
      className: '7B',
      studentNo: '11',
      choices: ['club-satranc', 'club-proje', 'club-muzik'],
      selectedAt: '2026-10-21T12:15:00.000Z',
      dateFormatted: '21.10.2026'
    },

    // SPOR 1. Tercih (4 öğrenci -> Kulüp Açılır)
    {
      id: 'sel-6',
      firstName: 'Mustafa',
      lastName: 'Arslan',
      className: '6A',
      studentNo: '31',
      choices: ['club-spor', 'club-satranc', 'club-robotik'],
      selectedAt: '2026-10-21T13:10:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-7',
      firstName: 'Mert',
      lastName: 'Çetin',
      className: '5B',
      studentNo: '14',
      choices: ['club-spor', 'club-muzik', 'club-satranc'],
      selectedAt: '2026-10-21T13:30:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-8',
      firstName: 'Furkan',
      lastName: 'Güler',
      className: '7A',
      studentNo: '19',
      choices: ['club-spor', 'club-robotik', 'club-proje'],
      selectedAt: '2026-10-21T13:50:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-9',
      firstName: 'Tuna',
      lastName: 'Yüksel',
      className: '8B',
      studentNo: '13',
      choices: ['club-spor', 'club-satranc', 'club-muzik'],
      selectedAt: '2026-10-21T14:05:00.000Z',
      dateFormatted: '21.10.2026'
    },

    // ROBOTİK KODLAMA 1. Tercih (4 öğrenci -> Kulüp Açılır)
    {
      id: 'sel-10',
      firstName: 'Elif',
      lastName: 'Aydın',
      className: '6A',
      studentNo: '42',
      choices: ['club-robotik', 'club-satranc', 'club-muzik'],
      selectedAt: '2026-10-21T14:20:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-11',
      firstName: 'Yiğit',
      lastName: 'Öztürk',
      className: '5A',
      studentNo: '18',
      choices: ['club-robotik', 'club-spor', 'club-satranc'],
      selectedAt: '2026-10-21T14:40:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-12',
      firstName: 'Burak',
      lastName: 'Tekin',
      className: '7B',
      studentNo: '17',
      choices: ['club-robotik', 'club-proje', 'club-spor'],
      selectedAt: '2026-10-21T15:00:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-13',
      firstName: 'Caner',
      lastName: 'Polat',
      className: '6B',
      studentNo: '35',
      choices: ['club-robotik', 'club-satranc', 'club-spor'],
      selectedAt: '2026-10-21T15:15:00.000Z',
      dateFormatted: '21.10.2026'
    },

    // MÜZİK 1. Tercih (4 öğrenci -> Kulüp Açılır)
    {
      id: 'sel-14',
      firstName: 'Zeynep',
      lastName: 'Korkmaz',
      className: '6A',
      studentNo: '24',
      choices: ['club-muzik', 'club-resim', 'club-satranc'],
      selectedAt: '2026-10-21T15:30:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-15',
      firstName: 'Beren',
      lastName: 'Kara',
      className: '5B',
      studentNo: '22',
      choices: ['club-muzik', 'club-satranc', 'club-spor'],
      selectedAt: '2026-10-21T15:45:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-16',
      firstName: 'Ecrin',
      lastName: 'Yıldırım',
      className: '5A',
      studentNo: '10',
      choices: ['club-muzik', 'club-robotik', 'club-satranc'],
      selectedAt: '2026-10-21T16:00:00.000Z',
      dateFormatted: '21.10.2026'
    },
    {
      id: 'sel-17',
      firstName: 'Eylül',
      lastName: 'Acar',
      className: '8B',
      studentNo: '20',
      choices: ['club-muzik', 'club-spor', 'club-robotik'],
      selectedAt: '2026-10-21T16:15:00.000Z',
      dateFormatted: '21.10.2026'
    },

    // TİYATRO 1. Tercih (Sadece 2 öğrenci seçmiş -> <=3 olduğu için Tiyatro AÇILMAZ, 2. tercihlerine atanırlar!)
    {
      id: 'sel-18',
      firstName: 'Nehir',
      lastName: 'Aktaş',
      className: '5A',
      studentNo: '27',
      choices: ['club-tiyatro', 'club-muzik', 'club-satranc'],
      selectedAt: '2026-10-22T09:10:00.000Z',
      dateFormatted: '22.10.2026'
    },
    {
      id: 'sel-19',
      firstName: 'Duru',
      lastName: 'Güneş',
      className: '8A',
      studentNo: '16',
      choices: ['club-tiyatro', 'club-robotik', 'club-spor'],
      selectedAt: '2026-10-22T09:30:00.000Z',
      dateFormatted: '22.10.2026'
    },

    // ÇEVRE 1. Tercih (1 öğrenci) ve 2. Tercih TİYATRO (Açılmadı) -> Otomatik 3. Tercihi olan SPOR KULÜBÜ'ne yerleşir!
    {
      id: 'sel-20',
      firstName: 'Sude',
      lastName: 'Bozkurt',
      className: '7A',
      studentNo: '28',
      choices: ['club-cevre', 'club-tiyatro', 'club-spor'],
      selectedAt: '2026-10-22T10:00:00.000Z',
      dateFormatted: '22.10.2026'
    }
  ];

  const settings = {
    schoolName: 'Özel Balıkesir Bahçeşehir Koleji',
    academicYear: '2026 - 2027 Eğitim Öğretim Yılı',
    principalName: 'Mustafa Kemal Öztürk',
    selectionStart: '2026-10-20T08:00',
    selectionEnd: '2026-10-30T23:59',
    isSelectionOpen: true,
    requireStudentVerification: true,
    minCloseThreshold: 3, // 3 öğrenci ve az ise o kulüp açılmaz (En az 4 öğrenci gerekir)
    requiredChoiceCount: 3, // Öğrenciler 1., 2. ve 3. tercih olmak üzere 3 kulüp seçer
    adminUsername: 'admin',
    adminPassword: '123456',
    customPublicUrl: '',
    smsAnnouncementTemplate:
      '{OKUL_ADI}: Değerli velimiz ve öğrencimiz, öğrenci kulüp seçiminizi aşağıdaki resmi okul bağlantısına tıklayarak gerçekleştirebilirsiniz: {LINK}',
    cloudSync: {
      enabled: false,
      provider: 'firebase',
      firebaseDatabaseUrl: '',
      supabaseUrl: '',
      supabaseKey: '',
      lastSyncedAt: null
    }
  };

  return {
    settings,
    classes,
    clubs,
    students,
    selections
  };
}

class Database {
  constructor() {
    this.data = null;
    this.init();
  }

  init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      this.data = createInitialData();
      this.syncChoiceNames();
      this.save();
    } else {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        const initial = createInitialData();
        if (!this.data.settings) this.data.settings = initial.settings;
        if (this.data.settings.minCloseThreshold === undefined) {
          this.data.settings.minCloseThreshold = 3;
        }
        if (this.data.settings.requiredChoiceCount === undefined) {
          this.data.settings.requiredChoiceCount = 3;
        }
        if (this.data.settings.smsAnnouncementTemplate === undefined) {
          this.data.settings.smsAnnouncementTemplate = initial.settings.smsAnnouncementTemplate;
        }
        if (!this.data.classes) this.data.classes = initial.classes;
        if (!this.data.clubs) this.data.clubs = initial.clubs;
        if (!this.data.students) this.data.students = initial.students;
        if (!this.data.selections) this.data.selections = initial.selections;

        // Mevcut tek tercihli eski kayıtlar varsa 3 tercihli yapıya uyarla
        this.migrateLegacySelections();
        this.syncChoiceNames();
        this.save();
      } catch (err) {
        console.error('Veritabanı okuma hatası, varsayılan veriler yükleniyor:', err);
        this.data = createInitialData();
        this.syncChoiceNames();
        this.save();
      }
    }
  }

  // Eski tekli seçim kayıtlarını 3 tercihli havuz yapısına otomatik yükselt
  migrateLegacySelections() {
    const activeClubIds = this.data.clubs.filter((c) => c.active !== false).map((c) => c.id);
    const initialSelections = createInitialData().selections;

    this.data.selections.forEach((sel, idx) => {
      if (!Array.isArray(sel.choices) || sel.choices.length === 0) {
        const matchingInitial = initialSelections.find(
          (is) => is.className === sel.className && is.studentNo === sel.studentNo
        );
        if (matchingInitial && Array.isArray(matchingInitial.choices)) {
          sel.choices = [...matchingInitial.choices];
        } else {
          const primary = sel.clubId || activeClubIds[0];
          const fallbacks = activeClubIds.filter((id) => id !== primary);
          sel.choices = [
            primary,
            fallbacks[idx % Math.max(1, fallbacks.length)] || primary,
            fallbacks[(idx + 1) % Math.max(1, fallbacks.length)] || primary
          ];
        }
      }
      if (!sel.placementStatus) {
        sel.placementStatus = sel.clubId ? 'PLACED' : 'PENDING';
      }
    });
  }

  // Tercih edilen kulüplerin güncel isimlerini senkronize et (Yerleştirme yapmadan)
  syncChoiceNames() {
    const clubMap = new Map();
    for (const c of this.data.clubs) {
      clubMap.set(c.id, c);
    }
    for (const sel of this.data.selections) {
      if (!Array.isArray(sel.choices) || sel.choices.length === 0) {
        sel.choices = sel.clubId ? [sel.clubId] : [];
      }
      sel.choiceNames = sel.choices.map((cid) => clubMap.get(cid)?.name || 'Bilinmeyen Kulüp');
      if (sel.clubId && clubMap.has(sel.clubId)) {
        sel.clubName = clubMap.get(sel.clubId).name;
      }
    }
  }

  // Tüm öğrencilerin kulüp atamalarını sıfırlayıp sadece 3 tercihleriyle havuzda bekleyen duruma çekme
  resetPoolPlacementsToPending() {
    this.syncChoiceNames();
    for (const sel of this.data.selections) {
      sel.clubId = '';
      sel.clubName = '';
      sel.assignedChoiceOrder = null;
      sel.placementStatus = 'PENDING';
      sel.placementReason = 'Havuzda bekliyor (Otomatik Dağıtma bekleniyor).';
      sel.isManualAssignment = false;
    }
  }

  // ============================================================================
  // OTOMATİK DAĞITMA ALGORİTMASI (1. -> 2. -> 3. TERCİH VE <= 3 ÖĞRENCİ KURALI)
  // ============================================================================
  recalculatePoolPlacements() {
    const minThreshold = Number(this.data.settings?.minCloseThreshold ?? 3); // 3 ve az ise açılmaz
    const clubMap = new Map();
    for (const c of this.data.clubs) {
      clubMap.set(c.id, c);
    }

    // Seçimleri başvuru sırasına (kronolojik) göre sırala
    const orderedSelections = [...this.data.selections].sort(
      (a, b) => new Date(a.selectedAt || 0) - new Date(b.selectedAt || 0)
    );

    // Her öğrencinin tercih isimlerini güncelle
    for (const sel of orderedSelections) {
      if (!Array.isArray(sel.choices) || sel.choices.length === 0) {
        sel.choices = sel.clubId ? [sel.clubId] : [];
      }
      sel.choiceNames = sel.choices.map((cid) => clubMap.get(cid)?.name || 'Bilinmeyen Kulüp');
    }

    // Tur 1: Her öğrenciyi (yönetici manuel kilidi yoksa) kontenjan dahilinde 1. tercihine yerleştir
    const clubCountsRound1 = {};
    const tempAssigned = new Map();

    for (const sel of orderedSelections) {
      if (sel.isManualAssignment && sel.clubId && clubMap.has(sel.clubId)) {
        clubCountsRound1[sel.clubId] = (clubCountsRound1[sel.clubId] || 0) + 1;
        tempAssigned.set(sel.id, { clubId: sel.clubId, order: 0, reason: 'Yönetici tarafından atandı.' });
        continue;
      }

      const c1 = sel.choices[0];
      const club1 = clubMap.get(c1);
      if (club1 && club1.active !== false && (clubCountsRound1[c1] || 0) < (Number(club1.quota) || 20)) {
        clubCountsRound1[c1] = (clubCountsRound1[c1] || 0) + 1;
        tempAssigned.set(sel.id, {
          clubId: c1,
          order: 1,
          reason: '1. tercihine yerleşti.'
        });
      } else {
        // 1. tercihin kontenjanı dolmuşsa 2. tercihi dene
        const c2 = sel.choices[1];
        const club2 = clubMap.get(c2);
        if (club2 && club2.active !== false && (clubCountsRound1[c2] || 0) < (Number(club2.quota) || 20)) {
          clubCountsRound1[c2] = (clubCountsRound1[c2] || 0) + 1;
          tempAssigned.set(sel.id, {
            clubId: c2,
            order: 2,
            reason: '1. tercih kontenjanı dolu olduğu için 2. tercihine yerleşti.'
          });
        } else {
          const c3 = sel.choices[2] || c2 || c1;
          clubCountsRound1[c3] = (clubCountsRound1[c3] || 0) + 1;
          tempAssigned.set(sel.id, {
            clubId: c3,
            order: 3,
            reason: '1. ve 2. tercih kontenjanı dolu olduğu için 3. tercihine yerleşti.'
          });
        }
      }
    }

    // Tur 2: 3 ve daha az öğrencisi olan (<= minThreshold) kulüpler AÇILMAZ!
    // Bu kulüplerdeki öğrenciler 2. tercihlerine aktarılır.
    const closedClubsRound1 = new Set();
    for (const c of this.data.clubs) {
      const cnt = clubCountsRound1[c.id] || 0;
      if (cnt <= minThreshold) {
        closedClubsRound1.add(c.id);
      }
    }

    // Açılan kulüplerdeki mevcut öğrenci sayılarını koru
    const clubCountsRound2 = {};
    for (const [cid, cnt] of Object.entries(clubCountsRound1)) {
      if (!closedClubsRound1.has(cid)) {
        clubCountsRound2[cid] = cnt;
      }
    }

    // 1. tercihi açılmayan (<= 3 öğrenci olan) öğrencileri 2. tercihlerine ata
    for (const sel of orderedSelections) {
      if (sel.isManualAssignment) continue;
      const current = tempAssigned.get(sel.id);
      if (current && closedClubsRound1.has(current.clubId)) {
        const c2 = sel.choices[1] || sel.choices[0];
        const club2 = clubMap.get(c2);
        if (club2 && club2.active !== false && (clubCountsRound2[c2] || 0) < (Number(club2.quota) || 20)) {
          clubCountsRound2[c2] = (clubCountsRound2[c2] || 0) + 1;
          tempAssigned.set(sel.id, {
            clubId: c2,
            order: 2,
            reason: `1. tercihi (${clubMap.get(sel.choices[0])?.name || ''} — ≤${minThreshold} öğrenci) açılmadığı için 2. tercihine atanmıştır.`
          });
        } else {
          // 2. tercih kontenjanı doluysa doğrudan 3. tercihe
          const c3 = sel.choices[2] || c2 || sel.choices[0];
          clubCountsRound2[c3] = (clubCountsRound2[c3] || 0) + 1;
          tempAssigned.set(sel.id, {
            clubId: c3,
            order: 3,
            reason: `1. tercihi açılmadığı ve 2. tercihi dolu olduğu için 3. tercihine kaydedilmiştir.`
          });
        }
      }
    }

    // Tur 3: 2. tercih kulübü de 3 ve daha az öğrencide kaldıysa (açılmazsa), öğrenciyi 3. tercihine kaydet!
    const closedClubsRound2 = new Set();
    for (const c of this.data.clubs) {
      const cnt = clubCountsRound2[c.id] || 0;
      if (cnt <= minThreshold) {
        closedClubsRound2.add(c.id);
      }
    }

    const finalCounts = { ...clubCountsRound2 };
    for (const sel of orderedSelections) {
      if (sel.isManualAssignment) continue;
      const current = tempAssigned.get(sel.id);
      if (current && current.order === 2 && closedClubsRound2.has(current.clubId)) {
        // 2. tercihinden düş, 3. tercihine kesin kaydet
        finalCounts[current.clubId] = Math.max(0, (finalCounts[current.clubId] || 1) - 1);
        const c3 = sel.choices[2] || sel.choices[1] || sel.choices[0];
        finalCounts[c3] = (finalCounts[c3] || 0) + 1;
        tempAssigned.set(sel.id, {
          clubId: c3,
          order: 3,
          reason: `1. ve 2. tercih edilen kulüpler (≤${minThreshold} öğrenci) açılmadığı için 3. tercihine kaydedilmiştir.`
        });
      }
    }

    // Sonuçları selection nesnelerine işle
    for (const sel of this.data.selections) {
      const assigned = tempAssigned.get(sel.id);
      if (assigned) {
        const assignedClub = clubMap.get(assigned.clubId);
        sel.clubId = assigned.clubId;
        sel.clubName = assignedClub ? assignedClub.name : sel.clubName;
        sel.assignedChoiceOrder = assigned.order;
        sel.placementStatus = 'PLACED';
        sel.placementReason = assigned.reason;
      }
    }
  }

  save() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);

    this.syncToCloudAsync().catch((err) => {
      console.warn('Bulut senkronizasyon uyarısı:', err.message);
    });
  }

  async syncToCloudAsync() {
    const cs = this.data?.settings?.cloudSync;
    if (!cs || !cs.enabled) return;

    if (cs.provider === 'firebase' && cs.firebaseDatabaseUrl) {
      const baseUrl = cs.firebaseDatabaseUrl.replace(/\/+$/, '');
      const url = `${baseUrl}/okul_kulup_sistemi.json`;
      const payload = {
        settings: {
          ...this.data.settings,
          adminPassword: '***'
        },
        classes: this.data.classes,
        clubs: this.data.clubs,
        students: this.data.students,
        selections: this.data.selections,
        updatedAt: new Date().toISOString()
      };
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      this.data.settings.cloudSync.lastSyncedAt = new Date().toISOString();
    } else if (cs.provider === 'supabase' && cs.supabaseUrl && cs.supabaseKey) {
      const baseUrl = cs.supabaseUrl.replace(/\/+$/, '');
      const payload = {
        id: 'merkez',
        data: {
          classes: this.data.classes,
          clubs: this.data.clubs,
          students: this.data.students,
          selections: this.data.selections
        },
        updated_at: new Date().toISOString()
      };
      await fetch(`${baseUrl}/rest/v1/kulup_veritabani`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cs.supabaseKey,
          'Authorization': `Bearer ${cs.supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });
      this.data.settings.cloudSync.lastSyncedAt = new Date().toISOString();
    }
  }

  checkElectionPeriod() {
    const { isSelectionOpen, selectionStart, selectionEnd } = this.data.settings;
    if (!isSelectionOpen) {
      return {
        active: false,
        reason: 'CLOSED_BY_ADMIN',
        message: 'KULÜP SEÇİM SÜRESİ SONA ERMİŞTİR.'
      };
    }

    const now = new Date();
    if (selectionStart) {
      const start = new Date(selectionStart);
      if (!isNaN(start.getTime()) && now < start) {
        return {
          active: false,
          reason: 'NOT_STARTED_YET',
          message: 'KULÜP SEÇİM SÜRESİ HENÜZ BAŞLAMAMIŞTIR.',
          startFormatted: formatDateTimeTr(selectionStart),
          endFormatted: formatDateTimeTr(selectionEnd)
        };
      }
    }

    if (selectionEnd) {
      const end = new Date(selectionEnd);
      if (!isNaN(end.getTime()) && now > end) {
        return {
          active: false,
          reason: 'EXPIRED',
          message: 'KULÜP SEÇİM SÜRESİ SONA ERMİŞTİR.',
          startFormatted: formatDateTimeTr(selectionStart),
          endFormatted: formatDateTimeTr(selectionEnd)
        };
      }
    }

    return {
      active: true,
      startFormatted: formatDateTimeTr(selectionStart),
      endFormatted: formatDateTimeTr(selectionEnd)
    };
  }

  // Kulüp istatistiklerini ve 1./2./3. tercih havuz sayılarını hesapla
  getClubsWithStats(onlyActive = false) {
    const minThreshold = Number(this.data.settings?.minCloseThreshold ?? 3);
    const assignedCounts = {};
    const choice1Counts = {};
    const choice2Counts = {};
    const choice3Counts = {};

    for (const sel of this.data.selections) {
      if (sel.clubId) {
        assignedCounts[sel.clubId] = (assignedCounts[sel.clubId] || 0) + 1;
      }
      if (Array.isArray(sel.choices)) {
        if (sel.choices[0]) choice1Counts[sel.choices[0]] = (choice1Counts[sel.choices[0]] || 0) + 1;
        if (sel.choices[1]) choice2Counts[sel.choices[1]] = (choice2Counts[sel.choices[1]] || 0) + 1;
        if (sel.choices[2]) choice3Counts[sel.choices[2]] = (choice3Counts[sel.choices[2]] || 0) + 1;
      }
    }

    let list = this.data.clubs.map((c) => {
      const filled = assignedCounts[c.id] || 0;
      const c1Count = choice1Counts[c.id] || 0;
      const c2Count = choice2Counts[c.id] || 0;
      const c3Count = choice3Counts[c.id] || 0;
      const quota = Number(c.quota) || 0;
      const available = Math.max(0, quota - filled);
      const isFull = filled >= quota;
      const isOpenedByMinRule = filled > minThreshold; // > 3 (en az 4 öğrenci) ise açılır

      return {
        ...c,
        quota,
        filled,
        available,
        isFull,
        choice1Count: c1Count,
        choice2Count: c2Count,
        choice3Count: c3Count,
        minRequiredToOpen: minThreshold + 1,
        isOpenedByMinRule
      };
    });

    if (onlyActive) {
      list = list.filter((c) => c.active !== false);
    }
    return list;
  }

  verifyStudent({ firstName, lastName, className, studentNo }) {
    const normFirst = normalizeTr(firstName);
    const normLast = normalizeTr(lastName);
    const normClass = normalizeClass(className);
    const normNo = normalizeStudentNo(studentNo);

    if (!normFirst || !normLast || !normClass || !normNo) {
      return {
        verified: false,
        errorCode: 'MISSING_FIELDS',
        message: 'Lütfen Ad, Soyad, Sınıf ve Öğrenci Numarası alanlarını eksiksiz doldurunuz.'
      };
    }

    let matchedRegisteredStudent = null;
    if (this.data.settings.requireStudentVerification && this.data.students.length > 0) {
      const byClassAndNo = this.data.students.find(
        (s) =>
          normalizeClass(s.className) === normClass &&
          normalizeStudentNo(s.studentNo) === normNo
      );

      if (!byClassAndNo) {
        return {
          verified: false,
          errorCode: 'NOT_MATCHED',
          message: 'Girmiş olduğunuz bilgiler sistemde kayıtlı öğrenci bilgileriyle eşleşmemektedir. Lütfen bilgilerinizi kontrol ediniz.'
        };
      }

      const regFirst = normalizeTr(byClassAndNo.firstName);
      const regLast = normalizeTr(byClassAndNo.lastName);

      if (regFirst !== normFirst || regLast !== normLast) {
        return {
          verified: false,
          errorCode: 'NAME_MISMATCH',
          message: 'Girmiş olduğunuz bilgiler sistemde kayıtlı öğrenci bilgileriyle eşleşmemektedir. Lütfen bilgilerinizi kontrol ediniz.'
        };
      }

      matchedRegisteredStudent = byClassAndNo;
    }

    const existingSelection = this.data.selections.find(
      (sel) =>
        normalizeClass(sel.className) === normClass &&
        normalizeStudentNo(sel.studentNo) === normNo
    );

    if (existingSelection) {
      return {
        verified: true,
        alreadySelected: true,
        errorCode: 'ALREADY_SELECTED',
        message: 'Bu öğrenci için daha önce kulüp seçimi yapılmıştır.',
        selection: {
          firstName: existingSelection.firstName,
          lastName: existingSelection.lastName,
          className: existingSelection.className,
          studentNo: existingSelection.studentNo,
          clubName: existingSelection.clubName,
          choiceNames: existingSelection.choiceNames || [existingSelection.clubName],
          assignedChoiceOrder: existingSelection.assignedChoiceOrder || 1,
          placementReason: existingSelection.placementReason || '',
          dateFormatted: existingSelection.dateFormatted || formatDateTr(existingSelection.selectedAt)
        }
      };
    }

    return {
      verified: true,
      alreadySelected: false,
      message: 'Öğrenciniz doğrulandı.',
      student: matchedRegisteredStudent
        ? {
            firstName: matchedRegisteredStudent.firstName.trim(),
            lastName: matchedRegisteredStudent.lastName.trim(),
            className: normalizeClass(matchedRegisteredStudent.className),
            studentNo: normalizeStudentNo(matchedRegisteredStudent.studentNo)
          }
        : {
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            className: normClass,
            studentNo: normNo
          }
    };
  }

  // Öğrenci 3 kulüp tercihini kaydetme ve havuz yerleştirmesini çalıştırma
  submitSelection({ firstName, lastName, className, studentNo, clubIds, clubId }) {
    const period = this.checkElectionPeriod();
    if (!period.active) {
      return {
        success: false,
        errorCode: period.reason,
        message: period.message
      };
    }

    const verification = this.verifyStudent({ firstName, lastName, className, studentNo });
    if (!verification.verified) {
      return {
        success: false,
        errorCode: verification.errorCode,
        message: verification.message
      };
    }

    if (verification.alreadySelected) {
      return {
        success: false,
        errorCode: 'ALREADY_SELECTED',
        message: 'Bu öğrenci için daha önce kulüp seçimi yapılmıştır.',
        selection: verification.selection
      };
    }

    // 3 tercih listesini al (veya tek clubId gönderildiyse diziye çevir)
    let rawChoices = Array.isArray(clubIds) && clubIds.length > 0 ? clubIds : clubId ? [clubId] : [];
    // Tekrarlanan tercihleri temizle
    const uniqueChoices = [];
    for (const cid of rawChoices) {
      if (cid && !uniqueChoices.includes(cid)) {
        uniqueChoices.push(cid);
      }
    }

    const activeClubs = this.getClubsWithStats(true);
    const requiredCount = Math.min(3, activeClubs.length);

    if (Array.isArray(clubIds) && uniqueChoices.length < requiredCount) {
      return {
        success: false,
        errorCode: 'INSUFFICIENT_CHOICES',
        message: `Lütfen sırasıyla 1., 2. ve 3. kulüp tercihlerinizin tamamını (${requiredCount} farklı kulüp) seçiniz.`
      };
    }

    // Eğer tek clubId ile (eski API çağrısı) gelmişse diğer tercihleri tamamla
    while (uniqueChoices.length < requiredCount) {
      const nextClub = activeClubs.find((c) => !uniqueChoices.includes(c.id) && !c.isFull);
      if (nextClub) uniqueChoices.push(nextClub.id);
      else break;
    }

    // Seçilen kulüplerin geçerliliğini ve kontenjanını kontrol et
    const selectedClubObjs = [];
    for (let i = 0; i < uniqueChoices.length; i++) {
      const c = activeClubs.find((item) => item.id === uniqueChoices[i]);
      if (!c) {
        return {
          success: false,
          errorCode: 'CLUB_NOT_FOUND',
          message: `${i + 1}. tercihiniz olan kulüp bulunamadı veya aktif değil.`
        };
      }
      if (i === 0 && (c.isFull || c.available <= 0)) {
        return {
          success: false,
          errorCode: 'QUOTA_FULL',
          message: 'Üzgünüz, 1. tercihiniz olan kulübün kontenjanı dolmuştur. Lütfen başka bir kulüp seçiniz.'
        };
      }
      selectedClubObjs.push(c);
    }

    const nowIso = new Date().toISOString();
    const newSelection = {
      id: `sel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      firstName: verification.student.firstName,
      lastName: verification.student.lastName,
      className: verification.student.className,
      studentNo: verification.student.studentNo,
      choices: uniqueChoices,
      choiceNames: selectedClubObjs.map((c) => c.name),
      clubId: '',
      clubName: '',
      assignedChoiceOrder: null,
      placementStatus: 'PENDING',
      placementReason: 'Havuzda bekliyor (Yöneticinin Otomatik Dağıtma işlemi bekleniyor).',
      isManualAssignment: false,
      selectedAt: nowIso,
      dateFormatted: formatDateTr(nowIso)
    };

    const existsInStudents = this.data.students.some(
      (s) =>
        normalizeClass(s.className) === newSelection.className &&
        normalizeStudentNo(s.studentNo) === newSelection.studentNo
    );
    if (!existsInStudents) {
      this.data.students.push({
        id: `st-${Date.now()}`,
        firstName: newSelection.firstName,
        lastName: newSelection.lastName,
        className: newSelection.className,
        studentNo: newSelection.studentNo
      });
    }

    this.data.selections.push(newSelection);

    // Öğrenci tercih yaptığında hemen kulübe yerleştirilmez, havuzda bekler.
    // Yönetici "Otomatik Dağıtma" butonuna bastığında yerleştirme yapılır.
    this.syncChoiceNames();
    this.save();

    const updatedSelection = this.data.selections.find((s) => s.id === newSelection.id) || newSelection;

    return {
      success: true,
      message: 'SEÇİMİ BAŞARIYLA TAMAMLADINIZ',
      selection: updatedSelection
    };
  }

  getAdminDashboardData() {
    this.syncChoiceNames();
    const clubs = this.getClubsWithStats(false);
    const selections = [...this.data.selections].sort(
      (a, b) => new Date(b.selectedAt) - new Date(a.selectedAt)
    );

    const selectedMap = new Map();
    for (const sel of this.data.selections) {
      const key = `${normalizeClass(sel.className)}_${normalizeStudentNo(sel.studentNo)}`;
      selectedMap.set(key, sel);
    }

    const allStudentsMap = new Map();
    for (const st of this.data.students) {
      const normClass = normalizeClass(st.className);
      const normNo = normalizeStudentNo(st.studentNo);
      const key = `${normClass}_${normNo}`;
      const sel = selectedMap.get(key) || null;
      const isPlaced = !!(sel && sel.clubId && sel.placementStatus !== 'PENDING');
      allStudentsMap.set(key, {
        id: st.id,
        firstName: st.firstName.trim(),
        lastName: st.lastName.trim(),
        className: normClass,
        studentNo: normNo,
        hasSelected: !!sel,
        isPlaced,
        placementStatus: sel ? (isPlaced ? 'PLACED' : 'PENDING') : null,
        choices: sel ? sel.choices || [] : [],
        choiceNames: sel ? sel.choiceNames || [] : [],
        clubId: isPlaced ? sel.clubId : '',
        clubName: isPlaced ? sel.clubName : '',
        assignedChoiceOrder: isPlaced ? sel.assignedChoiceOrder || 1 : null,
        placementReason: sel ? sel.placementReason || '' : '',
        isManualAssignment: sel ? !!sel.isManualAssignment : false,
        selectedAt: sel ? sel.selectedAt : null,
        dateFormatted: sel ? sel.dateFormatted : null,
        selectionId: sel ? sel.id : null
      });
    }

    for (const sel of this.data.selections) {
      const normClass = normalizeClass(sel.className);
      const normNo = normalizeStudentNo(sel.studentNo);
      const key = `${normClass}_${normNo}`;
      const isPlaced = !!(sel.clubId && sel.placementStatus !== 'PENDING');
      if (!allStudentsMap.has(key)) {
        allStudentsMap.set(key, {
          id: `auto-${sel.id}`,
          firstName: sel.firstName,
          lastName: sel.lastName,
          className: normClass,
          studentNo: normNo,
          hasSelected: true,
          isPlaced,
          placementStatus: isPlaced ? 'PLACED' : 'PENDING',
          choices: sel.choices || [],
          choiceNames: sel.choiceNames || [],
          clubId: isPlaced ? sel.clubId : '',
          clubName: isPlaced ? sel.clubName : '',
          assignedChoiceOrder: isPlaced ? sel.assignedChoiceOrder || 1 : null,
          placementReason: sel.placementReason || '',
          isManualAssignment: !!sel.isManualAssignment,
          selectedAt: sel.selectedAt,
          dateFormatted: sel.dateFormatted,
          selectionId: sel.id
        });
      }
    }

    const allStudents = Array.from(allStudentsMap.values()).sort((a, b) => {
      if (a.className !== b.className) return a.className.localeCompare(b.className, 'tr');
      return (parseInt(a.studentNo, 10) || 0) - (parseInt(b.studentNo, 10) || 0);
    });

    const unselectedStudents = allStudents.filter((s) => !s.hasSelected);
    const selectedStudentsCount = allStudents.filter((s) => s.hasSelected).length;
    const pendingPoolCount = allStudents.filter((s) => s.hasSelected && !s.isPlaced).length;
    const distributedCount = allStudents.filter((s) => s.hasSelected && s.isPlaced).length;

    const placedIn1st = allStudents.filter((s) => s.isPlaced && s.assignedChoiceOrder === 1).length;
    const placedIn2nd = allStudents.filter((s) => s.isPlaced && s.assignedChoiceOrder === 2).length;
    const placedIn3rd = allStudents.filter((s) => s.isPlaced && s.assignedChoiceOrder === 3).length;
    const openedClubsCount = clubs.filter((c) => c.active && c.isOpenedByMinRule).length;
    const closedUnderMinClubsCount = clubs.filter((c) => c.active && !c.isOpenedByMinRule).length;

    const totalQuota = clubs.reduce((acc, c) => acc + (c.active ? c.quota : 0), 0);

    return {
      stats: {
        totalStudents: allStudents.length,
        selectedCount: selectedStudentsCount,
        pendingPoolCount,
        distributedCount,
        unselectedCount: unselectedStudents.length,
        totalClubs: clubs.length,
        activeClubs: clubs.filter((c) => c.active).length,
        openedClubsCount,
        closedUnderMinClubsCount,
        placedIn1st,
        placedIn2nd,
        placedIn3rd,
        totalQuota,
        remainingQuota: Math.max(0, totalQuota - distributedCount)
      },
      settings: {
        ...this.data.settings
      },
      electionPeriod: this.checkElectionPeriod(),
      classes: this.data.classes,
      clubs,
      selections,
      allStudents,
      unselectedStudents
    };
  }

  resetToDemoData() {
    this.data = createInitialData();
    this.syncChoiceNames();
    this.save();
    return this.getAdminDashboardData();
  }
}

module.exports = {
  Database,
  normalizeTr,
  normalizeClass,
  normalizeStudentNo,
  formatDateTr,
  formatDateTimeTr
};
