require('dotenv').config();

module.exports = {
  botName: process.env.BOT_NAME || 'Fauzy Store Bot',
  prefix: process.env.PREFIX || '.',

  ownerNumber: (process.env.OWNER_NUMBER || '6285708095749').replace(/\D/g, ''),
  ownerMentionName: process.env.OWNER_MENTION_NAME || 'Fauzy',
  ownerInstagram: process.env.OWNER_INSTAGRAM || '',
  ownerAbout: process.env.OWNER_ABOUT || '',

  googleApiKey: process.env.GOOGLE_API_KEY || '',
  googleCx: process.env.GOOGLE_CX || '',
  serperApiKey: process.env.SERPER_API_KEY || '',

  bmkgDefaultKelurahan: process.env.BMKG_DEFAULT_KELURAHAN || 'Tamansari',
  bmkgDefaultAdm4: process.env.BMKG_DEFAULT_ADM4 || '35.07.06.2012',

  payment: {
    gopayNumber: process.env.GOPAY_NUMBER || '085876846768',
    gopayName: process.env.GOPAY_NAME || 'Ahmad Fauzy',
  },

  tz: process.env.TZ || 'Asia/Jakarta',
  logOrderMessages: String(process.env.LOG_ORDER_MESSAGES || 'true') === 'true',
};