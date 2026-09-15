const fs = require('fs');
const path = require('path');

const config = require('../config');

const {
  pickText,
  isOwner,
} = require('../utils/format');


// ====================================================================
// 📁 FILE STATUS NO CALL
// ====================================================================

const noCallFile =
  path.join(
    __dirname,
    '..',
    '..',
    'nocall.json'
  );


// ====================================================================
// 📵 CACHE PANGGILAN YANG SUDAH DITOLAK
//
// Mencegah event panggilan yang sama ditolak berkali-kali.
// ====================================================================

const recentlyRejectedCalls =
  new Set();


// ====================================================================
// 📄 DEFAULT STATE
// ====================================================================

const DEFAULT_STATE = {
  enabled: false,
};


// ====================================================================
// 📖 BACA STATUS NO CALL
// ====================================================================

function loadState() {
  try {

    // ================================================================
    // FILE BELUM ADA
    // ================================================================

    if (
      !fs.existsSync(
        noCallFile
      )
    ) {
      fs.writeFileSync(
        noCallFile,
        JSON.stringify(
          DEFAULT_STATE,
          null,
          2
        ),
        'utf8'
      );

      return {
        ...DEFAULT_STATE,
      };
    }


    // ================================================================
    // BACA FILE
    // ================================================================

    const raw =
      fs.readFileSync(
        noCallFile,
        'utf8'
      );


    const data =
      JSON.parse(
        raw
      );


    return {
      enabled:
        Boolean(
          data?.enabled
        ),
    };

  } catch (err) {

    console.error(
      '[NOCALL] Gagal membaca nocall.json:',
      err.message
    );


    // Jika file rusak/error,
    // No Call dianggap OFF.
    return {
      ...DEFAULT_STATE,
    };
  }
}


// ====================================================================
// 💾 SIMPAN STATUS NO CALL
// ====================================================================

function saveState(state) {
  try {

    const data = {
      enabled:
        Boolean(
          state?.enabled
        ),
    };


    fs.writeFileSync(
      noCallFile,
      JSON.stringify(
        data,
        null,
        2
      ),
      'utf8'
    );


    return true;

  } catch (err) {

    console.error(
      '[NOCALL] Gagal menyimpan nocall.json:',
      err.message
    );


    return false;
  }
}


// ====================================================================
// 📊 CEK STATUS NO CALL
// ====================================================================

function isNoCallEnabled() {
  return Boolean(
    loadState().enabled
  );
}


// ====================================================================
// 👑 CEK OWNER
//
// Mendukung:
// - pesan dari akun bot sendiri / fromMe
// - owner berdasarkan util isOwner()
// ====================================================================

function isOwnerCommand(msg) {
  return Boolean(
    msg?.key?.fromMe ||
    isOwner(msg)
  );
}


// ====================================================================
// 📵 COMMAND NO CALL
//
// .nocall
// .nocall status
// .nocall on
// .nocall off
// ====================================================================

async function handleNoCallCommand(
  sock,
  msg
) {
  if (
    !msg?.message
  ) {
    return false;
  }


  const prefix =
    config.prefix || '.';


  const text =
    String(
      pickText(msg) || ''
    ).trim();


  if (!text) {
    return false;
  }


  // ==================================================================
  // PARSE COMMAND
  // ==================================================================

  const commandPrefix =
    `${prefix}nocall`;


  const lower =
    text.toLowerCase();


  // Harus tepat .nocall
  // atau dimulai dengan ".nocall "
  //
  // Jadi misalnya:
  // .nocalling
  //
  // tidak dianggap command.
  if (
    lower !==
      commandPrefix.toLowerCase() &&
    !lower.startsWith(
      `${commandPrefix.toLowerCase()} `
    )
  ) {
    return false;
  }


  const from =
    msg.key?.remoteJid;


  if (!from) {
    return false;
  }


  // ==================================================================
  // 👑 KHUSUS OWNER
  //
  // Non-owner dibuat diam.
  // ==================================================================

  if (
    !isOwnerCommand(
      msg
    )
  ) {
    return true;
  }


  // ==================================================================
  // AMBIL ACTION
  // ==================================================================

  const commandBody =
    text
      .slice(
        commandPrefix.length
      )
      .trim();


  const action =
    String(
      commandBody
        .split(/\s+/)[0] ||
      ''
    ).toLowerCase();


  // ==================================================================
  // 📊 STATUS
  //
  // .nocall
  // .nocall status
  // ==================================================================

  if (
    !action ||
    action === 'status'
  ) {
    const enabled =
      isNoCallEnabled();


    await sock.sendMessage(
      from,
      {
        text:
          enabled
            ? `📵 *NO CALL AKTIF* ✅

Panggilan WhatsApp masuk akan ditolak secara otomatis.

Gunakan:
• ${prefix}nocall off — nonaktifkan No Call
• ${prefix}nocall status — cek status`
            : `📵 *NO CALL NONAKTIF* ⛔

Panggilan WhatsApp tidak akan ditolak secara otomatis.

Gunakan:
• ${prefix}nocall on — aktifkan No Call
• ${prefix}nocall status — cek status`,
      },
      {
        quoted:
          msg,
      }
    );


    return true;
  }


  // ==================================================================
  // ✅ NO CALL ON
  // ==================================================================

  if (
    action === 'on'
  ) {
    const saved =
      saveState({
        enabled: true,
      });


    if (!saved) {
      await sock.sendMessage(
        from,
        {
          text:
            '❌ Gagal menyimpan pengaturan No Call.',
        },
        {
          quoted:
            msg,
        }
      );


      return true;
    }


    await sock.sendMessage(
      from,
      {
        text:
`📵 *NO CALL AKTIF* ✅

Panggilan WhatsApp masuk sekarang akan ditolak secara otomatis.

Untuk menonaktifkan:
${prefix}nocall off`,
      },
      {
        quoted:
          msg,
      }
    );


    return true;
  }


  // ==================================================================
  // ⛔ NO CALL OFF
  // ==================================================================

  if (
    action === 'off'
  ) {
    const saved =
      saveState({
        enabled: false,
      });


    if (!saved) {
      await sock.sendMessage(
        from,
        {
          text:
            '❌ Gagal menyimpan pengaturan No Call.',
        },
        {
          quoted:
            msg,
        }
      );


      return true;
    }


    await sock.sendMessage(
      from,
      {
        text:
`📵 *NO CALL NONAKTIF* ⛔

Panggilan WhatsApp tidak akan ditolak secara otomatis.

Untuk mengaktifkan kembali:
${prefix}nocall on`,
      },
      {
        quoted:
          msg,
      }
    );


    return true;
  }


  // ==================================================================
  // ❌ FORMAT SALAH
  // ==================================================================

  await sock.sendMessage(
    from,
    {
      text:
`❌ Perintah No Call tidak dikenal.

Gunakan:
• ${prefix}nocall
• ${prefix}nocall status
• ${prefix}nocall on
• ${prefix}nocall off`,
    },
    {
      quoted:
        msg,
    }
  );


  return true;
}


// ====================================================================
// 📞 PANGGILAN MASUK
// ====================================================================

async function handleIncomingCall(
  sock,
  calls
) {
  if (
    !Array.isArray(
      calls
    )
  ) {
    return;
  }


  // ==================================================================
  // NO CALL OFF
  // ==================================================================

  if (
    !isNoCallEnabled()
  ) {
    return;
  }


  // ==================================================================
  // PROSES PANGGILAN
  // ==================================================================

  for (
    const call
    of calls
  ) {
    try {

      const callId =
        call?.id;


      const callFrom =
        call?.from;


      const callStatus =
        String(
          call?.status || ''
        ).toLowerCase();


      // ==============================================================
      // HANYA PANGGILAN MASUK AWAL
      // ==============================================================

      if (
        ![
          'offer',
          'ringing',
        ].includes(
          callStatus
        )
      ) {
        continue;
      }


      // ==============================================================
      // DATA TIDAK LENGKAP
      // ==============================================================

      if (
        !callId ||
        !callFrom
      ) {
        console.log(
          '[NOCALL] Data panggilan tidak lengkap:',
          call
        );

        continue;
      }


      // ==============================================================
      // CEGAH REJECT BERULANG
      // ==============================================================

      const rejectKey =
        `${callFrom}:${callId}`;


      if (
        recentlyRejectedCalls.has(
          rejectKey
        )
      ) {
        continue;
      }


      recentlyRejectedCalls.add(
        rejectKey
      );


      setTimeout(
        () => {

          recentlyRejectedCalls.delete(
            rejectKey
          );

        },
        60 * 1000
      );


      // ==============================================================
      // TOLAK PANGGILAN
      // ==============================================================

      console.log(
        '--------------------------------------------------'
      );

      console.log(
        '[NOCALL] Panggilan masuk terdeteksi'
      );

      console.log(
        '[NOCALL] Dari:',
        callFrom
      );

      console.log(
        '[NOCALL] Status:',
        callStatus
      );

      console.log(
        '[NOCALL] Menolak panggilan...'
      );


      await sock.rejectCall(
        callId,
        callFrom
      );


      console.log(
        '[NOCALL] ✅ Panggilan berhasil ditolak'
      );

      console.log(
        '--------------------------------------------------'
      );

    } catch (err) {

      console.error(
        '[NOCALL] Gagal menolak panggilan:',
        err?.message ||
        err
      );

    }
  }
}


// ====================================================================
// EXPORT
// ====================================================================

module.exports = {
  handleNoCallCommand,
  handleIncomingCall,
  isNoCallEnabled,
};