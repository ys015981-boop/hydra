// شغّله بـ: set TOKEN=توكنك  ثم  node arabic-timeout-bot.js
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const P = PermissionsBitField.Flags;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ---------- أدوات مساعدة ----------

// توحيد الكتابة: أ/إ/آ -> ا ، ة -> ه ، ى -> ي ، شيل التشكيل ، الأرقام العربي -> إنجليزي
const norm = (s) =>
  s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .toLowerCase();

// اسم الرتبة بدون إيموجي أو رموز
const normName = (s) => norm(s).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

const strip = (w) => w.replace(/^ال/, '');
const hasAny = (tokens, list) => tokens.some((t) => list.includes(t) || list.includes(strip(t)));

const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;

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
  return [d && `${d} يوم`, h && `${h} ساعة`, m && `${m} دقيقة`, s && `${s} ثانية`]
    .filter(Boolean)
    .join(' و ');
}

// هل المشرف رتبته أعلى من الشخص؟ (صاحب السيرفر دايمًا أعلى)
const outranks = (mod, target) =>
  mod.id === mod.guild.ownerId || mod.roles.highest.comparePositionTo(target.roles.highest) > 0;

// دوّر على رتبة اسمها مكتوب في الرسالة
function findRole(guild, text) {
  return [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.name.length - a.name.length)
    .find((r) => {
      const n = normName(r.name);
      return n && text.includes(n);
    });
}

// ---------- الكلمات اللي البوت بيفهمها ----------
const TIMEOUT_WORDS = /(تايم ?اوت|timeout|اسكت|ميوت|mute)/;
const UNDO = ['فك', 'الغ', 'الغي', 'شيل', 'ازل'];
const KICK = ['اطرد', 'اطرده', 'اطردوه', 'طرد', 'كيك', 'kick'];
const BAN = ['بان', 'حظر', 'احظر', 'احظره', 'ban'];
const CLEAR = ['امسح', 'مسح', 'نضف', 'احذف', 'clear', 'امسحلي'];
const ROLE_WORD = ['رتبه', 'رول', 'role'];
const ROLE_ADD = ['اديله', 'ادي', 'اعطيه', 'اعطي', 'ضيف', 'ضيفله', 'add'];
const ROLE_REMOVE = ['شيل', 'شيلها', 'سحب', 'ازل', 'ازله', 'امسح', 'احذف', 'remove'];

// ---------- المعالج الرئيسي ----------
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild || !msg.member) return;

  const text = norm(msg.content.replace(/<@[!&]?\d+>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!text) return;
  const tokens = text.split(' ');
  const can = (perm) => msg.member.permissions.has(perm);

  try {
    // ===== فك البان بالـ ID: "فك البان عن 123456789012345678" =====
    const idMatch = text.match(/\d{17,20}/);
    if (idMatch && (tokens.includes('unban') || (hasAny(tokens, UNDO) && hasAny(tokens, BAN)))) {
      if (!can(P.BanMembers)) return;
      await msg.guild.members.unban(idMatch[0], `بأمر من ${msg.author.tag}`);
      return msg.reply('✅ تم فك البان.');
    }

    // ===== مسح رسايل: "امسح 20 رسالة" =====
    if (hasAny([tokens[0]], CLEAR) && !hasAny(tokens, ROLE_WORD)) {
      const n = text.match(/\d+/);
      if (!can(P.ManageMessages)) return;
      if (!n) return msg.reply('🧹 اكتب العدد، مثال: `امسح 20 رسالة`');
      const count = Math.min(parseInt(n[0], 10), 100);
      await msg.delete().catch(() => {});
      const deleted = await msg.channel.bulkDelete(count, true);
      const note = await msg.channel.send(`🧹 تم مسح ${deleted.size} رسالة.`);
      return setTimeout(() => note.delete().catch(() => {}), 4000);
    }

    // من هنا لازم يكون فيه منشن لشخص
    const target = msg.mentions.members.first();
    if (!target || target.id === client.user.id) return;

    // ===== رتب: "اديله رتبة مشرف" / "شيل منه رتبة مشرف" =====
    if (hasAny(tokens, ROLE_WORD)) {
      if (!can(P.ManageRoles)) return;
      const role = findRole(msg.guild, text);
      if (!role) return msg.reply('❓ مش لاقي الرتبة دي، اكتب اسمها زي ما هو في السيرفر.');
      const isOwner = msg.member.id === msg.guild.ownerId;
      if (!isOwner && role.comparePositionTo(msg.member.roles.highest) >= 0) {
        return msg.reply('❌ الرتبة دي أعلى منك أو زيك، مينفعش تديها.');
      }
      if (!role.editable) {
        return msg.reply('❌ رتبة البوت لازم تكون أعلى من الرتبة دي (اسحبها لفوق من إعدادات الرتب).');
      }
      if (hasAny(tokens, ROLE_REMOVE)) {
        await target.roles.remove(role, `بأمر من ${msg.author.tag}`);
        return msg.reply(`✅ تم سحب رتبة **${role.name}** من ${target}.`);
      }
      if (hasAny(tokens, ROLE_ADD)) {
        await target.roles.add(role, `بأمر من ${msg.author.tag}`);
        return msg.reply(`✅ تم إعطاء ${target} رتبة **${role.name}**.`);
      }
      return;
    }

    // ===== تايم أوت =====
    if (TIMEOUT_WORDS.test(text)) {
      if (!can(P.ModerateMembers)) return;
      if (!target.moderatable || !outranks(msg.member, target)) {
        return msg.reply('❌ مقدرش أدّي تايم أوت للشخص ده (رتبته أعلى أو زيك، أو هو أدمن).');
      }
      if (hasAny(tokens, UNDO)) {
        await target.timeout(null);
        return msg.reply(`✅ تم فك التايم أوت عن ${target}.`);
      }
      const ms = parseDuration(text);
      if (!ms) return msg.reply('⏱️ قولي المدة كام؟ مثال: `@فلان تايم اوت 10 دقايق`');
      if (ms > 28 * DAY) return msg.reply('❌ أقصى مدة تايم أوت 28 يوم.');
      await target.timeout(ms, `بأمر من ${msg.author.tag}`);
      return msg.reply(`🔇 تم إعطاء ${target} تايم أوت لمدة ${formatMs(ms)}.`);
    }

    // ===== طرد =====
    if (hasAny(tokens, KICK)) {
      if (!can(P.KickMembers)) return;
      if (!target.kickable || !outranks(msg.member, target)) {
        return msg.reply('❌ مقدرش أطرد الشخص ده (رتبته أعلى أو زيك، أو هو أدمن).');
      }
      await target.kick(`بأمر من ${msg.author.tag}`);
      return msg.reply(`👢 تم طرد **${target.user.tag}**.`);
    }

    // ===== بان =====
    if (hasAny(tokens, BAN)) {
      if (!can(P.BanMembers)) return;
      if (!target.bannable || !outranks(msg.member, target)) {
        return msg.reply('❌ مقدرش أبنّد الشخص ده (رتبته أعلى أو زيك، أو هو أدمن).');
      }
      await target.ban({ reason: `بأمر من ${msg.author.tag}` });
      return msg.reply(`🔨 تم حظر **${target.user.tag}**.`);
    }
  } catch (err) {
    console.error(err);
    msg.reply('❌ حصل خطأ وأنا بنفذ الأمر.').catch(() => {});
  }
});

client.once('clientReady', () => console.log(`شغال كـ ${client.user.tag}`));
client.login(process.env.TOKEN);
