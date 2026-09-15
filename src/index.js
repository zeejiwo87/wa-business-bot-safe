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

const {
  pickText,
  isOwner,
} = require('./utils/format');

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

const db = require('./db');


// ====================================================================
// 👥 PENGAMAN FITUR GRUP
// ====================================================================

function isGroupJid(jidValue) {
  return String(
    jidValue || ''
  ).endsWith('@g.us');
}


function groupFeatureEnabled(groupJid) {
  try {
    const row =
      db.prepare(`
        SELECT enabled
        FROM group_features
        WHERE group_jid = ?
      `).get(
        groupJid
      );

    return Number(
      row?.enabled
    ) === 1;

  } catch (err) {
    console.error(
      '[INDEX GROUP FEATURE CHECK ERROR]',
      err.message
    );

    return false;
  }
}


function isAllowedGroupControl(
  msg,
  text
) {
  if (
    !isOwner(msg) &&
    !msg?.key?.fromMe
  ) {
    return false;
  }


  const prefix =
    config.prefix || '.';


  const raw =
    String(
      text || ''
    ).trim();


  if (
    !raw.startsWith(
      prefix
    )
  ) {
    return false;
  }


  const commandBody =
    raw
      .slice(
        prefix.length
      )
      .trim();


  if (!commandBody) {
    return false;
  }


  const command =
    String(
      commandBody
        .split(/\s+/)[0] ||
      ''
    ).toLowerCase();


  return (
    command === 'grup' ||
    command === 'group'
  );
}


// ====================================================================
// 🚫 WHATSAPP STATUS
// ====================================================================

function isStatusBroadcast(
  jidValue
) {
  return String(
    jidValue || ''
  ) === 'status@broadcast';
}


function getUpdateRemoteJid(
  item
) {
  return (
    item?.key?.remoteJid ||
    item?.update?.key?.remoteJid ||
    item?.update?.message?.protocolMessage?.key?.remoteJid ||
    item?.message?.protocolMessage?.key?.remoteJid ||
    ''
  );
}


// ====================================================================
// 🛡️ MESSAGE STORE ANTI DELETE
// ====================================================================

const messageStore =
  new Map();


// Pesan anti-delete disimpan selama 24 jam
const MESSAGE_STORE_TTL_MS =
  24 * 60 * 60 * 1000;


// ====================================================================
// 📁 CACHE MEDIA ANTI DELETE
// Media disimpan di storage VPS, bukan disimpan terus di RAM
// ====================================================================

const MEDIA_CACHE_DIR =
  path.join(
    __dirname,
    '..',
    'storage',
    'antidelete-cache'
  );


let mediaCacheInitialized =
  false;


// ====================================================================
// 📁 INITIALIZE MEDIA CACHE
// ====================================================================

async function initMediaCache() {
  if (
    mediaCacheInitialized
  ) {
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


  mediaCacheInitialized =
    true;
}


// ====================================================================
// 🛡️ DETEKSI PROTOCOL MESSAGE / REVOKE
// ====================================================================

function hasProtocolMessage(
  msg
) {
  const normalized =
    normalizeMessageContent(
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

function isViewOnceMessage(
  content
) {
  if (
    !content ||
    typeof content !== 'object'
  ) {
    return false;
  }


  if (
    content.viewOnceMessage ||
    content.viewOnceMessageV2 ||
    content.viewOnceMessageV2Extension
  ) {
    return true;
  }


  if (
    content.imageMessage?.viewOnce === true ||
    content.videoMessage?.viewOnce === true
  ) {
    return true;
  }


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

function getSupportedMediaInfo(
  msg
) {
  const normalized =
    normalizeMessageContent(
      msg.message || {}
    );


  if (!normalized) {
    return null;
  }


  // =========================
  // IMAGE
  // =========================

  if (
    normalized.imageMessage
  ) {
    return {
      type:
        'image',

      mimetype:
        normalized
          .imageMessage
          .mimetype ||
        'image/jpeg',

      caption:
        normalized
          .imageMessage
          .caption ||
        '',

      ptt:
        false,
    };
  }


  // =========================
  // VIDEO
  // =========================

  if (
    normalized.videoMessage
  ) {
    return {
      type:
        'video',

      mimetype:
        normalized
          .videoMessage
          .mimetype ||
        'video/mp4',

      caption:
        normalized
          .videoMessage
          .caption ||
        '',

      ptt:
        false,
    };
  }


  // =========================
  // AUDIO / VOICE NOTE
  // =========================

  if (
    normalized.audioMessage
  ) {
    return {
      type:
        'audio',

      mimetype:
        normalized
          .audioMessage
          .mimetype ||
        'audio/ogg; codecs=opus',

      caption:
        '',

      ptt:
        Boolean(
          normalized
            .audioMessage
            .ptt
        ),
    };
  }


  // =========================
  // STICKER
  // =========================

  if (
    normalized.stickerMessage
  ) {
    return {
      type:
        'sticker',

      mimetype:
        normalized
          .stickerMessage
          .mimetype ||
        'image/webp',

      caption:
        '',

      ptt:
        false,
    };
  }


  return null;
}


// ====================================================================
// 📎 MENENTUKAN EXTENSION FILE MEDIA
// ====================================================================

function extensionFromMedia(
  mediaInfo
) {
  const mime =
    String(
      mediaInfo?.mimetype || ''
    ).toLowerCase();


  if (
    mime.includes('jpeg') ||
    mime.includes('jpg')
  ) {
    return '.jpg';
  }


  if (
    mime.includes('png')
  ) {
    return '.png';
  }


  if (
    mime.includes('webp')
  ) {
    return '.webp';
  }


  if (
    mime.includes('mp4')
  ) {
    return '.mp4';
  }


  if (
    mime.includes('ogg')
  ) {
    return '.ogg';
  }


  if (
    mime.includes('mpeg')
  ) {
    return '.mp3';
  }


  if (
    mime.includes('aac')
  ) {
    return '.aac';
  }


  if (
    mime.includes('wav')
  ) {
    return '.wav';
  }


  // Fallback berdasarkan tipe media

  if (
    mediaInfo?.type === 'image'
  ) {
    return '.jpg';
  }


  if (
    mediaInfo?.type === 'video'
  ) {
    return '.mp4';
  }


  if (
    mediaInfo?.type === 'audio'
  ) {
    return '.ogg';
  }


  if (
    mediaInfo?.type === 'sticker'
  ) {
    return '.webp';
  }


  return '.bin';
}


// ====================================================================
// 🧹 MEMBUAT NAMA FILE AMAN
// ====================================================================

function safeFilePart(
  value
) {
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


  const messageId =
    safeFilePart(
      msg.key?.id
    );


  const remoteJid =
    safeFilePart(
      msg.key?.remoteJid
    );


  const extension =
    extensionFromMedia(
      mediaInfo
    );


  const filePath =
    path.join(
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
      fs.createWriteStream(
        filePath
      )
    );


    return filePath;

  } catch (err) {

    // Hapus file setengah jadi jika download gagal

    await fs.promises.rm(
      filePath,
      {
        force: true,
      }
    ).catch(
      () => {}
    );


    throw err;
  }
}


// ====================================================================
// 🗑️ HAPUS MEDIA CACHE
// ====================================================================

async function deleteCachedMedia(
  filePath
) {
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

  const sessionDir =
    path.join(
      __dirname,
      '..',
      'sessions'
    );


  if (
    !fs.existsSync(
      sessionDir
    )
  ) {

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
  } =
    await useMultiFileAuthState(
      sessionDir
    );


  const {
    version,
  } =
    await fetchLatestBaileysVersion();


  // ==================================================================
  // WHATSAPP SOCKET
  // ==================================================================

  const sock =
    makeWASocket({

      version,

      auth:
        state,

      printQRInTerminal:
        false,

      logger:
        pino({
          level:
            'error',
        }),

      browser:
        Browsers.macOS(
          'Chrome'
        ),

    });


  // ==================================================================
  // 🤖 MENANDAI PESAN YANG DIKIRIM BOT
  //
  // Agar pesan bot sendiri tidak masuk anti-delete.
  // ==================================================================

  const botMessageIds =
    new Set();


  const originalSendMessage =
    sock.sendMessage.bind(
      sock
    );


  sock.sendMessage =
    async (...args) => {

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


        setTimeout(
          () => {

            botMessageIds.delete(
              messageId
            );

          },
          5 * 60 * 1000
        );

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
      } =
        update;


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
            small:
              true,
          }
        );
      }


      // ==============================
      // CONNECTED
      // ==============================

      if (
        connection === 'open'
      ) {

        const botJid =
          String(
            sock.user?.id || ''
          );


        const botNumber =
          botJid
            .split('@')[0]
            .split(':')[0];


        console.log(
          `✅ ${config.botName} aktif.`
        );


        console.log(
          '📱 Nomor bot:',
          botNumber ||
          'Tidak diketahui'
        );


        console.log(
          '🆔 JID bot:',
          botJid ||
          'Tidak diketahui'
        );


        if (
          sock.user?.lid
        ) {

          console.log(
            '🆔 LID bot:',
            sock.user.lid
          );

        }
      }


      // ==============================
      // DISCONNECTED
      // ==============================

      if (
        connection === 'close'
      ) {

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


        if (
          shouldReconnect
        ) {

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

        const filteredUpdate =
          Array.isArray(
            update
          )
            ? update.filter(
                (item) =>
                  !isStatusBroadcast(
                    getUpdateRemoteJid(
                      item
                    )
                  )
              )
            : [];


        if (
          !filteredUpdate.length
        ) {
          return;
        }


        await handleRevokeMessage(
          sock,
          filteredUpdate,
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
    async ({
      messages,
      type,
    }) => {

      // ==============================================================
      // ABAIKAN HISTORY / SINKRONISASI PESAN LAMA
      //
      // Pesan real-time Baileys masuk sebagai "notify".
      // ==============================================================
      
      if (
        type &&
        type !== 'notify'
      ) {
        return;
      }


      for (
        const msg
        of messages || []
      ) {

        if (
          !msg?.message
        ) {
          continue;
        }


        try {

          // ============================================================
          // ID PESAN / CHAT
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
          // 🚫 ABAIKAN WHATSAPP STATUS
          //
          // Status bukan private chat maupun grup.
          // Tidak masuk anti-delete, router, welcome, atau AI.
          // ============================================================

          if (
            isStatusBroadcast(
              remoteJid
            )
          ) {

            continue;
          }


          // ============================================================
          // 🗑️ DETEKSI PESAN DIHAPUS / REVOKE
          // ============================================================

          if (
            hasProtocolMessage(
              msg
            )
          ) {

            await handleRevokeMessage(
              sock,
              [msg],
              messageStore
            );


            continue;
          }


          // ============================================================
          // JANGAN SIMPAN PESAN BOT SENDIRI
          // ============================================================

          if (
            msg.key.fromMe &&
            botMessageIds.has(
              messageId
            )
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


          if (
            !viewOnce
          ) {

            // ==========================================================
            // AMBIL TEXT / CAPTION
            // ==========================================================

            const incomingText =
              pickText(
                msg
              ) || '';


            // ==========================================================
            // DETEKSI MEDIA
            // ==========================================================

            const mediaInfo =
              getSupportedMediaInfo(
                msg
              );


            let mediaPath =
              null;


            // ==========================================================
            // SIMPAN MEDIA KE DISK
            // ==========================================================

            if (
              mediaInfo
            ) {

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
                  err?.message ||
                  err
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

                id:
                  messageId,

                from:
                  remoteJid,

                sender:
                  senderJid,

                text:
                  incomingText,

                fromMe:
                  Boolean(
                    msg.key.fromMe
                  ),

                rawMsg:
                  msg,

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

            console.log(
              '[MESSAGE STORE] View Once dilewati dan tidak disimpan:',
              messageId
            );

          }


          // ============================================================
          // 👥 PENGAMAN GRUP
          //
          // Jika .grup OFF:
          // - menu / .menu tidak diproses
          // - .nocall tidak diproses
          // - AI tidak diproses
          // - command lain tidak diproses
          //
          // Hanya owner / akun bot sendiri yang boleh menjalankan
          // .grup ... atau .group ...
          // ============================================================

          if (
            isGroupJid(
              remoteJid
            ) &&
            !groupFeatureEnabled(
              remoteJid
            ) &&
            !isAllowedGroupControl(
              msg,
              pickText(
                msg
              ) || ''
            )
          ) {

            continue;
          }


          // ============================================================
          // 📵 COMMAND NO CALL
          // ============================================================

          try {

            const noCallHandled =
              await handleNoCallCommand(
                sock,
                msg
              );


            if (
              noCallHandled
            ) {

              continue;
            }

          } catch (err) {

            console.error(
              '[INDEX NOCALL ERROR]',
              err
            );

          }


          // ============================================================
          // 🚦 ROUTER COMMAND UTAMA
          //
          // Router dijalankan dulu supaya welcome nomor baru
          // sempat diproses sebelum auto AI membalas.
          // ============================================================

          await route(
            sock,
            msg
          );


          // ============================================================
          // 🤖 COMMAND AI TEXT
          //
          // .aion
          // .aioff
          // .aistatus
          //
          // .balas
          // .maaf
          // .romantis
          //
          // Auto AI premium jika aktif.
          // ============================================================

          try {

            const aiHandled =
              await handleAITextCommand(
                sock,
                msg
              );


            if (
              aiHandled
            ) {

              continue;
            }

          } catch (err) {

            console.error(
              '[INDEX AI TEXT ERROR]',
              err
            );

          }


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