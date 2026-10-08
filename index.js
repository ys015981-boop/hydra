const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', () => {
  console.log(البوت اشتغل باسم ${client.user.tag});
});

client.on('messageCreate', message => {
  if (message.content === '!ping') {
    message.reply('Pong! البوت شغال تمام ✅');
  }
});

client.login(process.env.MTU1NzQ2NzI2OTUyODAyNzIyNg.GU4Ulm.pd3mI9Dts47vMjOLrpdr8VSKie3ftFznqVU-_w);
