// ═══════════════════════════════════════════════════════════════
// PUSULA — WHATSAPP KATMANI (Twilio sürümü)
// Meta Business API yerine Twilio WhatsApp Sandbox/API kullanır
// ═══════════════════════════════════════════════════════════════
const http = require('http');
const querystring = require('querystring');
const { kurumTespitEt, belgeDerinAnalizEt } = require('./pusula-core');

const PORT = process.env.PORT || 3001;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
// Sandbox numarası (kalıcı WhatsApp numarası alınca bu değişecek)
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

function formBodyOku(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => {
      try { resolve(querystring.parse(d)); }
      catch { resolve({}); }
    });
  });
}
function jsonGonder(res, kod, veri) {
  res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(veri));
}

// ─────────────────────────────────────────────────────────────
// Twilio REST API üzerinden WhatsApp mesajı gönderir
// ─────────────────────────────────────────────────────────────
async function mesajGonder(aliciWhatsappNo, metin) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log(`[TEST MODU — gerçek gönderim yok] → ${aliciWhatsappNo}: ${metin}`);
    return { test: true };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const gonderenNo = aliciWhatsappNo.startsWith('whatsapp:') ? aliciWhatsappNo : `whatsapp:${aliciWhatsappNo}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: gonderenNo,
        From: TWILIO_WHATSAPP_FROM,
        Body: metin,
      }),
    });
    return await r.json();
  } catch (e) {
    return { hata: e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Twilio'nun gönderdiği medya URL'sini indirir (Basic Auth gerekli)
// ─────────────────────────────────────────────────────────────
async function medyaIndir(mediaUrl) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { hata: 'Twilio kimlik bilgileri tanımlı değil.' };
  }
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  try {
    const r = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
    const buffer = Buffer.from(await r.arrayBuffer());
    return { basarili: true, base64: buffer.toString('base64'), mimeType: r.headers.get('content-type') };
  } catch (e) {
    return { hata: 'Medya indirme başarısız: ' + e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Gelen bir WhatsApp mesajını işler (Twilio webhook formatı)
// ─────────────────────────────────────────────────────────────
async function mesajIsle(twilioForm) {
  const gonderen = twilioForm.From; // örn. "whatsapp:+491701234567"
  const metin = twilioForm.Body || '';
  const medyaSayisi = parseInt(twilioForm.NumMedia || '0', 10);

  if (medyaSayisi > 0) {
    const mediaUrl = twilioForm.MediaUrl0;
    const medya = await medyaIndir(mediaUrl);
    if (medya.hata) {
      await mesajGonder(gonderen, 'Belgeyi indiremedim, tekrar dener misin? 🙏');
      return;
    }
    const analiz = await belgeDerinAnalizEt({ base64Gorsel: medya.base64, dil: 'tr' });
    await yanitGonderVeIsle(gonderen, analiz);
    return;
  }

  if (metin.trim()) {
    const onFiltre = kurumTespitEt(metin);
    if (!onFiltre.length) {
      await mesajGonder(gonderen, 'Merhaba! Ben Pusula. Sana bir belge (Jobcenter, Familienkasse, Wohngeld vb.) fotoğrafı gönderebilirsin, ne yapman gerektiğini açıklayayım. 📄');
      return;
    }
    const analiz = await belgeDerinAnalizEt({ metin, dil: 'tr' });
    await yanitGonderVeIsle(gonderen, analiz);
    return;
  }

  await mesajGonder(gonderen, 'Şu an sadece metin ve belge/fotoğraf destekliyorum.');
}

async function yanitGonderVeIsle(gonderen, analiz) {
  if (analiz.hata) {
    await mesajGonder(gonderen, `Üzgünüm, şu an analiz edemedim: ${analiz.hata}\n(Bir insan danışmana yönlendirmemi ister misin?)`);
    return;
  }
  const a = analiz.analiz;
  const yanit = `📋 ${a.kurum || 'Kurum tespit edilemedi'}
${a.surec_tipi ? `Süreç: ${a.surec_tipi}\n` : ''}${a.deadline ? `⏰ Tarih: ${a.deadline}\n` : ''}
${a.ozet_tr || ''}

✅ Ne yapmalısın:
${a.onerilen_aksiyon_tr || ''}

${a.aciliyet === 'yuksek' ? '🔴 Bu aciliyeti yüksek bir konu, mümkün olan en kısa sürede işlem yap.' : ''}
⚠️ Bu bir resmi hukuki tavsiye değildir. Emin olmadığın durumlarda bir Migrationsberater'a danış.`;
  await mesajGonder(gonderen, yanit);
}

// ─────────────────────────────────────────────────────────────
// Twilio'ya boş bir TwiML yanıtı döner (webhook'un kabul edildiğini belirtir)
// ─────────────────────────────────────────────────────────────
function twimlBosYanit(res) {
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}

// ─────────────────────────────────────────────────────────────
// HTTP SUNUCU
// ─────────────────────────────────────────────────────────────
function baslatSunucu() {
  http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');

    // Twilio webhook: gelen WhatsApp mesajları buraya POST edilir
    if (req.method === 'POST' && u.pathname === '/webhook') {
      const form = await formBodyOku(req);
      twimlBosYanit(res); // Twilio'ya hemen yanıt ver (timeout olmasın)
      try { await mesajIsle(form); }
      catch (e) { console.error('Mesaj işleme hatası:', e.message); }
      return;
    }

    // Yerel test ucu: gerçek WhatsApp olmadan mesaj simülasyonu
    if (req.method === 'POST' && u.pathname === '/test/mesaj') {
      const body = await formBodyOku(req);
      await mesajIsle({ From: body.from || 'whatsapp:+49000000000', Body: body.metin || '', NumMedia: '0' });
      jsonGonder(res, 200, { islendi: true });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Pusula WhatsApp katmanı (Twilio) çalışıyor. /webhook (Twilio) veya /test/mesaj (yerel test) kullanın.');
  }).listen(PORT, () => console.log(`Pusula WhatsApp katmanı (Twilio) port ${PORT}'da çalışıyor`));
}

if (require.main === module) baslatSunucu();

module.exports = { mesajIsle, mesajGonder, medyaIndir };
