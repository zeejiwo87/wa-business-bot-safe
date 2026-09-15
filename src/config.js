require('dotenv').config();


// ====================================================================
// ⚙️ KONFIGURASI BOT
// ====================================================================

module.exports = {

  // ==================================================================
  // 🤖 IDENTITAS BOT
  // ==================================================================

  botName:
    process.env.BOT_NAME ||
    'Asistensi Tugas .ID',


  // ==================================================================
  // ⌨️ PREFIX COMMAND
  // ==================================================================

  prefix:
    process.env.PREFIX ||
    '.',


  // ==================================================================
  // 👑 OWNER
  // ==================================================================

  ownerNumber:
    (
      process.env.OWNER_NUMBER ||
      '6285876846768'
    ).replace(
      /\D/g,
      ''
    ),


  ownerMentionName:
    process.env.OWNER_MENTION_NAME ||
    'Fauzy',


  ownerInstagram:
    process.env.OWNER_INSTAGRAM ||
    '',


  ownerAbout:
    process.env.OWNER_ABOUT ||
    '',


  // ==================================================================
  // 🔎 GOOGLE SEARCH
  // ==================================================================

  googleApiKey:
    process.env.GOOGLE_API_KEY ||
    '',


  googleCx:
    process.env.GOOGLE_CX ||
    '',


  // ==================================================================
  // 🔎 SERPER
  // ==================================================================

  serperApiKey:
    process.env.SERPER_API_KEY ||
    '',


  // ==================================================================
  // 🌦️ BMKG
  // ==================================================================

  bmkgDefaultKelurahan:
    process.env.BMKG_DEFAULT_KELURAHAN ||
    'Tamansari',


  bmkgDefaultAdm4:
    process.env.BMKG_DEFAULT_ADM4 ||
    '35.07.06.2012',


  // ==================================================================
  // 💳 PAYMENT
  // ==================================================================

  payment: {

    // GOPAY

    gopayNumber:
      (
        process.env.GOPAY_NUMBER ||
        '085876846768'
      ).replace(
        /\D/g,
        ''
      ),


    gopayName:
      process.env.GOPAY_NAME ||
      'Ahmad Fauzy',


    // SEABANK

    seabankNumber:
      (
        process.env.SEABANK_NUMBER ||
        '901199544254'
      ).replace(
        /\D/g,
        ''
      ),


    seabankName:
      process.env.SEABANK_NAME ||
      'Ahmad Fauzy',

  },


  // ==================================================================
  // 🕒 TIMEZONE
  // ==================================================================

  tz:
    process.env.TZ ||
    'Asia/Jakarta',

};