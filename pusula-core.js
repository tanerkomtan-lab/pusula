// ═══════════════════════════════════════════════════════════════
// PUSULA — ÇEKİRDEK BELGE ANALİZ MOTORU (v0.1)
// Almanya'daki göçmen işçiler için bürokrasi + iş bulma AI ajanı
// ═══════════════════════════════════════════════════════════════
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ─────────────────────────────────────────────────────────────
// 1) SÜREÇ BİLGİ TABANI — bilinen kurumlar ve tipik süreçleri
// (MVP için statik; ileride Supabase'e taşınacak)
// ─────────────────────────────────────────────────────────────
const KURUMLAR = {
  jobcenter: {
    ad: 'Jobcenter',
    anahtarKelimeler: ['jobcenter', 'eu-aktiv', 'kooperationsplan', 'sgb ii', 'bürgergeld', 'einstufungstest'],
    tipikSurecler: {
      kooperasyonplani: {
        ad: 'Kooperationsplan (İş birliği planı)',
        aciklama: 'Jobcenter ile aranızda imzalanan, dil kursu/iş arama adımlarını içeren plan.',
        tipikDeadlineGunSayisi: null, // belgeden çıkarılacak
        gerekliAksiyon: 'Belirtilen tarihe kadar Einstufungstest (seviye tespit sınavı) randevusu alın ve kursa kayıt yaptırın.',
      },
      einstufungstest: {
        ad: 'Einstufungstest',
        aciklama: 'Almanca dil seviyenizi belirleyen zorunlu test.',
        gerekliAksiyon: 'Belirtilen tarihte teste katılın; katılmazsanız ödenek kesintisi riski var.',
      },
    },
  },
  familienkasse: {
    ad: 'Familienkasse',
    anahtarKelimeler: ['familienkasse', 'kindergeld', 'kinderzuschlag', 'kindergeldnummer'],
    tipikSurecler: {
      belgeTalebi: {
        ad: 'Ek belge talebi',
        aciklama: 'Kindergeld/Kinderzuschlag başvurunuz için eksik belge istendi.',
        gerekliAksiyon: 'İstenen belgeyi (doğum belgesi, okul kaydı vb.) belirtilen tarihe kadar gönderin.',
      },
    },
  },
  wohngeld: {
    ad: 'Wohngeld (Gemeinde)',
    anahtarKelimeler: ['wohngeld', 'wohngeldstelle', 'mietbescheinigung'],
    tipikSurecler: {
      yenileme: {
        ad: 'Wohngeld yenileme',
        aciklama: 'Konut yardımınızın süresi doluyor, yenileme başvurusu gerekiyor.',
        gerekliAksiyon: 'Güncel kira sözleşmesi ve gelir belgeleriyle yenileme formunu doldurun.',
      },
    },
  },
  auslanderbehorde: {
    ad: 'Ausländerbehörde',
    anahtarKelimeler: ['ausländerbehörde', 'aufenthaltstitel', 'niederlassungserlaubnis', 'fiktionsbescheinigung'],
    tipikSurecler: {
      uzatma: {
        ad: 'Oturum izni uzatma',
        aciklama: 'Aufenthaltstitel (oturum izni) süresi doluyor.',
        gerekliAksiyon: 'Randevu alın; gelir belgesi, kira sözleşmesi ve pasaportla başvurun.',
      },
    },
  },
  agenturfurarbeit: {
    ad: 'Agentur für Arbeit',
    anahtarKelimeler: ['agentur für arbeit', 'alg i', 'arbeitslosengeld', 'arbeitsbescheinigung'],
    tipikSurecler: {
      arbeitsbescheinigung: {
        ad: 'Arbeitsbescheinigung talebi',
        aciklama: 'Eski işvereninizden istenen, ALG I başvurunuz için gerekli hizmet belgesi.',
        gerekliAksiyon: 'İşvereninizden belgeyi talep edin; vermezse Agentur\'a bildirin, onlar zorlayabilir.',
      },
    },
  },
  finanzamt: {
    ad: 'Finanzamt',
    anahtarKelimeler: ['finanzamt', 'steuerbescheid', 'steuererklärung', 'steuer-id', 'elster'],
    tipikSurecler: {
      steuerbescheid: {
        ad: 'Vergi tahakkuk bildirimi (Steuerbescheid)',
        aciklama: 'Yıllık vergi beyanınızın sonucu — ödeme ya da iade çıkabilir.',
        gerekliAksiyon: 'Tutarı kontrol edin; itiraz hakkınız genelde 1 ay (Einspruchsfrist) — bu süreyi kaçırmayın.',
      },
      belgeDuzeltme: {
        ad: 'Kayıt düzeltme talebi (örn. medeni durum)',
        aciklama: 'Finanzamt kayıtlarınızda bir bilgi (evlilik tarihi, adres vb.) hatalı/eksik görünüyor.',
        gerekliAksiyon: 'Doğru belgeyle (evlilik cüzdanı, nüfus kaydı vb.) düzeltme talebi gönderin.',
      },
    },
  },
  krankenkasse: {
    ad: 'Krankenkasse',
    anahtarKelimeler: ['krankenkasse', 'krankenversicherung', 'aok', 'tk', 'barmer', 'dak'],
    tipikSurecler: {
      uyelikBelgesi: {
        ad: 'Sigorta üyelik/kapsam bildirimi',
        aciklama: 'Sağlık sigortası kapsamınız veya katkı payınızla ilgili bir bildirim.',
        gerekliAksiyon: 'Bildirimi okuyun; işveren değişikliği varsa yeni işverene üyelik belgesini iletin.',
      },
    },
  },
  bafogamt: {
    ad: 'BAföG-Amt (Studierendenwerk)',
    anahtarKelimeler: ['bafög', 'bafoeg', 'studierendenwerk', 'ausbildungsförderung'],
    tipikSurecler: {
      basvuruEkBelge: {
        ad: 'BAföG başvurusu ek belge talebi',
        aciklama: 'Öğrenci/Ausbildung desteği başvurunuz için eksik belge (gelir belgesi, okul kaydı vb.) istendi.',
        gerekliAksiyon: 'İstenen belgeyi belirtilen tarihe kadar tamamlayıp gönderin, aksi halde ödeme gecikir.',
      },
    },
  },
  meldebehorde: {
    ad: 'Meldebehörde / Bürgeramt',
    anahtarKelimeler: ['meldebehörde', 'bürgeramt', 'anmeldung', 'ummeldung', 'meldebescheinigung'],
    tipikSurecler: {
      adresBildirimi: {
        ad: 'Adres bildirimi (Ummeldung)',
        aciklama: 'Taşınma sonrası adres değişikliğinin resmî olarak bildirilmesi gerekiyor.',
        gerekliAksiyon: 'Taşındıktan sonra 14 gün içinde Bürgeramt\'a randevu alıp bildirin — gecikme para cezasına yol açabilir.',
      },
    },
  },
};

// ─────────────────────────────────────────────────────────────
// 2) HIZLI KURUM TESPİTİ (AI çağrısından ÖNCE ucuz bir ön-filtre)
// ─────────────────────────────────────────────────────────────
function kurumTespitEt(metin) {
  const kucukMetin = (metin || '').toLowerCase();
  const adaylar = [];
  for (const [id, kurum] of Object.entries(KURUMLAR)) {
    const eslesen = kurum.anahtarKelimeler.filter(k => kucukMetin.includes(k));
    if (eslesen.length) adaylar.push({ id, ad: kurum.ad, eslesenKelimeler: eslesen, skor: eslesen.length });
  }
  adaylar.sort((a, b) => b.skor - a.skor);
  return adaylar;
}

// ─────────────────────────────────────────────────────────────
// 3) TARİH ÇIKARIMI (basit regex — Alman tarih formatları)
// ─────────────────────────────────────────────────────────────
function tarihleriCikar(metin) {
  const desenler = [
    /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g,           // 15.01.2027
    /\b(\d{1,2})\.\s?(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s?(\d{4})\b/gi,
  ];
  const sonuclar = [];
  for (const desen of desenler) {
    let m;
    while ((m = desen.exec(metin))) sonuclar.push(m[0]);
  }
  return [...new Set(sonuclar)];
}

// ─────────────────────────────────────────────────────────────
// 4) AI DERİN ANALİZ — Claude API (görsel veya metin girişi)
// Çıktı: yapılandırılmış JSON (kurum, süreç, deadline, aksiyon, TR açıklama)
// ─────────────────────────────────────────────────────────────
async function belgeDerinAnalizEt({ metin, base64Gorsel, mimeType = 'image/jpeg', dil = 'tr' }) {
  if (!ANTHROPIC_API_KEY) {
    return { hata: 'ANTHROPIC_API_KEY tanımlı değil. Gerçek bir API anahtarı gerekiyor (process.env.ANTHROPIC_API_KEY).' };
  }

  const onFiltre = kurumTespitEt(metin || '');
  const tarihler = tarihleriCikar(metin || '');

  const sistemMesaji = `Sen Pusula uygulamasında Almanya'da yaşayan göçmen işçilere yardımcı olan tarafsız bir bürokrasi asistanısın.
Sana bir resmi belgenin metni (veya görseli) verilecek. Görevin SADECE aşağıdaki JSON formatında, başka hiçbir şey eklemeden yanıt vermek:

{
  "kurum": "Belgenin geldiği kurumun adı",
  "surec_tipi": "Kısa süreç tanımı",
  "deadline": "Varsa tarih, yoksa null",
  "ozet_${dil}": "Kullanıcının ana dilinde (${dil}), 2-3 cümlelik, sade bir açıklama: ne olmuş, ne yapmalı",
  "onerilen_aksiyon_${dil}": "Somut, adım adım ne yapması gerektiği",
  "aciliyet": "dusuk | orta | yuksek",
  "resmi_tavsiye_mi": false
}

ÖNEMLİ KURALLAR:
- Asla kesin hukuki tavsiye verme; "resmi_tavsiye_mi" her zaman false olmalı ve kullanıcıyı gerekirse bir Migrationsberater/avukata yönlendir.
- Emin olmadığın bilgiyi uydurma; belgeden çıkaramadığın alanları null bırak.
- Sadece JSON döndür, markdown kod bloğu (\`\`\`) kullanma, başına veya sonuna hiçbir açıklama ekleme.`;

  const kullaniciIcerik = [];
  if (base64Gorsel) {
    kullaniciIcerik.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Gorsel } });
  }
  kullaniciIcerik.push({
    type: 'text',
    text: `Belge metni (varsa OCR/manuel): ${metin || '(görselden analiz et)'}\n\nÖn-filtre tespiti (yardımcı bilgi, doğrulamadan kullanma): ${JSON.stringify(onFiltre)}\nTespit edilen tarihler: ${JSON.stringify(tarihler)}`,
  });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 600,
        system: sistemMesaji,
        messages: [{ role: 'user', content: kullaniciIcerik }],
      }),
    });
    const veri = await r.json();

    if (veri.error) {
      return { hata: 'API hatası: ' + (veri.error.message || JSON.stringify(veri.error)) };
    }

    let metinYaniti = veri.content?.[0]?.text || '';
    // Claude bazen JSON'u ```json ... ``` bloğu içine sarabiliyor — temizle
    metinYaniti = metinYaniti.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let ayrisik;
    try {
      ayrisik = JSON.parse(metinYaniti);
    } catch {
      return { hata: 'AI yanıtı JSON olarak ayrıştırılamadı', ham: metinYaniti };
    }
    return { basarili: true, analiz: ayrisik, onFiltre, tarihler };
  } catch (e) {
    return { hata: 'API çağrısı başarısız: ' + e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// 5) DİLEKÇE TASLAK ÜRETİCİ (analiz sonucundan basit taslak)
// ─────────────────────────────────────────────────────────────
function dilekceTaslakUret(analiz, kullaniciBilgi) {
  const { kurum, surec_tipi, onerilen_aksiyon_tr } = analiz || {};
  const { ad, adres } = kullaniciBilgi || {};
  return `${ad || '[Ad Soyad]'}
${adres || '[Adres]'}

Konu: ${surec_tipi || '[Süreç]'} hakkında

Sayın Yetkili,

${kurum || '[Kurum]'} tarafından tarafıma iletilen yazı ile ilgili olarak, ${onerilen_aksiyon_tr || '[gerekli aksiyon]'} konusunda gerekli adımları atmak istiyorum.

Bilgilerinize sunarım.

Saygılarımla,
${ad || '[Ad Soyad]'}`;
}

module.exports = { KURUMLAR, kurumTespitEt, tarihleriCikar, belgeDerinAnalizEt, dilekceTaslakUret };
