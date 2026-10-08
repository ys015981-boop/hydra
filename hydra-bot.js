// HYDRA BOT - كل البوت في ملف واحد
// التشغيل: set TOKEN=توكنك   ثم   node hydra-bot.js
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, PermissionsBitField, ChannelType } = require('discord.js');
const P = PermissionsBitField.Flags;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
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
  welcomeText: (m) => `🎉 نورت السيرفر يا ${m}!\nأنت العضو رقم ${m.guild.memberCount}.`,
};

// ================= حفظ البيانات (تحذيرات وإعدادات الرومات) =================
const DATA_FILE = path.join(__dirname, 'data.json');
let data = { warnings: {}, logChannel: {}, welcomeChannel: {}, testMode: false };
try {
  data = { ...data, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
} catch {}
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
  '• `خلي روم اللوجات هنا` / `خلي روم الترحيب هنا`',
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

  // ----- تحديد روم اللوجات / الترحيب -----
  if (hasAny(tokens, SET_WORDS) && hasAny(tokens, ['لوجات', 'لوج', 'logs', 'log'])) {
    if (!can(P.ManageGuild)) return;
    data.logChannel[guild.id] = msg.channel.id;
    save();
    return msg.reply('✅ تمام، هبعت اللوجات في الروم ده.');
  }
  if (hasAny(tokens, SET_WORDS) && hasAny(tokens, ['ترحيب', 'welcome'])) {
    if (!can(P.ManageGuild)) return;
    data.welcomeChannel[guild.id] = msg.channel.id;
    save();
    return msg.reply('✅ تمام، هرحب بالأعضاء الجداد في الروم ده.');
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
    await handleCommand(msg);
  } catch (err) {
    console.error(err);
    msg.reply('❌ حصل خطأ وأنا بنفذ الأمر.').catch(() => {});
  }
});

client.on('guildMemberAdd', async (member) => {
  const ch = findChannel(member.guild, 'welcome');
  if (ch) {
    await ch.send({ content: CONFIG.welcomeText(member), allowedMentions: { users: [member.id] } }).catch(() => {});
  }
  logAction(member.guild, `📥 ${member.user.tag} دخل السيرفر.`);
});

client.on('guildMemberRemove', (member) => {
  logAction(member.guild, `📤 ${member.user?.tag || member.id} خرج من السيرفر.`);
});

client.once('clientReady', () => console.log(`شغال كـ ${client.user.tag}`));

if (require.main === module) {
  client.login(process.env.TOKEN);
}

module.exports = { checkSwear, tokenize, hasBlockedLink, parseDuration };
