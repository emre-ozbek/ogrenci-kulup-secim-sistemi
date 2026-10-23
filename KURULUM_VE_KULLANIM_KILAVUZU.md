# 🎓 PROFESYONEL ONLINE ÖĞRENCİ KULÜP SEÇİM VE RAPORLAMA SİSTEMİ

Bu sistem, okul yönetiminin öğrencilere tek bir bağlantı (veya QR kod) göndermesi ve öğrencilerin evlerinden telefon, tablet veya bilgisayarlarıyla bağlanarak merkezi veritabanı üzerinden kulüp seçimi yapabilmesi için geliştirilmiştir.

---

## 🚀 1. SİSTEMİ BAŞLATMA

1. Klasör içerisindeki **`SISTEMI_BASLAT.bat`** dosyasına çift tıklayın (veya terminalde `node server.js` komutunu çalıştırın).
2. Tarayıcınızda otomatik olarak `http://localhost:3000` adresi açılacaktır.

### 🔐 Yönetici Giriş Bilgileri
- **Adres:** `http://localhost:3000/?panel=admin` (veya sağ üstteki **Yönetici Paneli** butonu)
- **Kullanıcı Adı:** `admin`
- **Şifre:** `123456` *(Yönetici Paneli -> Ayarlar bölümünden değiştirilebilir)*

---

## 🌐 2. OKUL DIŞINDAN (EVDEN / TELEFONDAN) ERİŞİM NASIL SAĞLANIR?

Öğrencilerin farklı cihazlardan ve evlerindeki internet bağlantılarından sisteme erişebilmesi için **3 farklı yöntem** hazır olarak sunulmuştur:

### Yöntem A: Tek Tıkla Canlı İnternet Bağlantısı (Kurulumsuz / Anında)
1. **Yönetici Paneli → Dashboard** ekranındaki **"ÖĞRENCİ KULÜP SEÇİM LİNKİ"** bölümünde yer alan **`🌐 Okul Dışı Canlı İnternet Linki Oluştur`** butonuna tıklayın.
2. Sistem saniyeler içerisinde `https://....loca.lt/?mode=student` şeklinde genel bir internet bağlantısı ve buna özel **QR Kod** üretir.
3. **`📋 LİNKİ KOPYALA`** veya **`💬 WhatsApp ile Paylaş`** butonuna basarak linki doğrudan sınıf gruplarına gönderebilirsiniz.

### Yöntem B: Ücretsiz Bulut Sunucuda (Render / Railway / Glitch) 7/24 Yayınlama
Proje içerisinde hazır `render.yaml` ve `package.json` yapılandırması bulunmaktadır. Klasörü GitHub'a yükleyip **Render.com** veya **Railway.app** üzerinde ücretsiz Web Service olarak bağladığınızda okulunuza özel 7/24 açık `https://okul-kulup.onrender.com` adresiniz oluşur.

### Yöntem C: Firebase / Supabase Bulut Veritabanı Senkronizasyonu
**Yönetici Paneli → Ayarlar** sekmesinden ücretsiz **Firebase Realtime Database** veya **Supabase** URL'nizi girdiğinizde tüm kulüp, öğrenci ve seçim verileri bulut veritabanı ile gerçek zamanlı yedeklenir ve senkronize edilir.

---

## 🧪 3. HIZLI TEST İÇİN ÖRNEK ÖĞRENCİ BİLGİLERİ

Sistemde örnek olarak **Cumhuriyet Ortaokulu** kulüpleri ve öğrenci listesi yüklüdür:

- **Henüz Kulüp Seçmemiş Örnek Öğrenciler (Giriş yapıp test edebilirsiniz):**
  - **Ad:** `Ahmet` | **Soyad:** `Yılmaz` | **Sınıf:** `6A` | **Öğrenci No:** `15`
  - **Ad:** `Mehmet` | **Soyad:** `Kaya` | **Sınıf:** `6B` | **Öğrenci No:** `23`
  - **Ad:** `Ayşe` | **Soyad:** `Demir` | **Sınıf:** `7A` | **Öğrenci No:** `12`
  - **Ad:** `Defne` | **Soyad:** `Şahin` | **Sınıf:** `6A` | **Öğrenci No:** `63`

- **Daha Önce Kulüp Seçmiş Örnek Öğrenci (Tek Kulüp Kuralı uyarısını test etmek için):**
  - **Ad:** `Ayşe` | **Soyad:** `Demir` | **Sınıf:** `6B` | **Öğrenci No:** `21` *(Satranç Kulübü'ne kayıtlıdır)*
