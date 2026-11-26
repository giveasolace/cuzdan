// Ekstre JSON dosyalarını şifreleyip Cüzdan gelen kutusuna gönderir.
// Kullanım: node send-inbox.mjs <KOD veya kod dosyası> <ekstre1.json> [ekstre2.json ...]
import fs from 'fs';
import { webcrypto as crypto } from 'crypto';

const PUSH_URL = 'https://motive-push.giveasolace.workers.dev';
const [, , codeArg, ...rest] = process.argv; const files = rest.filter(a => a !== '--force');
if (!codeArg || !files.length) { console.error('Kullanım: node send-inbox.mjs <KOD|kod-dosyası> <ekstre.json>...'); process.exit(1); }
const code = (fs.existsSync(codeArg) ? fs.readFileSync(codeArg, 'utf8') : codeArg).trim().toUpperCase();
if (!/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(code)) { console.error('Kod biçimi hatalı (XXXX-XXXX-XXXX-XXXX)'); process.exit(1); }

const sha = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const hex = u => [...u].map(b => b.toString(16).padStart(2, '0')).join('');
const b64 = u => Buffer.from(u).toString('base64');

const statements = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
for (const st of statements) if (!Array.isArray(st.items)) { console.error('Geçersiz ekstre dosyası'); process.exit(1); }

// Gönderim kaydı: aynı kartın aynı dönemini ikinci kez göndermeyi engeller (--force ile geçilir)
const LOG = (process.env.USERPROFILE || process.env.HOME) + '/.cuzdan-sent-log.json';
const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
const force = process.argv.includes('--force');
for (const st of statements) {
  const prev = log.find(l => l.card === st.card && l.period === st.period);
  if (prev && !force) { console.error(`DUR: ${st.card} / ${st.period} zaten ${prev.sentAt} tarihinde gönderildi. Bilerek tekrar göndermek için --force ekle.`); process.exit(2); }
}

const id = hex(await sha('cuzdan-inbox-id:' + code)).slice(0, 24);
const key = await crypto.subtle.importKey('raw', await sha('cuzdan-inbox-key:' + code), 'AES-GCM', false, ['encrypt']);
const iv = crypto.getRandomValues(new Uint8Array(12));
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ statements, sentAt: Date.now() }))));

const r = await fetch(PUSH_URL + '/inbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, data: b64(iv) + '.' + b64(ct) }) });
console.log(r.status, await r.text());
if (r.ok) { for (const st of statements) log.push({ card: st.card, period: st.period, n: st.items.length, total: st.total, first: st.items.map(x => x.date).sort()[0], last: st.items.map(x => x.date).sort().pop(), sentAt: new Date().toISOString().slice(0, 16) }); fs.writeFileSync(LOG, JSON.stringify(log, null, 1)); }
for (const st of statements) console.log(`  ${st.card}: ${st.items.length} satır`);
