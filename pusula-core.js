// ═══════════════════════════════════════════════════════════════
// PUSULA — ERKEN ERİŞİM / BEKLEME LİSTESİ SİTESİ (v0.1)
// Mevcut DeutschTürkHaber Supabase projesine yeni bir tablo ekleyerek
// (ör. "pusula_bekleme_listesi") aynı env değişkenleriyle çalışır.
// ═══════════════════════════════════════════════════════════════
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3002;
const SITE_URL = process.env.PUSULA_SITE_URL || 'https://pusula-app.netlify.app';
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) : null;

function bodyOku(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}
function jsonGonder(res, kod, veri) {
  res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(veri));
}
function kac(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function bekleyenSayisiGetir() {
  if (!supabase) return null;
  try {
    const { count } = await supabase.from('pusula_bekleme_listesi').select('*', { count: 'exact', head: true });
    return count ?? null;
  } catch { return null; }
}

async function kaydet(form) {
  if (!supabase) return { hata: 'Supabase bağlantısı yok (SUPABASE_URL / SUPABASE_KEY tanımlı değil)' };
  const iletisim = String(form.iletisim || '').trim();
  const kanal = String(form.kanal || '').trim();
  const dil = String(form.dil || 'tr').trim();
  const durum = String(form.durum || '').slice(0, 60);
  if (!iletisim) return { hata: 'E-posta ya da WhatsApp numarası girin' };
  const { error } = await supabase.from('pusula_bekleme_listesi').insert([{ iletisim, kanal, dil, durum }]);
  if (error) return { hata: error.message };
  return { basarili: true };
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#0E1729;color:#141812;line-height:1.55}
.wrap{max-width:760px;margin:0 auto;padding:0 24px}
header{padding:70px 0 40px;text-align:center}
.badge{display:inline-flex;align-items:center;gap:8px;background:#1C2C48;color:#F0C27B;font-family:'Space Grotesk';font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:8px 16px;border-radius:20px;border:1px solid #34435F;margin-bottom:22px}
h1{font-family:'Fraunces',serif;font-size:44px;color:#fff;line-height:1.15;margin-bottom:18px}
h1 em{color:#D98E2B;font-style:italic}
.sub{color:#C7D0DE;font-size:17px;max-width:560px;margin:0 auto 36px;font-family:'Inter'}
.card{background:#fff;border-radius:10px;padding:34px;margin-bottom:24px;box-shadow:0 20px 60px rgba(0,0,0,0.25)}
.card h2{font-family:'Fraunces',serif;font-size:21px;color:#16233B;margin-bottom:14px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:6px}
.step{background:#F7F5EF;border-radius:8px;padding:16px}
.step .n{font-family:'Fraunces',serif;font-size:22px;color:#D98E2B;font-weight:700}
.step p{font-size:12.5px;color:#5B6472;margin-top:6px;font-family:'Inter'}
form{display:flex;flex-direction:column;gap:12px;margin-top:10px}
.row{display:flex;gap:10px}
input,select{flex:1;padding:13px 14px;border:1.5px solid #E3E6EA;border-radius:7px;font-size:14px;font-family:'Inter'}
button{background:#D98E2B;color:#0E1729;border:none;font-weight:700;padding:14px;border-radius:7px;font-size:15px;cursor:pointer;font-family:'Space Grotesk'}
button:hover{background:#c47f24}
#durum{font-size:13px;margin-top:4px;font-family:'Inter'}
.sayac{text-align:center;color:#8A93A0;font-size:13px;font-family:'Space Grotesk';margin-bottom:8px}
.sayac b{color:#F0C27B;font-size:15px}
footer{text-align:center;padding:30px 0 60px;color:#5B6472;font-size:12px;font-family:'Space Grotesk'}
@media(max-width:600px){h1{font-size:32px}.steps{grid-template-columns:1fr}.row{flex-direction:column}}
`;

async function anaSayfaHTML() {
  const sayi = await bekleyenSayisiGetir();
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pusula — Almanya'da bürokrasi ve iş bulma yapay zekâ ajanı</title>
<meta name="description" content="Belgeni yükle, Pusula ne yapman gerektiğini kendi dilinde anlatsın. Jobcenter, Familienkasse, Wohngeld süreçleri ve iş bulma tek yerde.">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="badge">🧭 Erken Erişim — Yakında WhatsApp'ta</div>
    <h1>Bürokrasi bir <em>engel</em> değil,<br>bir adım olsun.</h1>
    <p class="sub">Pusula, Jobcenter, Familienkasse, Wohngeld ve Ausländerbehörde belgelerini senin dilinde açıklayan ve iş bulmana yardımcı olan yapay zekâ ajanı.</p>
  </header>

  <div class="card">
    <h2>Nasıl çalışacak?</h2>
    <div class="steps">
      <div class="step"><div class="n">01</div><p>Belgeni WhatsApp'a fotoğraf olarak gönder</p></div>
      <div class="step"><div class="n">02</div><p>Pusula hangi kurum, ne yapman gerektiğini kendi dilinde anlatır</p></div>
      <div class="step"><div class="n">03</div><p>Dilekçe taslağı hazırlar, deadline'ları takip eder</p></div>
    </div>
  </div>

  <div class="card">
    <h2>Erken erişim listesine katıl</h2>
    ${sayi != null ? `<div class="sayac"><b>${sayi}</b> kişi zaten bekleme listesinde</div>` : ''}
    <form id="form">
      <div class="row">
        <select id="kanal"><option value="whatsapp">WhatsApp</option><option value="email">E-posta</option></select>
        <select id="dil"><option value="tr">Türkçe</option><option value="de">Deutsch</option><option value="en">English</option></select>
      </div>
      <input id="iletisim" placeholder="WhatsApp numaran ya da e-posta adresin" required>
      <input id="durum" placeholder="Kısaca durumun (örn: Jobcenter süreci, iş arıyorum) — opsiyonel">
      <button type="submit">Listeye Katıl</button>
      <div id="durumMsg"></div>
    </form>
  </div>

  <footer>© ${new Date().getFullYear()} Pusula · Taner Aslan · Bergstraße 6, 53947 Nettersheim</footer>
</div>
<script>
document.getElementById('form').addEventListener('submit', async function(e){
  e.preventDefault();
  var d = document.getElementById('durumMsg');
  d.textContent = 'Kaydediliyor...'; d.style.color = '#888';
  var payload = {
    iletisim: document.getElementById('iletisim').value,
    kanal: document.getElementById('kanal').value,
    dil: document.getElementById('dil').value,
    durum: document.getElementById('durum').value
  };
  try {
    var r = await fetch('/api/kayit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    var s = await r.json();
    if (s.basarili) { d.textContent = '✓ Kaydoldun! Hazır olduğumuzda ilk sen haber alacaksın.'; d.style.color = '#2F7D5C'; document.getElementById('form').reset(); }
    else { d.textContent = 'Hata: ' + (s.hata || 'bilinmeyen'); d.style.color = '#B5432D'; }
  } catch(err) { d.textContent = 'Bağlantı hatası, tekrar dener misin?'; d.style.color = '#B5432D'; }
});
</script>
</body>
</html>`;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && u.pathname === '/api/kayit') {
    const form = await bodyOku(req);
    const sonuc = await kaydet(form);
    jsonGonder(res, sonuc.hata ? 400 : 200, sonuc);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(await anaSayfaHTML());
}).listen(PORT, () => console.log(`Pusula erken erişim sitesi port ${PORT}'da çalışıyor`));
