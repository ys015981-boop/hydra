// HYDRA BOT - كل البوت في ملف واحد
// التشغيل: set TOKEN=توكنك   ثم   node hydra-bot.js
try { require("dotenv").config(); } catch {} // يقرا التوكن من ملف .env
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, PermissionsBitField, ChannelType, AuditLogEvent,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials,
  ModalBuilder, TextInputBuilder, TextInputStyle, OverwriteType } = require('discord.js');
const P = PermissionsBitField.Flags;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration, // لازم لحماية التخريب (أحداث البان)
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions, // للرتب بالريأكشن
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;

// ================= الإعدادات (عدّل براحتك) =================
const CONFIG = {
  maxWarnings: 3,              // بعد كام تحذير يتعمل تايم أوت
  warnTimeoutMs: 10 * MIN,     // مدة التايم أوت بعد آخر تحذير
  maxMentions: 5,              // منشن جماعي: كام شخص في رسالة واحدة
  spam: { messages: 5, perMs: 5000, timeoutMs: 5 * MIN }, // 5 رسايل في 5 ثواني
  blockLinks: true,            // منع الروابط
  allowedLinkDomains: ['tenor.com', 'giphy.com', 'youtube.com', 'youtu.be'], // روابط مسموحة
  // حماية الاقتحام: لو دخل عدد كبير في وقت قصير
  antiRaid: {
    enabled: true,
    joins: 6,                 // كام شخص يدخلوا ...
    perMs: 10 * SEC,          // ... في كام ثانية يتعتبر اقتحام
    durationMs: 10 * MIN,     // مدة وضع الاقتحام (أي حد يدخل فيها بيتطرد)
  },
  // حماية التخريب: لو حد عمل حاجات كتير بسرعة
  antiNuke: {
    enabled: true,
    deletes: 3,               // مسح رومات/رتب
    removes: 4,               // بان/طرد أعضاء
    perMs: 10 * SEC,
    whitelist: [],            // IDs ناس موثوقين ما يتراقبوش (الأونر مستثنى تلقائيًا)
  },
  defaultAutoRoleName: '𝕋𝕙𝕖 𝕟𝕖𝕨 𝕄𝕖𝕞𝕓𝕖𝕣👋', // الرتبة اللي أي حد يدخل ياخدها (لو ما حددتش رتبة بالأمر)
  ticketPrivate: true, // true = الروم بين العضو والأونر بس | false = الروم يتفتح زي باقي رومات القسم
  xp: { min: 15, max: 25, cooldownMs: 60 * SEC }, // الليفلات
  welcomeText: (m) =>
    `🩸 العائلة كبرت فرد جديد.. 🩸\n\nأهلاً بك يا ${m} في عصابة HYDRA\nدخلت منطقتنا، وهنا الولاء والاحترام هما كل حاجة ⚔️`,
};

// ================= حفظ البيانات (تحذيرات وإعدادات الرومات) =================
const DATA_FILE = path.join(__dirname, 'data.json');
let data = { warnings: {}, logChannel: {}, welcomeChannel: {}, autoRole: {}, tickets: {}, reactionRoles: {}, autoReplies: {}, levels: {}, levelRoles: {}, giveaways: {}, testMode: false };
try {
  data = { ...data, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
} catch {}
let saveTimer = null;
const saveSoon = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 10 * SEC);
};
const save = () => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('تعذر حفظ data.json', e.message);
  }
};

// ================= أدوات النص =================
// توحيد الكتابة: أ/إ/آ -> ا ، ة -> ه ، ى -> ي ، شيل التشكيل ، الأرقام العربي -> إنجليزي
const norm = (s) =>
  s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْ]/g, '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .toLowerCase();

// "كسسسمك" -> "كسمك"
const collapse = (s) => s.replace(/(\p{L})\1+/gu, '$1');

const strip = (w) => w.replace(/^ال/, '');
const hasAny = (tokens, list) => tokens.some((t) => list.includes(t) || list.includes(strip(t)));

// ================= كشف السب (ذكي) =================
const MENTION = 'xmentionx';

// ألفاظ قوية: بتتمسك دايمًا
const STRONG_RAW = [
  'كس', 'كسمك', 'كسمه', 'كسام', 'كسامك', 'كسختك',
  'متناك', 'متناكه', 'منيوك', 'منيوكه', 'شرموط', 'شرموطه',
  'عرص', 'معرص', 'قحبه', 'زب', 'طيز', 'انيك', 'ينيك', 'نيكك', 'نيكها', 'نياك', 'لوطي', 'خرا',
  // إنجليزي وفرانكو
  'fuck', 'fuk', 'fck', 'fucker', 'motherfucker', 'shit', 'bitch', 'bastard', 'asshole',
  'cunt', 'whore', 'slut', 'ksmk', 'kosomak', 'ksomak', 'kosomk', 'a7a', '3rs', 'ayre',
  'sharmota', 'sharmot', 'manyak', 'manyaka', 'mtnak', 'mtnaka', 'metnak',
];
const STRONG_PHRASES_RAW = [
  'كس امك', 'كس ام', 'كس اختك', 'كس دينك',
  'يلعن ابوك', 'يلعن ابوكي', 'يلعن ابوكم', 'يلعن ابو', 'يلعن امك', 'يلعن دينك', 'يلعن دين',
];

// ألفاظ خفيفة: بتتمسك بس لو موجهة لحد (يا كلب / انت غبي / @فلان حمار)
const MILD_RAW = [
  'غبي', 'غبيه', 'حمار', 'حماره', 'كلب', 'كلبه', 'حيوان', 'زباله', 'تافه', 'واطي', 'واطيه',
  'وسخ', 'وسخه', 'قذر', 'حقير', 'حقيره', 'منحط', 'عبيط', 'عبيطه', 'اهبل', 'هبله', 'بقره',
  'خنزير', 'جحش', 'تيس', 'معفن', 'فاشل', 'فاشله', 'متخلف', 'متخلفه', 'ابله', 'زفت', 'حثاله',
  'ghabi', 'ghaby', '7mar', 'hmar', 'kalb', '7ayawan', 'hayawan', 'a3bit', '3beet', 'ahbal',
  'wsekh', 'wesekh', 'stupid', 'idiot',
];
// ألفاظ خفيفة بس دايمًا إهانة
const MILD_PHRASES_RAW = ['قليل الادب', 'قليله الادب', 'قليل ادب', 'ابن الكلب', 'بنت الكلب', 'ولاد الكلب'];

// كلمات بتدل إن الكلام موجه لحد
const MARKERS_RAW = [
  'يا', 'يابن', 'يبن', 'ياض', 'انت', 'انتا', 'انتي', 'انتو', 'انتم', 'ابن', 'بنت',
  'ya', 'enta', 'enti', 'inta', 'inti', 'you', 'u', MENTION,
];

const prep = (w) => collapse(norm(w));
const STRONG = new Set(STRONG_RAW.map(prep));
const MILD = new Set(MILD_RAW.map(prep));
const STRONG_PHRASES = STRONG_PHRASES_RAW.map(prep);
const MILD_PHRASES = MILD_PHRASES_RAW.map(prep);
const MARKERS = new Set(MARKERS_RAW.map(prep));

// الرسالة -> كلمات منظفة (تتعامل مع التكرار والرموز والمسافات بين الحروف)
function tokenize(content) {
  const s = norm(content)
    .replace(/<@[!&]?\d+>/g, ` ${MENTION} `)
    .replace(/<#\d+>|<a?:\w+:\d+>|https?:\/\/\S+/g, ' ')
    .replace(/ـ/g, '')
    .replace(/(?<=\p{L})[*\-_.~+^'`]+(?=\p{L})/gu, ''); // ك.س.م.ك  أو  ك*سمك
  const raw = s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out = [];
  let buf = '';
  const flush = () => {
    if (buf.length >= 3) out.push(buf); // "ك س م ك" -> "كسمك"
    else for (const c of buf) out.push(c);
    buf = '';
  };
  for (const t of raw) {
    if (t.length === 1 && /\p{L}/u.test(t)) buf += t;
    else {
      flush();
      out.push(t);
    }
  }
  flush();
  return out.map(collapse);
}

// أشكال الكلمة بعد شيل السوابق (ال، و، ب، يا) واللواحق (ك، ه، ها...)
const PREFIXES = [['يا', true], ['وال', false], ['بال', false], ['فال', false], ['كال', false], ['لل', false], ['ال', false], ['و', false], ['ب', false], ['ل', false], ['ف', false], ['ك', false]];
const SUFFIXES = [['كم', true], ['ها', false], ['هم', false], ['نا', false], ['ك', true], ['ه', false], ['ي', false]];

function variants(t) {
  const out = new Map([[t, false]]);
  const bases = new Map([[t, false]]);
  for (const [p, d] of PREFIXES) {
    if (t.startsWith(p) && t.length - p.length >= 2) bases.set(t.slice(p.length), d);
  }
  for (const [b, bd] of bases) {
    out.set(b, out.get(b) || bd);
    for (const [s, sd] of SUFFIXES) {
      if (b.endsWith(s) && b.length - s.length >= 2) {
        const w = b.slice(0, -s.length);
        out.set(w, out.get(w) || bd || sd);
      }
    }
  }
  return out;
}

// بيرجع الكلمة اللي اتمسكت، أو null لو الكلام نضيف
function checkSwear(content) {
  const tokens = tokenize(content);
  const joined = ` ${tokens.join(' ')} `;
  for (const p of STRONG_PHRASES) if (joined.includes(` ${p} `)) return p;
  for (const p of MILD_PHRASES) if (joined.includes(` ${p} `)) return p;
  for (let i = 0; i < tokens.length; i++) {
    for (const [w, affixDirect] of variants(tokens[i])) {
      if (STRONG.has(w)) return w;
      if (MILD.has(w)) {
        const before = tokens.slice(Math.max(0, i - 3), i);
        const after = tokens.slice(i + 1, i + 3);
        if (affixDirect || before.some((t) => MARKERS.has(t)) || after.includes(MENTION)) return w;
      }
    }
  }
  return null;
}

// ================= الروابط =================
const LINK_RE = /(https?:\/\/\S+|www\.\S+|discord\.gg\/\S+|discord(?:app)?\.com\/invite\/\S+|\b[a-z0-9-]+\.(?:com|net|org|gg|io|me|xyz|co|tv|ly|app|info|ru|cc)\b)/gi;
function hasBlockedLink(content) {
  const found = content.match(LINK_RE);
  if (!found) return false;
  return found.some((l) => !CONFIG.allowedLinkDomains.some((d) => l.toLowerCase().includes(d)));
}

// ================= المدة والتنسيق =================
const UNITS = {
  ثانيتين: [SEC, 2], ثانيه: [SEC], ثواني: [SEC],
  دقيقتين: [MIN, 2], دقيقه: [MIN], دقايق: [MIN], دقائق: [MIN],
  ساعتين: [HOUR, 2], ساعه: [HOUR], ساعات: [HOUR],
  يومين: [DAY, 2], يوم: [DAY], ايام: [DAY],
  اسبوعين: [7 * DAY, 2], اسبوع: [7 * DAY],
};
const DURATION_RE = new RegExp(`(\\d+)?\\s*(${Object.keys(UNITS).join('|')})`);

function parseDuration(text) {
  if (/نص ساعه|نصف ساعه/.test(text)) return 30 * MIN;
  const m = text.match(DURATION_RE);
  if (!m) return null;
  const [unitMs, fixed] = UNITS[m[2]];
  return (fixed ?? (m[1] ? parseInt(m[1], 10) : 1)) * unitMs;
}

function formatMs(ms) {
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const s = Math.floor((ms % MIN) / SEC);
  return [d && `${d} يوم`, h && `${h} ساعة`, m && `${m} دقيقة`, s && `${s} ثانية`].filter(Boolean).join(' و ');
}

// ================= أدوات السيرفر =================
// هل المشرف رتبته أعلى من الشخص؟ (صاحب السيرفر دايمًا أعلى)
const outranks = (mod, target) =>
  mod.id === mod.guild.ownerId || mod.roles.highest.comparePositionTo(target.roles.highest) > 0;

const normName = (s) => norm(s).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

function findRole(guild, text) {
  return [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.name.length - a.name.length)
    .find((r) => {
      const n = normName(r.name);
      return n && text.includes(n);
    });
}

function findChannel(guild, kind) {
  const store = kind === 'log' ? data.logChannel : data.welcomeChannel;
  let ch = store[guild.id] && guild.channels.cache.get(store[guild.id]);
  if (!ch) {
    const words = kind === 'log' ? ['لوج', 'log'] : ['ترحيب', 'welcome'];
    ch = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && words.some((w) => c.name.toLowerCase().includes(w))
    );
  }
  return ch && ch.isTextBased() ? ch : null;
}

async function logAction(guild, text) {
  const ch = findChannel(guild, 'log');
  if (ch) await ch.send({ content: text.slice(0, 1900), allowedMentions: { parse: [] } }).catch(() => {});
}

async function notice(channel, text, ms = 8000) {
  const m = await channel.send({ content: text, allowedMentions: { parse: ['users'] } }).catch(() => null);
  if (m && ms) setTimeout(() => m.delete().catch(() => {}), ms);
}

// ================= التحذيرات =================
async function applyWarning(guild, channel, member, reason, by) {
  const key = `${guild.id}:${member.id}`;
  const list = (data.warnings[key] ||= []);
  list.push({ reason, by, at: Date.now() });
  save();
  const count = list.length;

  if (count >= CONFIG.maxWarnings) {
    data.warnings[key] = [];
    save();
    let ok = false;
    if (member.moderatable) {
      await member
        .timeout(CONFIG.warnTimeoutMs, 'وصل الحد الأقصى من التحذيرات')
        .then(() => (ok = true))
        .catch(() => {});
    }
    await notice(
      channel,
      `🔇 ${member} وصل ${CONFIG.maxWarnings} تحذيرات${ok ? ` واتعمله تايم أوت ${formatMs(CONFIG.warnTimeoutMs)}` : ''}.`,
      15000
    );
    await logAction(guild, `🔇 ${member.user.tag} وصل الحد الأقصى من التحذيرات (آخرها: ${reason}).`);
  } else {
    await notice(channel, `⚠️ ${member} تحذير ${count}/${CONFIG.maxWarnings} — ${reason}`, 15000);
    await logAction(guild, `⚠️ تحذير ${count}/${CONFIG.maxWarnings} لـ ${member.user.tag}: ${reason}`);
  }
  return count;
}

// ================= الحماية التلقائية =================
const isStaff = (member) => member.permissions.has(P.ManageMessages);
const isExempt = (member) => isStaff(member) && !data.testMode;

const spamMap = new Map();
function isSpam(msg) {
  const key = `${msg.guild.id}:${msg.author.id}`;
  const now = Date.now();
  const arr = (spamMap.get(key) || []).filter((t) => now - t < CONFIG.spam.perMs);
  arr.push(now);
  spamMap.set(key, arr);
  if (arr.length >= CONFIG.spam.messages) {
    spamMap.delete(key);
    return true;
  }
  return false;
}

async function automod(msg) {
  const member = msg.member;
  if (isExempt(member)) return false;
  const content = msg.content || '';

  // 1) سب (حتى الخفيف لو موجه لحد) -> مسح + تحذير تلقائي
  const bad = content && checkSwear(content);
  if (bad) {
    await msg.delete().catch(() => {});
    await logAction(msg.guild, `🚫 رسالة محذوفة من ${msg.author.tag} في ${msg.channel}: ||${content.slice(0, 300)}||`);
    await applyWarning(msg.guild, msg.channel, member, 'ألفاظ غير لائقة', client.user.id);
    return true;
  }

  // 2) روابط
  if (CONFIG.blockLinks && content && hasBlockedLink(content)) {
    await msg.delete().catch(() => {});
    await notice(msg.channel, `🔗 ممنوع إرسال الروابط يا ${member}.`);
    await logAction(msg.guild, `🔗 رابط محذوف من ${msg.author.tag} في ${msg.channel}: ||${content.slice(0, 300)}||`);
    return true;
  }

  // 3) منشن جماعي
  if (msg.mentions.users.size >= CONFIG.maxMentions) {
    await msg.delete().catch(() => {});
    await applyWarning(msg.guild, msg.channel, member, 'منشن جماعي', client.user.id);
    return true;
  }

  // 4) سبام
  if (isSpam(msg)) {
    const recent = await msg.channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (recent) {
      const mine = recent.filter(
        (m) => m.author.id === msg.author.id && Date.now() - m.createdTimestamp < CONFIG.spam.perMs + 2000
      );
      await msg.channel.bulkDelete(mine, true).catch(() => {});
    }
    let ok = false;
    if (member.moderatable) {
      await member.timeout(CONFIG.spam.timeoutMs, 'سبام').then(() => (ok = true)).catch(() => {});
    }
    await notice(msg.channel, `🚫 ${member} سبام${ok ? ` — تايم أوت ${formatMs(CONFIG.spam.timeoutMs)}` : ''}.`, 10000);
    await logAction(msg.guild, `🚫 سبام من ${msg.author.tag} في ${msg.channel}.`);
    return true;
  }
  return false;
}

// ================= حماية الاقتحام (Anti-Raid) =================
const joinLog = new Map();   // guildId -> [{ id, t }]
const raidUntil = new Map(); // guildId -> وقت انتهاء وضع الاقتحام
const botKicked = new Set(); // ناس البوت طردهم (عشان ما نعتبرهم تخريب)
const inRaid = (g) => (raidUntil.get(g.id) || 0) > Date.now();

async function raidKick(member, reason) {
  if (!member || !member.kickable) return false;
  botKicked.add(member.id);
  setTimeout(() => botKicked.delete(member.id), 60 * SEC);
  return member.kick(reason).then(() => true).catch(() => false);
}

// بيرجع true لو العضو اتطرد
async function checkRaid(member) {
  const cfg = CONFIG.antiRaid;
  if (!cfg.enabled || member.user.bot) return false;
  const g = member.guild;
  const now = Date.now();

  if (inRaid(g)) {
    const ok = await raidKick(member, 'وضع الاقتحام شغال');
    if (ok) await logAction(g, `🛡️ طردت ${member.user.tag} (دخل أثناء وضع الاقتحام).`);
    return ok;
  }

  const arr = (joinLog.get(g.id) || []).filter((j) => now - j.t < cfg.perMs);
  arr.push({ id: member.id, t: now });
  joinLog.set(g.id, arr);

  if (arr.length >= cfg.joins) {
    joinLog.delete(g.id);
    raidUntil.set(g.id, now + cfg.durationMs);
    let kicked = 0;
    for (const j of arr) {
      const m = g.members.cache.get(j.id) || (await g.members.fetch(j.id).catch(() => null));
      if (m && (await raidKick(m, 'اقتحام جماعي'))) kicked++;
    }
    await logAction(
      g,
      `🚨 **اقتحام!** دخل ${arr.length} في ${formatMs(cfg.perMs)}. طردت ${kicked}، ووضع الاقتحام شغال ${formatMs(cfg.durationMs)}.\n` +
        'لإيقافه: `وقف وضع الاقتحام`'
    );
    return g.members.cache.has(member.id) === false;
  }
  return false;
}

// ================= حماية التخريب (Anti-Nuke) =================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nukeMap = new Map();

// مين اللي عمل الحدث ده؟ (من سجل التدقيق Audit Log)
async function whoDid(guild, type, targetId, tries = 2) {
  if (!guild.members.me?.permissions.has(P.ViewAuditLog)) return null;
  for (let i = 0; i < tries; i++) {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
    const e = logs?.entries.find((x) => x.targetId === targetId && Date.now() - x.createdTimestamp < 10 * SEC);
    if (e) return e.executor;
    if (i < tries - 1) await sleep(800);
  }
  return null;
}

const DANGEROUS = [P.Administrator, P.ManageChannels, P.ManageRoles, P.ManageGuild, P.BanMembers, P.KickMembers, P.ManageWebhooks];

async function punishNuker(guild, user, why) {
  const m = await guild.members.fetch(user.id).catch(() => null);
  let result = 'مقدرتش أسحب صلاحياته (رتبته أعلى من رتبة البوت)';
  if (m) {
    if (user.bot) {
      result = (await m.kick('تخريب').then(() => true).catch(() => false)) ? 'طردت البوت' : result;
    } else {
      const roles = m.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.editable && DANGEROUS.some((p) => r.permissions.has(p)));
      if (roles.size) {
        const ok = await m.roles.remove(roles, `حماية التخريب: ${why}`).then(() => true).catch(() => false);
        if (ok) result = `سحبت الرتب: ${roles.map((r) => r.name).join('، ')}`;
      }
    }
  }
  const msg = `🚨 **تخريب!** ${user.tag} (${why}). ${result}.`;
  await logAction(guild, msg);
  const owner = await guild.fetchOwner().catch(() => null);
  if (owner) owner.send(`${msg}\nالسيرفر: ${guild.name}`).catch(() => {});
}

async function nukeGuard(guild, executor, kind, limit, label) {
  const cfg = CONFIG.antiNuke;
  if (!cfg.enabled || !executor) return;
  if (executor.id === client.user.id || executor.id === guild.ownerId || cfg.whitelist.includes(executor.id)) return;
  const key = `${guild.id}:${executor.id}:${kind}`;
  const now = Date.now();
  const arr = (nukeMap.get(key) || []).filter((t) => now - t < cfg.perMs);
  arr.push(now);
  nukeMap.set(key, arr);
  if (arr.length >= limit) {
    nukeMap.delete(key);
    await punishNuker(guild, executor, `${label}: ${arr.length} في ${formatMs(cfg.perMs)}`);
  }
}

// ================= الليفلات =================
const xpFor = (lvl) => 5 * lvl * lvl + 50 * lvl + 100;
const xpCooldown = new Map();

async function grantLevelRoles(member, lvl) {
  const map = data.levelRoles[member.guild.id] || {};
  for (const [l, rid] of Object.entries(map)) {
    const role = member.guild.roles.cache.get(rid);
    if (lvl >= +l && role && role.editable && !member.roles.cache.has(rid)) {
      await member.roles.add(role, `وصل لفل ${l}`).catch(() => {});
    }
  }
}

async function awardXp(msg) {
  if (!msg.content || msg.content.length < 3) return;
  const key = `${msg.guild.id}:${msg.author.id}`;
  const now = Date.now();
  if (now - (xpCooldown.get(key) || 0) < CONFIG.xp.cooldownMs) return;
  xpCooldown.set(key, now);
  const lv = ((data.levels[msg.guild.id] ||= {})[msg.author.id] ||= { xp: 0, lvl: 0 });
  lv.xp += CONFIG.xp.min + Math.floor(Math.random() * (CONFIG.xp.max - CONFIG.xp.min + 1));
  let up = false;
  while (lv.xp >= xpFor(lv.lvl)) {
    lv.xp -= xpFor(lv.lvl);
    lv.lvl++;
    up = true;
  }
  saveSoon();
  if (up) {
    await notice(msg.channel, `🎉 مبروك ${msg.member}! وصلت **لفل ${lv.lvl}**.`, 20000);
    await grantLevelRoles(msg.member, lv.lvl);
  }
}

// أوامر متاحة للكل: لفل / توب
async function handlePublic(msg) {
  const text = norm(msg.content.replace(/<@[!&]?\d+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const tokens = text.split(' ');
  if (!text || tokens.length > 3) return false;
  const quiet = { allowedMentions: { parse: [] } };

  if (['لفل', 'level', 'رانك', 'rank'].includes(tokens[0])) {
    const t = msg.mentions.members.first() || msg.member;
    const lv = (data.levels[msg.guild.id] || {})[t.id] || { xp: 0, lvl: 0 };
    await msg.reply({ content: `📈 ${t.displayName}: **لفل ${lv.lvl}** — ${lv.xp}/${xpFor(lv.lvl)} XP`, ...quiet });
    return true;
  }
  if (['توب', 'top', 'ترتيب', 'المتصدرين', 'leaderboard'].includes(tokens[0]) && tokens.length <= 2) {
    const all = Object.entries(data.levels[msg.guild.id] || {})
      .sort((a, b) => b[1].lvl - a[1].lvl || b[1].xp - a[1].xp)
      .slice(0, 10);
    if (!all.length) { await msg.reply('📊 لسه مفيش حد اتفاعل.'); return true; }
    const lines = all.map(([id, v], i) => `${i + 1}. <@${id}> — لفل ${v.lvl}`);
    await msg.reply({ content: `🏆 **أعلى 10 في السيرفر:**\n${lines.join('\n')}`, ...quiet });
    return true;
  }
  return false;
}

// ================= الردود التلقائية =================
const replyCooldown = new Map();
const BUILTIN = require('./replies'); // ردود جاهزة بالمصري (replies.js)
const normPhrase = (s) => collapse(norm(s)).split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ');
const BUILTIN_GROUPS = BUILTIN.GROUPS.map((g) => ({ g, trigs: g.triggers.map(normPhrase).filter(Boolean) }));
async function autoReply(msg) {
  if (!msg.content) return;
  const text = ` ${norm(msg.content).split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `;
  // 1) الردود اللي إنت ضفتها بنفسك (ليها الأولوية). الرد ممكن يبقى نص أو قايمة نصوص (بيختار عشوائي)
  const rules = data.autoReplies[msg.guild.id] || {};
  for (const [trig, rep] of Object.entries(rules)) {
    if (!text.includes(` ${trig} `)) continue;
    const key = `${msg.channel.id}:${trig}`;
    if (Date.now() - (replyCooldown.get(key) || 0) < 10 * SEC) return;
    replyCooldown.set(key, Date.now());
    const out = Array.isArray(rep) ? rep[Math.floor(Math.random() * rep.length)] : rep;
    await msg.reply({ content: out, allowedMentions: { parse: [] } }).catch(() => {});
    return;
  }
  // 2) الردود الجاهزة بالمصري (لو عايز توقفها: data.json -> "builtinReplies": false)
  if (data.builtinReplies === false) return;
  const ctext = ` ${normPhrase(msg.content)} `;
  for (const { g, trigs } of BUILTIN_GROUPS) {
    if (!trigs.some((t) => ctext.includes(` ${t} `))) continue;
    const key = `${msg.channel.id}:builtin:${g.id}`;
    if (Date.now() - (replyCooldown.get(key) || 0) < 10 * SEC) return;
    replyCooldown.set(key, Date.now());
    await msg.reply({ content: BUILTIN.makeReply(g), allowedMentions: { parse: [] } }).catch(() => {});
    return;
  }
}

// ================= التيكتات =================
async function sendTicketPanel(channel) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_open').setLabel('فتح تذكرة').setEmoji('🎫').setStyle(ButtonStyle.Primary)
  );
  await channel.send({ content: '🎫 **الدعم الفني**\nلو محتاج مساعدة اضغط الزرار تحت واكتب مشكلتك، وهيتفتحلك روم خاص بينك وبين الأونر.', components: [row] });
}

// ================= الرتب بالريأكشن =================
const cleanEmoji = (s) => s.replace(/\uFE0F/g, '');
function parseEmoji(content) {
  const c = content.match(/<a?:\w+:(\d+)>/);
  if (c) return { key: c[1], react: c[1] };
  const u = content.match(/\p{Extended_Pictographic}\uFE0F?/u);
  if (u) return { key: cleanEmoji(u[0]), react: u[0] };
  return null;
}
async function handleReaction(reaction, user, add) {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    const message = reaction.message;
    if (!message.guild) return;
    const map = data.reactionRoles[message.id];
    if (!map) return;
    const roleId = map[reaction.emoji.id || cleanEmoji(reaction.emoji.name || '')];
    const role = roleId && message.guild.roles.cache.get(roleId);
    if (!role || !role.editable) return;
    const member = await message.guild.members.fetch(user.id);
    if (add) await member.roles.add(role, 'رتبة بالريأكشن');
    else await member.roles.remove(role, 'رتبة بالريأكشن');
  } catch (e) {
    console.error('reaction role:', e.message);
  }
}

// ================= جيف أواي =================
async function checkGiveaways() {
  if (!client.isReady()) return;
  const now = Date.now();
  for (const [mid, g] of Object.entries(data.giveaways)) {
    if (g.endsAt > now) continue;
    delete data.giveaways[mid];
    save();
    try {
      const ch = await client.channels.fetch(g.channelId);
      const m = await ch.messages.fetch(mid);
      const users = await m.reactions.cache.get('🎉')?.users.fetch();
      const pool = users ? [...users.filter((u) => !u.bot).values()] : [];
      if (!pool.length) {
        await ch.send(`😕 محدش اشترك في جيف أواي **${g.prize}**.`);
      } else {
        const w = pool[Math.floor(Math.random() * pool.length)];
        await ch.send({ content: `🎉 مبروك <@${w.id}>! كسبت **${g.prize}**`, allowedMentions: { users: [w.id] } });
      }
    } catch (e) {
      console.error('giveaway:', e.message);
    }
  }
}

// الروم المقصود في الأمر: منشن أو لينك، وإلا الروم الحالي
function chanFrom(msg) {
  const id = msg.mentions.channels.first()?.id || msg.content.match(/discord(?:app)?\.com\/channels\/\d+\/(\d+)/)?.[1];
  const ch = id && msg.guild.channels.cache.get(id);
  return ch && ch.isTextBased() ? ch : msg.channel;
}

// ================= كلمات الأوامر =================
const TIMEOUT_WORDS = /(تايم ?اوت|timeout|اسكت|ميوت|mute)/;
const UNDO = ['فك', 'الغ', 'الغي', 'شيل', 'ازل'];
const KICK = ['اطرد', 'اطرده', 'اطردوه', 'طرد', 'كيك', 'kick'];
const BAN = ['بان', 'حظر', 'احظر', 'احظره', 'ban'];
const CLEAR = ['امسح', 'مسح', 'نضف', 'احذف', 'clear', 'امسحلي'];
const ROLE_WORD = ['رتبه', 'رول', 'role'];
const ROLE_ADD = ['اديله', 'ادي', 'اعطيه', 'اعطي', 'ضيف', 'ضيفله', 'add'];
const ROLE_REMOVE = ['شيل', 'شيلها', 'سحب', 'ازل', 'ازله', 'امسح', 'احذف', 'remove'];
const WARN = ['حذر', 'حذره', 'انذر', 'تحذير'];
const WARNINGS_WORD = ['تحذيرات'];
const LOCK = ['اقفل', 'قفل', 'lock'];
const UNLOCK = ['افتح', 'فتح', 'unlock'];
const CHANNEL_WORD = ['روم', 'شات', 'channel'];
const HELP = ['اوامر', 'مساعده', 'help', 'commands'];
const SET_WORDS = ['خلي', 'حط', 'اجعل', 'عين', 'اضبط', 'set'];
const OFF_WORDS = ['وقف', 'اقفل', 'الغ', 'الغي', 'اطفي', 'عطل', 'off'];

const HELP_TEXT = [
  '📖 **أوامر HYDRA BOT** (اكتبها بالعربي عادي):',
  '• `@فلان تايم اوت 10 دقايق` / `فك التايم اوت عن @فلان`',
  '• `@فلان اطرده` / `@فلان بان` / `فك البان عن رقم_الـID`',
  '• `@فلان حذر بسبب كذا` / `تحذيرات @فلان` / `شيل تحذيرات @فلان`',
  '• `@فلان اديله رتبة مشرف` / `@فلان شيل منه رتبة مشرف`',
  '• `امسح 20 رسالة`',
  '• `سلو مود 5 ثواني` (من 1 لـ 10) / `سلو مود 0` لإلغائه',
  '• `اقفل الروم` / `افتح الروم`',
  '• `معلومات @فلان` / `معلومات السيرفر`',
  '• `خلي الترحيب هنا` / `خلي الترحيب في #روم` (نفس الحاجة للوجات)',
  '• `خلي روم التيكتات هنا` (بيبعت زرار فتح تذكرة)',
  '• `رد` على رسالة + `رياكشن 😀 @رتبة` / `الغ رياكشن`',
  '• `ضيف رد مرحبا => اهلا بيك` / `امسح رد مرحبا` / `الردود`',
  '• `رتبة لفل 5 @رتبة` / `الغ رتبة لفل 5`  |  للكل: `لفل` و `توب`',
  '• `اكتب في #الروم: الرسالة بنيابة الأونر` (التوقيع اختياري)',
  '• `استطلاع السؤال` / `جيف اواي 10 دقايق الجائزة` / `قول الكلام`',
  '• `خلي الرتبة التلقائية @رتبة` / `الغ الرتبة التلقائية`',
  '• `وقف وضع الاقتحام` (لو الحماية فعّلته)',
  '• `شغل وضع التجربة` / `وقف وضع التجربة` (لتجربة الحماية على المشرفين)',
].join('\n');

// ================= الأوامر =================
async function handleCommand(msg) {
  const guild = msg.guild;
  const text = norm(msg.content.replace(/<@[!&]?\d+>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!text) return;
  const tokens = text.split(' ');
  const can = (perm) => msg.member.permissions.has(perm);

  const anyStaffPerm = [P.ModerateMembers, P.ManageMessages, P.ManageGuild, P.BanMembers, P.KickMembers, P.ManageChannels, P.ManageRoles].some(can);
  if (!anyStaffPerm) return;

  // ----- مساعدة -----
  if (tokens.length <= 2 && hasAny([tokens[0]], HELP)) return msg.reply(HELP_TEXT);

  // ----- تيكتات -----
  if (hasAny(tokens, ['تيكتات', 'تيكت', 'تذاكر']) && hasAny(tokens, SET_WORDS)) {
    if (!can(P.ManageChannels)) return;
    msg.handled = true;
    const tid = msg.mentions.channels.first()?.id || msg.content.match(/channels\/\d+\/(\d+)/)?.[1];
    const tch = (tid && guild.channels.cache.get(tid)) || msg.channel;
    if (!tch.isTextBased()) return msg.reply('❌ الروم ده مش روم كتابي.');
    await sendTicketPanel(tch).catch(() => msg.reply('❌ معنديش صلاحية الكتابة في الروم ده.'));
    if (tch.id === msg.channel.id) return msg.delete().catch(() => {});
    return msg.react('✅').catch(() => {});
  }

  // ----- رد تلقائي: "ضيف رد مرحبا => اهلا بيك" -----
  if (tokens.includes('رد') || tokens.includes('ردود')) {
    const rules = (data.autoReplies[guild.id] ||= {});
    const normTrig = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ');
    const add = msg.content.match(/(?:^|\s)رد(?:\s+تلقائي\S*)?\s*[:：]?\s*(.+?)\s*=>\s*([\s\S]+)/);
    if (add) {
      if (!can(P.ManageMessages)) return;
      msg.handled = true;
      const trig = normTrig(add[1]);
      if (!trig) return msg.reply('❓ اكتب الكلمة قبل `=>`');
      if (Object.keys(rules).length >= 50 && !rules[trig]) return msg.reply('❌ وصلت الحد الأقصى (50 رد).');
      rules[trig] = add[2].trim().slice(0, 1500);
      save();
      return msg.reply({ content: `✅ لو حد كتب **${trig}** هرد عليه.`, allowedMentions: { parse: [] } });
    }
    if (tokens.includes('ردود') && tokens.length <= 3 && !hasAny(tokens, [...CLEAR, ...UNDO])) {
      msg.handled = true;
      const list = Object.keys(rules);
      return msg.reply(list.length ? `💬 الردود (${list.length}):\n${list.map((k) => `• ${k}`).join('\n')}` : '💬 مفيش ردود تلقائية.');
    }
    if (tokens.includes('رد') && hasAny(tokens, [...CLEAR, ...UNDO])) {
      if (!can(P.ManageMessages)) return;
      msg.handled = true;
      const rest = tokens.slice(tokens.indexOf('رد') + 1).filter((t) => !t.startsWith('تلقائي'));
      const trig = normTrig(rest.join(' '));
      if (!Object.hasOwn(rules, trig)) return msg.reply('❓ مفيش رد بالكلمة دي. اكتب `الردود` تشوفهم.');
      delete rules[trig];
      save();
      return msg.reply(`✅ مسحت الرد على **${trig}**.`);
    }
  }

  // ----- رتبة لفل: "رتبة لفل 5 @رتبة" -----
  if (hasAny(tokens, ['لفل', 'level']) && hasAny(tokens, ROLE_WORD)) {
    if (!can(P.ManageRoles)) return;
    msg.handled = true;
    const n = text.match(/\d+/);
    if (!n) return msg.reply('🔢 اكتب رقم اللفل، مثال: `رتبة لفل 5 @رتبة`');
    const map = (data.levelRoles[guild.id] ||= {});
    if (hasAny(tokens, [...OFF_WORDS, ...UNDO])) {
      delete map[n[0]];
      save();
      return msg.reply(`✅ اتلغت رتبة لفل ${n[0]}.`);
    }
    const role = msg.mentions.roles.first();
    if (!role) return msg.reply('🎭 منشن الرتبة.');
    if (msg.member.id !== guild.ownerId && role.comparePositionTo(msg.member.roles.highest) >= 0) return msg.reply('❌ الرتبة دي أعلى منك أو زيك.');
    if (!role.editable) return msg.reply('❌ رتبة البوت لازم تكون أعلى من الرتبة دي.');
    map[n[0]] = role.id;
    save();
    return msg.reply(`✅ أي حد يوصل لفل ${n[0]} هياخد رتبة **${role.name}**.`);
  }

  // ----- رتب بالريأكشن: رد على رسالة واكتب "رياكشن 😀 @رتبة" -----
  if (hasAny(tokens, ['رياكشن', 'ريكشن', 'reaction'])) {
    if (!can(P.ManageRoles)) return;
    msg.handled = true;
    const refId = msg.reference?.messageId;
    if (!refId) return msg.reply('↩️ لازم ترد (Reply) على الرسالة اللي عايز الريأكشن عليها.');
    const target = await msg.channel.messages.fetch(refId).catch(() => null);
    if (!target) return msg.reply('❌ مش لاقي الرسالة دي.');
    if (hasAny(tokens, [...OFF_WORDS, ...UNDO, ...CLEAR])) {
      delete data.reactionRoles[refId];
      save();
      await target.reactions.removeAll().catch(() => {});
      return msg.reply('✅ شيلت الرتب بالريأكشن من الرسالة دي.');
    }
    const em = parseEmoji(msg.content);
    const role = msg.mentions.roles.first();
    if (!em || !role) return msg.reply('❓ الصيغة: ردّ على الرسالة واكتب `رياكشن 😀 @الرتبة`');
    if (msg.member.id !== guild.ownerId && role.comparePositionTo(msg.member.roles.highest) >= 0) return msg.reply('❌ الرتبة دي أعلى منك أو زيك.');
    if (!role.editable) return msg.reply('❌ رتبة البوت لازم تكون أعلى من الرتبة دي.');
    (data.reactionRoles[refId] ||= {})[em.key] = role.id;
    save();
    await target.react(em.react).catch(() => {});
    return msg.reply(`✅ أي حد يدوس ${em.react} هياخد رتبة **${role.name}**.`);
  }

  // ----- اكتب في روم: "اكتب في #الشات: مسابقة قريبا بنيابة الأونر" -----
  if (['اكتب', 'ارسل', 'اعلان', 'send'].includes(tokens[0])) {
    const chId = msg.mentions.channels.first()?.id || msg.content.match(/discord(?:app)?\.com\/channels\/\d+\/(\d+)/)?.[1];
    if (chId) {
      if (!can(P.ManageMessages)) return;
      msg.handled = true;
      const ch = guild.channels.cache.get(chId);
      if (!ch || !ch.isTextBased()) return msg.reply('❌ مش لاقي الروم ده أو مش روم كتابي.');
      let body = msg.content
        .replace(/^\S+\s*/, '')
        .replace(/https?:\/\/\S*discord(?:app)?\.com\/channels\/\d+\/\d+\S*/, '')
        .replace(/<#\d+>/, '')
        .replace(/^\s*(?:في|ف|فى)(?=\s|:|$)\s*/, '')
        .replace(/^\s*[:：\-]\s*/, '')
        .trim();
      let signer = null;
      const sig = body.match(/\s*بنياب[ةه]\s+([^\n]+?)\s*$/);
      if (sig) {
        body = body.slice(0, sig.index).trim();
        signer = sig[1].trim();
        if (/^ال[اأ]ونر$/.test(signer)) {
          const owner = await guild.fetchOwner().catch(() => null);
          signer = `الأونر${owner ? ' ' + owner.displayName : ''}`;
        }
      }
      if (!body) return msg.reply('❓ اكتب الرسالة، مثال: `اكتب في #الشات: في مسابقة قريبا بنيابة الأونر`');
      const content = signer ? `${body}\n\n— بنيابة ${signer}` : body;
      const ok = await ch
        .send({
          content: content.slice(0, 1900),
          allowedMentions: { parse: can(P.MentionEveryone) ? ['users', 'roles', 'everyone'] : ['users', 'roles'] },
        })
        .then(() => true)
        .catch(() => false);
      await logAction(guild, `📢 ${msg.author.tag} بعت رسالة في ${ch}.`);
      return ok ? msg.react('✅').catch(() => {}) : msg.reply('❌ معنديش صلاحية الكتابة في الروم ده.');
    }
  }

  // ----- استطلاع / قول / جيف أواي -----
  if (['استطلاع', 'poll'].includes(tokens[0])) {
    if (!can(P.ManageMessages)) return;
    msg.handled = true;
    const q = msg.content.replace(/^\S+\s*/, '').trim();
    if (!q) return msg.reply('❓ اكتب السؤال، مثال: `استطلاع نعمل مسابقة؟`');
    await msg.delete().catch(() => {});
    const p = await msg.channel.send({ content: `📊 **استطلاع رأي**\n${q}`, allowedMentions: { parse: [] } });
    await p.react('👍').catch(() => {});
    await p.react('👎').catch(() => {});
    return;
  }
  if (['قول', 'say'].includes(tokens[0])) {
    if (!can(P.ManageMessages)) return;
    msg.handled = true;
    const t = msg.content.replace(/^\S+\s*/, '').trim();
    if (!t) return;
    await msg.delete().catch(() => {});
    return void (await msg.channel.send({ content: t, allowedMentions: { parse: [] } }));
  }
  if (['جيف', 'giveaway'].includes(tokens[0]) && (tokens[1] === 'اوي' || tokens[1] === 'اواي' || tokens[0] === 'giveaway')) {
    if (!can(P.ManageMessages)) return;
    msg.handled = true;
    const raw = msg.content.replace(/<@[!&]?\d+>/g, '').trim().split(/\s+/);
    const ms = parseDuration(norm(raw.join(' ')));
    if (!ms || ms < 10 * SEC) return msg.reply('⏱️ الصيغة: `جيف اواي 10 دقايق الجائزة`');
    const i = raw.findIndex((t) => Object.hasOwn(UNITS, norm(t)));
    const drop = new Set();
    if (i >= 0) {
      drop.add(i);
      if (i > 0 && /^[\d٠-٩]+$/.test(raw[i - 1])) drop.add(i - 1);
      if (i > 0 && ['نص', 'نصف'].includes(norm(raw[i - 1]))) drop.add(i - 1);
    }
    const prize = raw.filter((t, k) => !drop.has(k) && !['جيف', 'اوي', 'اواي', 'giveaway'].includes(norm(t))).join(' ') || 'جايزة';
    await msg.delete().catch(() => {});
    const endsAt = Date.now() + ms;
    const m = await msg.channel.send({
      content: `🎉 **جيف أواي** 🎉\nالجائزة: **${prize}**\nبتنتهي: <t:${Math.floor(endsAt / 1000)}:R>\nدوس 🎉 عشان تشترك!`,
      allowedMentions: { parse: [] },
    });
    await m.react('🎉').catch(() => {});
    data.giveaways[m.id] = { channelId: msg.channel.id, prize, endsAt };
    save();
    return;
  }

  // ----- تحديد روم اللوجات / الترحيب -----
  if (hasAny(tokens, SET_WORDS) && hasAny(tokens, ['لوجات', 'لوج', 'logs', 'log'])) {
    if (!can(P.ManageGuild)) return;
    const ch = chanFrom(msg);
    data.logChannel[guild.id] = ch.id;
    save();
    return msg.reply(`✅ تمام، هبعت اللوجات في ${ch}.`);
  }
  if (hasAny(tokens, SET_WORDS) && hasAny(tokens, ['ترحيب', 'welcome'])) {
    if (!can(P.ManageGuild)) return;
    const ch = chanFrom(msg);
    data.welcomeChannel[guild.id] = ch.id;
    save();
    return msg.reply(`✅ تمام، هرحب بالأعضاء الجداد في ${ch}.`);
  }

  // ----- إيقاف وضع الاقتحام -----
  if (tokens.includes('وضع') && hasAny(tokens, ['اقتحام'])) {
    if (!can(P.ManageGuild)) return;
    raidUntil.delete(guild.id);
    joinLog.delete(guild.id);
    await logAction(guild, `✅ ${msg.author.tag} وقف وضع الاقتحام.`);
    return msg.reply('✅ وقفت وضع الاقتحام.');
  }

  // ----- الرتبة التلقائية -----
  if (hasAny(tokens, ['تلقائيه']) && hasAny(tokens, ROLE_WORD)) {
    if (!can(P.ManageGuild)) return;
    if (hasAny(tokens, [...OFF_WORDS, ...UNDO])) {
      delete data.autoRole[guild.id];
      save();
      return msg.reply('✅ اتلغت الرتبة التلقائية.');
    }
    const role = msg.mentions.roles.first();
    if (!role) return msg.reply('🎭 منشن الرتبة، مثال: `خلي الرتبة التلقائية @عضو`');
    if (msg.member.id !== guild.ownerId && role.comparePositionTo(msg.member.roles.highest) >= 0) {
      return msg.reply('❌ الرتبة دي أعلى منك أو زيك.');
    }
    if (!role.editable) return msg.reply('❌ رتبة البوت لازم تكون أعلى من الرتبة دي.');
    data.autoRole[guild.id] = role.id;
    save();
    return msg.reply(`✅ أي حد يدخل هياخد رتبة **${role.name}** تلقائي.`);
  }

  // ----- وضع التجربة -----
  if (tokens.includes('وضع') && hasAny(tokens, ['تجربه'])) {
    if (!can(P.Administrator)) return;
    data.testMode = !hasAny(tokens, OFF_WORDS);
    save();
    return msg.reply(
      data.testMode
        ? '🧪 وضع التجربة شغال: الحماية هتتطبق على المشرفين كمان. وقفه لما تخلص.'
        : '✅ وقفت وضع التجربة: المشرفين معفيين من الحماية.'
    );
  }

  // ----- سلو مود (من 1 لـ 10 ثواني، و 0 للإلغاء) -----
  if (/سلو ?مود|slow ?mode/.test(text)) {
    if (!can(P.ManageChannels)) return;
    const n = text.match(/\d+/);
    let secs;
    if (hasAny(tokens, [...UNDO, 'وقف']) || (n && parseInt(n[0], 10) === 0)) secs = 0;
    else if (!n) return msg.reply('⏱️ اكتب عدد الثواني من 1 لـ 10، مثال: `سلو مود 5 ثواني`');
    else secs = parseInt(n[0], 10);
    if (secs > 10) return msg.reply('❌ السلو مود من 1 لـ 10 ثواني بس.');
    await msg.channel.setRateLimitPerUser(secs, `بأمر من ${msg.author.tag}`);
    await logAction(guild, `🐢 ${msg.author.tag} ظبط سلو مود ${secs} ثانية في ${msg.channel}.`);
    return msg.reply(secs ? `🐢 تم تفعيل السلو مود: ${secs} ثواني.` : '✅ تم إلغاء السلو مود.');
  }

  // ----- قفل وفتح الروم -----
  if (hasAny(tokens, CHANNEL_WORD) && (hasAny(tokens, LOCK) || hasAny(tokens, UNLOCK))) {
    if (!can(P.ManageChannels)) return;
    const lock = hasAny(tokens, LOCK);
    await msg.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: lock ? false : null }, { reason: `بأمر من ${msg.author.tag}` });
    await logAction(guild, `${lock ? '🔒' : '🔓'} ${msg.author.tag} ${lock ? 'قفل' : 'فتح'} ${msg.channel}.`);
    return msg.reply(lock ? '🔒 تم قفل الروم.' : '🔓 تم فتح الروم.');
  }

  // ----- فك البان بالـ ID -----
  const idMatch = text.match(/\d{17,20}/);
  if (idMatch && (tokens.includes('unban') || (hasAny(tokens, UNDO) && hasAny(tokens, BAN)))) {
    if (!can(P.BanMembers)) return;
    await guild.members.unban(idMatch[0], `بأمر من ${msg.author.tag}`);
    await logAction(guild, `✅ ${msg.author.tag} فك البان عن ${idMatch[0]}.`);
    return msg.reply('✅ تم فك البان.');
  }

  // ----- معلومات -----
  if (tokens[0] === 'معلومات' || tokens[0] === 'info') {
    const t = msg.mentions.members.first();
    if (t) {
      const warns = (data.warnings[`${guild.id}:${t.id}`] || []).length;
      return msg.reply(
        [
          `👤 **${t.user.tag}**`,
          `🆔 ${t.id}`,
          `📅 أنشأ الحساب: <t:${Math.floor(t.user.createdTimestamp / 1000)}:D>`,
          `📥 دخل السيرفر: <t:${Math.floor((t.joinedTimestamp || Date.now()) / 1000)}:D>`,
          `🎭 عدد الرتب: ${t.roles.cache.filter((r) => r.id !== guild.id).size}`,
          `⚠️ التحذيرات: ${warns}/${CONFIG.maxWarnings}`,
        ].join('\n')
      );
    }
    if (hasAny(tokens, ['سيرفر'])) {
      return msg.reply(
        [
          `🏠 **${guild.name}**`,
          `👥 الأعضاء: ${guild.memberCount}`,
          `👑 الأونر: <@${guild.ownerId}>`,
          `📅 اتعمل: <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
          `💬 الرومات: ${guild.channels.cache.size}`,
          `🎭 الرتب: ${guild.roles.cache.size}`,
        ].join('\n')
      );
    }
    return;
  }

  // ----- عرض / مسح التحذيرات -----
  if (hasAny(tokens, WARNINGS_WORD)) {
    const t = msg.mentions.members.first();
    if (!t) return msg.reply('👤 منشن الشخص، مثال: `تحذيرات @فلان`');
    const key = `${guild.id}:${t.id}`;
    if (hasAny(tokens, [...UNDO, ...CLEAR, 'صفر'])) {
      if (!can(P.ModerateMembers)) return;
      data.warnings[key] = [];
      save();
      await logAction(guild, `🧹 ${msg.author.tag} مسح تحذيرات ${t.user.tag}.`);
      return msg.reply(`✅ تم مسح تحذيرات ${t}.`);
    }
    const list = data.warnings[key] || [];
    if (!list.length) return msg.reply(`✅ ${t} معندوش تحذيرات.`);
    const lines = list.slice(-5).map((w, i) => `${i + 1}. ${w.reason} — <t:${Math.floor(w.at / 1000)}:R>`);
    return msg.reply(`⚠️ تحذيرات ${t} (${list.length}):\n${lines.join('\n')}`);
  }

  // ----- مسح رسايل: "امسح 20 رسالة" -----
  if (hasAny([tokens[0]], CLEAR) && !hasAny(tokens, ROLE_WORD)) {
    const n = text.match(/\d+/);
    if (!can(P.ManageMessages)) return;
    if (!n) return msg.reply('🧹 اكتب العدد، مثال: `امسح 20 رسالة`');
    const count = Math.min(parseInt(n[0], 10), 100);
    await msg.delete().catch(() => {});
    const deleted = await msg.channel.bulkDelete(count, true);
    await logAction(guild, `🧹 ${msg.author.tag} مسح ${deleted.size} رسالة في ${msg.channel}.`);
    const note = await msg.channel.send(`🧹 تم مسح ${deleted.size} رسالة.`);
    return setTimeout(() => note.delete().catch(() => {}), 4000);
  }

  // ===== من هنا لازم يكون فيه منشن لشخص =====
  const target = msg.mentions.members.first();
  if (!target || target.id === client.user.id) return;

  // ----- رتب -----
  if (hasAny(tokens, ROLE_WORD)) {
    if (!can(P.ManageRoles)) return;
    const role = findRole(guild, text);
    if (!role) return msg.reply('❓ مش لاقي الرتبة دي، اكتب اسمها زي ما هو في السيرفر.');
    const isOwner = msg.member.id === guild.ownerId;
    if (!isOwner && role.comparePositionTo(msg.member.roles.highest) >= 0) {
      return msg.reply('❌ الرتبة دي أعلى منك أو زيك، مينفعش تديها.');
    }
    if (!role.editable) {
      return msg.reply('❌ رتبة البوت لازم تكون أعلى من الرتبة دي (اسحبها لفوق من إعدادات الرتب).');
    }
    if (hasAny(tokens, ROLE_REMOVE)) {
      await target.roles.remove(role, `بأمر من ${msg.author.tag}`);
      await logAction(guild, `🎭 ${msg.author.tag} سحب رتبة ${role.name} من ${target.user.tag}.`);
      return msg.reply(`✅ تم سحب رتبة **${role.name}** من ${target}.`);
    }
    if (hasAny(tokens, ROLE_ADD)) {
      await target.roles.add(role, `بأمر من ${msg.author.tag}`);
      await logAction(guild, `🎭 ${msg.author.tag} أعطى ${target.user.tag} رتبة ${role.name}.`);
      return msg.reply(`✅ تم إعطاء ${target} رتبة **${role.name}**.`);
    }
    return;
  }

  // ----- تحذير يدوي -----
  if (hasAny(tokens, WARN)) {
    if (!can(P.ModerateMembers)) return;
    if (target.id !== msg.member.id && !outranks(msg.member, target)) {
      return msg.reply('❌ مينفعش تحذّر شخص رتبته أعلى منك أو زيك.');
    }
    const after = msg.content.split(/بسبب|عشان/)[1];
    const reason = (after ? after.replace(/<@[!&]?\d+>/g, '').trim() : '') || 'بدون سبب';
    return void (await applyWarning(guild, msg.channel, target, reason, msg.author.id));
  }

  // ----- تايم أوت -----
  if (TIMEOUT_WORDS.test(text)) {
    if (!can(P.ModerateMembers)) return;
    if (!target.moderatable || !outranks(msg.member, target)) {
      return msg.reply('❌ مقدرش أدّي تايم أوت للشخص ده (رتبته أعلى أو زيك، أو هو أدمن).');
    }
    if (hasAny(tokens, UNDO)) {
      await target.timeout(null);
      await logAction(guild, `🔊 ${msg.author.tag} فك التايم أوت عن ${target.user.tag}.`);
      return msg.reply(`✅ تم فك التايم أوت عن ${target}.`);
    }
    const ms = parseDuration(text);
    if (!ms) return msg.reply('⏱️ قولي المدة كام؟ مثال: `@فلان تايم اوت 10 دقايق`');
    if (ms > 28 * DAY) return msg.reply('❌ أقصى مدة تايم أوت 28 يوم.');
    await target.timeout(ms, `بأمر من ${msg.author.tag}`);
    await logAction(guild, `🔇 ${msg.author.tag} أدّى ${target.user.tag} تايم أوت ${formatMs(ms)}.`);
    return msg.reply(`🔇 تم إعطاء ${target} تايم أوت لمدة ${formatMs(ms)}.`);
  }

  // ----- طرد -----
  if (hasAny(tokens, KICK)) {
    if (!can(P.KickMembers)) return;
    if (!target.kickable || !outranks(msg.member, target)) {
      return msg.reply('❌ مقدرش أطرد الشخص ده (رتبته أعلى أو زيك، أو هو أدمن).');
    }
    await target.kick(`بأمر من ${msg.author.tag}`);
    await logAction(guild, `👢 ${msg.author.tag} طرد ${target.user.tag}.`);
    return msg.reply(`👢 تم طرد **${target.user.tag}**.`);
  }

  // ----- بان -----
  if (hasAny(tokens, BAN)) {
    if (!can(P.BanMembers)) return;
    if (!target.bannable || !outranks(msg.member, target)) {
      return msg.reply('❌ مقدرش أبنّد الشخص ده (رتبته أعلى أو زيك، أو هو أدمن).');
    }
    await target.ban({ reason: `بأمر من ${msg.author.tag}` });
    await logAction(guild, `🔨 ${msg.author.tag} حظر ${target.user.tag}.`);
    return msg.reply(`🔨 تم حظر **${target.user.tag}**.`);
  }
}

// ================= الأحداث =================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild || !msg.member) return;
  try {
    if (await automod(msg)) return;
    if (await handlePublic(msg)) return;
    await handleCommand(msg);
    if (msg.handled) return;
    await autoReply(msg);
    await awardXp(msg);
  } catch (err) {
    console.error(err);
    msg.reply('❌ حصل خطأ وأنا بنفذ الأمر.').catch(() => {});
  }
});

client.on('guildMemberAdd', async (member) => {
  if (await checkRaid(member)) return; // اتطرد بسبب الاقتحام
  const rid = data.autoRole[member.guild.id];
  const autoRole =
    (rid && member.guild.roles.cache.get(rid)) ||
    member.guild.roles.cache.find((r) => r.name === CONFIG.defaultAutoRoleName);
  if (autoRole && autoRole.editable) await member.roles.add(autoRole, 'رتبة تلقائية').catch(() => {});
  const ch = findChannel(member.guild, 'welcome');
  if (ch) {
    await ch.send({ content: CONFIG.welcomeText(member), allowedMentions: { users: [member.id] } }).catch(() => {});
  }
  logAction(member.guild, `📥 ${member.user.tag} دخل السيرفر.`);
});

client.on('guildMemberRemove', async (member) => {
  logAction(member.guild, `📤 ${member.user?.tag || member.id} خرج من السيرفر.`);
  if (botKicked.has(member.id)) return;
  // لو اتطرد بواسطة حد: عدّه في حماية التخريب
  const ex = await whoDid(member.guild, AuditLogEvent.MemberKick, member.id, 1);
  await nukeGuard(member.guild, ex, 'remove', CONFIG.antiNuke.removes, 'طرد/بان أعضاء كتير');
});

client.on('guildBanAdd', async (ban) => {
  const ex = await whoDid(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  await nukeGuard(ban.guild, ex, 'remove', CONFIG.antiNuke.removes, 'طرد/بان أعضاء كتير');
});

client.on('channelDelete', async (ch) => {
  if (!ch.guild) return;
  if (data.tickets[ch.id]) { delete data.tickets[ch.id]; save(); }
  const ex = await whoDid(ch.guild, AuditLogEvent.ChannelDelete, ch.id);
  await nukeGuard(ch.guild, ex, 'delete', CONFIG.antiNuke.deletes, 'مسح رومات/رتب كتير');
});

client.on('roleDelete', async (role) => {
  const ex = await whoDid(role.guild, AuditLogEvent.RoleDelete, role.id);
  await nukeGuard(role.guild, ex, 'delete', CONFIG.antiNuke.deletes, 'مسح رومات/رتب كتير');
});

client.on('messageReactionAdd', (r, u) => handleReaction(r, u, true));
client.on('messageReactionRemove', (r, u) => handleReaction(r, u, false));

client.on('interactionCreate', async (i) => {
  if (!i.guild || !(i.isButton() || i.isModalSubmit())) return;
  try {
    // الزرار -> نافذة بتسأل: إيه مشكلتك؟
    if (i.isButton() && i.customId === 'ticket_open') {
      const modal = new ModalBuilder()
        .setCustomId('ticket_modal')
        .setTitle('الدعم')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('problem')
              .setLabel('إيه مشكلتك؟')
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(500)
              .setRequired(true)
          )
        );
      return i.showModal(modal);
    }

    // بعد ما يكتب المشكلة -> البوت يفتح روم باسم المشكلة
    if (i.isModalSubmit() && i.customId === 'ticket_modal') {
      const ownerId = i.guild.ownerId;
      if (i.user.id !== ownerId) {
        const old = Object.entries(data.tickets).find(([cid, uid]) => uid === i.user.id && i.guild.channels.cache.has(cid));
        if (old) return i.reply({ content: `❌ عندك تذكرة مفتوحة: <#${old[0]}>`, flags: 64 });
      }
      await i.deferReply({ flags: 64 });
      const problem = i.fields.getTextInputValue('problem').trim();
      const slug =
        problem
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\p{L}\p{N}_-]/gu, '')
          .replace(/-+/g, '-')
          .slice(0, 50) || `ticket-${i.user.id.slice(-4)}`;
      const base = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory];
      const viewers = [...new Set([i.user.id, ownerId])];
      const overwrites = CONFIG.ticketPrivate
        ? [
            { id: i.guild.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
            { id: client.user.id, type: OverwriteType.Member, allow: [...base, P.ManageChannels] },
            ...viewers.map((id) => ({ id, type: OverwriteType.Member, allow: [...base, P.AttachFiles, P.ManageMessages] })),
          ]
        : undefined;
      const ch = await i.guild.channels.create({
        name: slug,
        type: ChannelType.GuildText,
        parent: i.channel?.parentId ?? null,
        topic: `تذكرة ${i.user.tag}: ${problem}`.slice(0, 1000),
        permissionOverwrites: overwrites,
        reason: `تذكرة من ${i.user.tag}`,
      });
      data.tickets[ch.id] = i.user.id;
      save();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('قفل التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger)
      );
      const ping = ownerId === i.user.id ? '' : ` <@${ownerId}>`;
      await ch.send({
        content: `🎫 تذكرة جديدة من ${i.user}${ping}\n**المشكلة:** ${problem}\n\nاكتب باقي التفاصيل هنا والأونر هيرد عليك.`,
        components: [row],
        allowedMentions: { users: [...new Set([i.user.id, ownerId])] },
      });
      await logAction(i.guild, `🎫 ${i.user.tag} فتح تذكرة ${ch} — ${problem.slice(0, 200)}`);
      return i.editReply(`✅ اتفتحت تذكرتك: ${ch}`);
    }

    // قفل التذكرة
    if (i.isButton() && i.customId === 'ticket_close') {
      const opener = data.tickets[i.channel.id];
      if (!opener) return;
      if (i.user.id !== opener && i.user.id !== i.guild.ownerId && !i.member.permissions.has(P.ManageMessages)) {
        return i.reply({ content: '❌ مش مسموح لك تقفل التذكرة دي.', flags: 64 });
      }
      await i.reply('🔒 التذكرة هتتقفل بعد 5 ثواني...');
      await logAction(i.guild, `🔒 ${i.user.tag} قفل تذكرة ${i.channel.name}.`);
      setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
  } catch (e) {
    console.error('interaction:', e);
    const txt = `❌ حصل خطأ: ${e.message}`.slice(0, 300);
    if (!i.replied && !i.deferred) i.reply({ content: txt, flags: 64 }).catch(() => {});
    else i.editReply(txt).catch(() => {});
  }
});

client.once('clientReady', () => console.log(`شغال كـ ${client.user.tag}`));

if (require.main === module) {
  setInterval(checkGiveaways, 15 * SEC);
  client.login(process.env.TOKEN);
}

module.exports = { checkSwear, tokenize, hasBlockedLink, parseDuration };
