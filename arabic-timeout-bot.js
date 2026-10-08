// npm i discord.js
// شغّله بـ: TOKEN=توكن_البوت node arabic-timeout-bot.js
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// توحيد الكتابة: أ/إ/آ -> ا ، ة -> ه ، ى -> ي ، شيل التشكيل ، الأرقام العربي -> إنجليزي
const norm = (s) =>
  s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .toLowerCase();

const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;

// الكلمة -> [المدة بالميلي ثانية, عدد ثابت لو مثنى]
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
  const n = fixed ?? (m[1] ? parseInt(m[1], 10) : 1);
  return n * unitMs;
}

const TIMEOUT_WORDS = /(تايم ?اوت|timeout|اسكت|ميوت|mute)/;
const REMOVE_WORDS = /(فك|الغ|شيل|الغي)/;
const MAX_MS = 28 * DAY; // أقصى مدة يسمح بيها ديسكورد

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  const target = msg.mentions.members.first();
  if (!target) return;

  // شيل المنشن وطبّع الكلام
  const text = norm(msg.content.replace(/<@!?\d+>/g, ' '));
  if (!TIMEOUT_WORDS.test(text)) return;

  // لازم اللي بيكتب يكون عنده صلاحية
  if (!msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

  if (!target.moderatable) {
    return msg.reply('❌ مقدرش أدّي تايم أوت للشخص ده (رتبته أعلى من رتبة البوت أو هو أدمن).');
  }

  try {
    // فك التايم أوت: "فك التايم اوت عن @فلان"
    if (REMOVE_WORDS.test(text)) {
      await target.timeout(null);
      return msg.reply(`✅ تم فك التايم أوت عن ${target}.`);
    }

    const ms = parseDuration(text);
    if (!ms) {
      return msg.reply('⏱️ قولي المدة كام؟ مثال: `@فلان تايم اوت 10 دقايق`');
    }
    if (ms > MAX_MS) {
      return msg.reply('❌ أقصى مدة تايم أوت 28 يوم.');
    }

    await target.timeout(ms, `بأمر من ${msg.author.tag}`);
    await msg.reply(`🔇 تم إعطاء ${target} تايم أوت لمدة ${formatMs(ms)}.`);
  } catch (err) {
    console.error(err);
    msg.reply('❌ حصل خطأ وأنا بنفذ الأمر.');
  }
});

function formatMs(ms) {
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const s = Math.floor((ms % MIN) / SEC);
  return [d && `${d} يوم`, h && `${h} ساعة`, m && `${m} دقيقة`, s && `${s} ثانية`]
    .filter(Boolean)
    .join(' و ');
}

client.once('ready', () => console.log(`شغال كـ ${client.user.tag}`));
client.login(process.env.TOKEN);
