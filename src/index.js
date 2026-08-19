const makeWASocket = require('@whiskeysockets/baileys').default;

const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  downloadMediaMessage,
  normalizeMessageContent,
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');

const route = require('./router');
const config = require('./config');
const { pickText } = require('./utils/format');

const {
  handleRevokeMessage,
  makeStoreKey,
} = require('./modules/privacyGuard');

const {
  handleNoCallCommand,
  handleIncomingCall,
} = require('./modules/nocall');

const {
  handleAITextCommand,
} = require('./modules/aiText');

require('./db');


// ====================================================================
// 🛡️ MESSAGE STORE ANTI DELETE
// ====================================================================

const messageStore = new Map();

// Pesan anti-delete disimpan selama 24 jam
const MESSAGE_STORE_TTL_MS = 24 * 60 * 60 * 1000;


// ====================================================================
// 📁 CACHE MEDIA ANTI DELETE
// Media disimpan di storage VPS, bukan disimpan terus di RAM
// ====================================================================

const MEDIA_CACHE_DIR = path.join(
  __dirname,
  '..',
  'storage',
  'antidelete-cache'
);

let mediaCacheInitialized = false;


// ====================================================================
// 📁 INITIALIZE MEDIA CACHE
// ====================================================================

async function initMediaCache() {
  if (mediaCacheInitialized) {
    return;
  }

  /*
    Saat proses Node benar-benar restart,
    messageStore juga kembali kosong.

    Maka cache media lama tidak berguna lagi
    dan boleh dibersihkan.
  */

  await fs.promises.rm(
    MEDIA_CACHE_DIR,
    {
      recursive: true,
      force: true,
    }
  );

  await fs.promises.mkdir(
    MEDIA_CACHE_DIR,
    {
      recursive: true,
    }
  );

  mediaCacheInitialized = true;
}


// ====================================================================
// 🛡️ DETEKSI PROTOCOL MESSAGE / REVOKE
// ====================================================================

function hasProtocolMessage(msg) {
  const normalized = normalizeMessageContent(
    msg.message || {}
  );

  return Boolean(
    normalized?.protocolMessage
  );
}


// ====================================================================
// 🔒 DETEKSI VIEW ONCE
//
// View Once sengaja TIDAK disimpan.
// Tidak download gambar/video View Once.
// Tidak simpan caption View Once.
// ====================================================================

function isViewOnceMessage(content) {
  if (!content || typeof content !== 'object') {
    return false;
  }

  // Wrapper View Once
  if (
    content.viewOnceMessage ||
    content.viewOnceMessageV2 ||
    content.viewOnceMessageV2Extension
  ) {
    return true;
  }

  // Beberapa pesan memiliki flag viewOnce langsung
  if (
    content.imageMessage?.viewOnce === true ||
    content.videoMessage?.viewOnce === true
  ) {
    return true;
  }

  // Cek jika pesan berada di dalam wrapper lain
  return Boolean(
    isViewOnceMessage(
      content.ephemeralMessage?.message
    ) ||

    isViewOnceMessage(
      content.documentWithCaptionMessage?.message
    ) ||

    isViewOnceMessage(
      content.editedMessage?.message
    )
  );
}


// ====================================================================
// 🎞️ DETEKSI MEDIA YANG DIDUKUNG ANTI DELETE
//
// Support:
// - Image
// - Video
// - Audio
// - Voice Note / VN
// - Sticker
//
// Tidak support View Once.
// ====================================================================

function getSupportedMediaInfo(msg) {
  const normalized = normalizeMessageContent(
    msg.message || {}
  );

  if (!normalized) {
    return null;
  }


  // =========================
  // IMAGE
  // =========================

  if (normalized.imageMessage) {
    return {
      type: 'image',

      mimetype:
        normalized.imageMessage.mimetype ||
        'image/jpeg',

      caption:
        normalized.imageMessage.caption ||
        '',

      ptt: false,
    };
  }


  // =========================
  // VIDEO
  // =========================

  if (normalized.videoMessage) {
    return {
      type: 'video',

      mimetype:
        normalized.videoMessage.mimetype ||
        'video/mp4',

      caption:
        normalized.videoMessage.caption ||
        '',

      ptt: false,
    };
  }


  // =========================
  // AUDIO / VOICE NOTE
  // =========================

  if (normalized.audioMessage) {
    return {
      type: 'audio',

      mimetype:
        normalized.audioMessage.mimetype ||
        'audio/ogg; codecs=opus',

      caption: '',

      ptt: Boolean(
        normalized.audioMessage.ptt
      ),
    };
  }


  // =========================
  // STICKER
  // =========================

  if (normalized.stickerMessage) {
    return {
      type: 'sticker',

      mimetype:
        normalized.stickerMessage.mimetype ||
        'image/webp',

      caption: '',

      ptt: false,
    };
  }


  return null;
}


// ====================================================================
// 📎 MENENTUKAN EXTENSION FILE MEDIA
// ====================================================================

function extensionFromMedia(mediaInfo) {
  const mime = String(
    mediaInfo?.mimetype || ''
  ).toLowerCase();


  if (
    mime.includes('jpeg') ||
    mime.includes('jpg')
  ) {
    return '.jpg';
  }


  if (mime.includes('png')) {
    return '.png';
  }


  if (mime.includes('webp')) {
    return '.webp';
  }


  if (mime.includes('mp4')) {
    return '.mp4';
  }


  if (mime.includes('ogg')) {
    return '.ogg';
  }


  if (mime.includes('mpeg')) {
    return '.mp3';
  }


  if (mime.includes('aac')) {
    return '.aac';
  }


  if (mime.includes('wav')) {
    return '.wav';
  }


  // Fallback berdasarkan tipe media

  if (mediaInfo?.type === 'image') {
    return '.jpg';
  }

  if (mediaInfo?.type === 'video') {
    return '.mp4';
  }

  if (mediaInfo?.type === 'audio') {
    return '.ogg';
  }

  if (mediaInfo?.type === 'sticker') {
    return '.webp';
  }


  return '.bin';
}


// ====================================================================
// 🧹 MEMBUAT NAMA FILE AMAN
// ====================================================================

function safeFilePart(value) {
  return String(
    value || 'unknown'
  ).replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
}


// ====================================================================
// 💾 DOWNLOAD DAN SIMPAN MEDIA KE VPS
// ====================================================================

async function cacheMediaToDisk(
  msg,
  mediaInfo
) {
  await initMediaCache();

  const messageId = safeFilePart(
    msg.key?.id
  );

  const remoteJid = safeFilePart(
    msg.key?.remoteJid
  );

  const extension =
    extensionFromMedia(mediaInfo);


  const filePath = path.join(
    MEDIA_CACHE_DIR,
    `${Date.now()}_${remoteJid}_${messageId}${extension}`
  );


  try {

    /*
      Menggunakan stream supaya video/audio
      tidak perlu ditahan seluruhnya di RAM.
    */

    const mediaStream =
      await downloadMediaMessage(
        msg,
        'stream',
        {}
      );


    await pipeline(
      mediaStream,
      fs.createWriteStream(filePath)
    );


    return filePath;

  } catch (err) {

    // Hapus file setengah jadi jika download gagal

    await fs.promises.rm(
      filePath,
      {
        force: true,
      }
    ).catch(() => {});


    throw err;
  }
}


// ====================================================================
// 🗑️ HAPUS MEDIA CACHE
// ====================================================================

async function deleteCachedMedia(filePath) {
  if (!filePath) {
    return;
  }

  try {

    await fs.promises.rm(
      filePath,
      {
        force: true,
      }
    );

  } catch (err) {

    console.error(
      '[MEDIA CACHE DELETE ERROR]',
      err
    );
  }
}


// ====================================================================
// 🚀 START BOT
// ====================================================================

async function start() {

  await initMediaCache();


  // ==================================================================
  // SESSION
  // ==================================================================

  const sessionDir = path.join(
    __dirname,
    '..',
    'sessions'
  );


  if (!fs.existsSync(sessionDir)) {

    fs.mkdirSync(
      sessionDir,
      {
        recursive: true,
      }
    );

  }


  const {
    state,
    saveCreds,
  } = await useMultiFileAuthState(
    sessionDir
  );


  const {
    version,
  } = await fetchLatestBaileysVersion();


  // ==================================================================
  // WHATSAPP SOCKET
  // ==================================================================

  const sock = makeWASocket({

    version,

    auth: state,

    printQRInTerminal: false,

    logger: pino({
      level: 'error',
    }),

    browser: Browsers.macOS(
      'Chrome'
    ),

  });


  // ==================================================================
  // 🤖 MENANDAI PESAN YANG DIKIRIM BOT
  //
  // Agar pesan bot sendiri tidak masuk anti-delete.
  // ==================================================================

  const botMessageIds = new Set();


  const originalSendMessage =
    sock.sendMessage.bind(sock);


  sock.sendMessage = async (...args) => {

    const sent =
      await originalSendMessage(
        ...args
      );


    const messageId =
      sent?.key?.id;


    if (messageId) {

      botMessageIds.add(
        messageId
      );


      setTimeout(() => {

        botMessageIds.delete(
          messageId
        );

      }, 5 * 60 * 1000);

    }


    return sent;
  };


  // ==================================================================
  // 🔌 CONNECTION UPDATE
  // ==================================================================

  sock.ev.on(
    'connection.update',
    (update) => {

      const {
        connection,
        lastDisconnect,
        qr,
      } = update;


      // ==============================
      // QR LOGIN
      // ==============================

      if (qr) {

        console.log(
          '\nScan QR ini dari WhatsApp > Perangkat tertaut:\n'
        );

        qrcode.generate(
          qr,
          {
            small: true,
          }
        );
      }


      // ==============================
      // CONNECTED
      // ==============================

      if (connection === 'open') {

        console.log(
          `✅ ${config.botName} aktif.`
        );

      }


      // ==============================
      // DISCONNECTED
      // ==============================

      if (connection === 'close') {

        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;


        const shouldReconnect =
          statusCode !==
          DisconnectReason.loggedOut;


        console.log(
          'Koneksi tertutup.'
        );

        console.log(
          'Status code:',
          statusCode
        );

        console.log(
          'Reconnect:',
          shouldReconnect
        );


        if (shouldReconnect) {

          start().catch(
            (err) => {

              console.error(
                '[RECONNECT ERROR]',
                err
              );

            }
          );

        } else {

          console.log(
            'Session logout. Hapus folder sessions lalu scan QR ulang.'
          );

        }
      }
    }
  );


  // ==================================================================
  // 💾 SAVE SESSION
  // ==================================================================

  sock.ev.on(
    'creds.update',
    saveCreds
  );


  // ==================================================================
  // 📵 FITUR NO CALL
  // ==================================================================

  sock.ev.on(
    'call',
    async (calls) => {

      try {

        await handleIncomingCall(
          sock,
          calls
        );

      } catch (err) {

        console.error(
          '[NOCALL EVENT ERROR]',
          err
        );

      }
    }
  );


  // ==================================================================
  // 🗑️ REVOKE VIA messages.update
  // ==================================================================

  sock.ev.on(
    'messages.update',
    async (update) => {

      try {

        await handleRevokeMessage(
          sock,
          update,
          messageStore
        );

      } catch (err) {

        console.error(
          '[REVOKE UPDATE ERROR]',
          err
        );

      }
    }
  );


  // ==================================================================
  // 📨 PESAN MASUK
  // ==================================================================

  sock.ev.on(
    'messages.upsert',
    async ({ messages }) => {

      for (const msg of messages) {

        if (!msg.message) {
          continue;
        }


        try {

          // ============================================================
          // 🗑️ DETEKSI PESAN DIHAPUS / REVOKE
          // ============================================================

          if (hasProtocolMessage(msg)) {

            await handleRevokeMessage(
              sock,
              [msg],
              messageStore
            );

            continue;
          }


          // ============================================================
          // ID PESAN
          // ============================================================

          const messageId =
            msg.key?.id;


          const remoteJid =
            msg.key?.remoteJid;


          if (
            !messageId ||
            !remoteJid
          ) {

            continue;
          }


          // ============================================================
          // JANGAN SIMPAN PESAN BOT SENDIRI
          // ============================================================

          if (
            msg.key.fromMe &&
            botMessageIds.has(messageId)
          ) {

            continue;
          }


          // ============================================================
          // 🔒 CEK VIEW ONCE
          //
          // View Once tidak disimpan sama sekali.
          // ============================================================

          const viewOnce =
            isViewOnceMessage(
              msg.message
            );


          if (!viewOnce) {

            // ==========================================================
            // AMBIL TEXT / CAPTION
            // ==========================================================

            const incomingText =
              pickText(msg) || '';


            // ==========================================================
            // DETEKSI MEDIA
            // ==========================================================

            const mediaInfo =
              getSupportedMediaInfo(
                msg
              );


            let mediaPath = null;


            // ==========================================================
            // SIMPAN MEDIA KE DISK
            // ==========================================================

            if (mediaInfo) {

              try {

                mediaPath =
                  await cacheMediaToDisk(
                    msg,
                    mediaInfo
                  );


                console.log(
                  `[MEDIA CACHE] ${mediaInfo.type} tersimpan dari:`,
                  msg.key.participant ||
                  msg.participant ||
                  remoteJid
                );

              } catch (err) {

                console.error(
                  '[MEDIA CACHE ERROR]',
                  err?.message || err
                );

              }
            }


            // ==========================================================
            // SIMPAN PESAN KE MESSAGE STORE
            //
            // Disimpan jika:
            // - Ada text
            // ATAU
            // - Media berhasil tersimpan
            // ==========================================================

            if (
              incomingText ||
              mediaPath
            ) {

              const senderJid =
                msg.key.participant ||
                msg.participant ||
                remoteJid;


              const storeKey =
                makeStoreKey(
                  remoteJid,
                  messageId
                );


              const savedData = {

                id: messageId,

                from: remoteJid,

                sender: senderJid,

                text: incomingText,

                fromMe:
                  Boolean(
                    msg.key.fromMe
                  ),

                rawMsg: msg,

                media:
                  mediaPath
                    ? {

                        type:
                          mediaInfo.type,

                        path:
                          mediaPath,

                        mimetype:
                          mediaInfo.mimetype,

                        caption:
                          mediaInfo.caption ||
                          incomingText ||
                          '',

                        ptt:
                          Boolean(
                            mediaInfo.ptt
                          ),

                      }
                    : null,


                time:
                  new Date()
                    .toLocaleTimeString(
                      'id-ID',
                      {

                        timeZone:
                          config.tz,

                        hour:
                          '2-digit',

                        minute:
                          '2-digit',

                        second:
                          '2-digit',

                      }
                    ),

              };


              // ========================================================
              // SIMPAN DENGAN DUA KEY
              // ========================================================

              messageStore.set(
                storeKey,
                savedData
              );


              messageStore.set(
                messageId,
                savedData
              );


              console.log(
                '[MESSAGE STORE] Pesan tersimpan dari:',
                senderJid,
                '| tipe:',
                mediaInfo?.type ||
                'text'
              );


              // ========================================================
              // HAPUS OTOMATIS SETELAH 24 JAM
              // ========================================================

              setTimeout(
                () => {

                  messageStore.delete(
                    storeKey
                  );


                  messageStore.delete(
                    messageId
                  );


                  if (
                    savedData
                      .media
                      ?.path
                  ) {

                    deleteCachedMedia(
                      savedData.media.path
                    );

                  }

                },
                MESSAGE_STORE_TTL_MS
              );
            }

          } else {

            // ==========================================================
            // VIEW ONCE
            //
            // Tidak download.
            // Tidak cache.
            // Tidak masuk messageStore.
            // ==========================================================

            console.log(
              '[MESSAGE STORE] View Once dilewati dan tidak disimpan:',
              messageId
            );
          }


          // ============================================================
          // 📵 COMMAND NO CALL
          // .nocall on
          // .nocall off
          // .nocall
          // ============================================================

          try {

            const noCallHandled =
              await handleNoCallCommand(
                sock,
                msg
              );


            if (noCallHandled) {
              continue;
            }

          } catch (err) {

            console.error(
              '[INDEX NOCALL ERROR]',
              err
            );

          }


          // ============================================================
          // 🤖 COMMAND AI TEXT
          // .balas
          // .maaf
          // .romantis
          // ============================================================

          try {

            const aiHandled =
              await handleAITextCommand(
                sock,
                msg
              );


            if (aiHandled) {
              continue;
            }

          } catch (err) {

            console.error(
              '[INDEX AI TEXT ERROR]',
              err
            );

          }


          // ============================================================
          // ROUTER COMMAND UTAMA
          // ============================================================

          await route(
            sock,
            msg
          );


        } catch (err) {

          console.error(
            'Handler error:',
            err
          );

        }
      }
    }
  );
}


// ====================================================================
// 🚀 RUN BOT
// ====================================================================

start().catch(
  (err) => {

    console.error(
      err
    );

  }
);