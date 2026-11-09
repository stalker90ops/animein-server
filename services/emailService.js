import nodemailer from 'nodemailer';

/**
 * Send 6-digit OTP verification email for password reset
 * Supports SMTP (Gmail, custom mailer) or fallback development log
 */
export async function sendOtpEmail(toEmail, otp, recipientName = '') {
  const cleanEmail = String(toEmail || '').trim();
  const name = recipientName || cleanEmail.split('@')[0] || 'Pengguna AnimeIn';

  console.log('====================================================');
  console.log('🔐 [AnimeIn OTP Reset Password]');
  console.log(`📧 Tujuan: ${cleanEmail}`);
  console.log(`🔑 Kode OTP: ${otp}`);
  console.log('⏰ Masa Berlaku: 15 Menit');
  console.log('====================================================');

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || `"AnimeIn Support" <${smtpUser}>`,
        to: cleanEmail,
        subject: `[AnimeIn] Kode OTP Reset Kata Sandi: ${otp}`,
        text: `Halo ${name},\n\nKode OTP untuk mengatur ulang kata sandi akun AnimeIn Anda adalah: ${otp}\n\nKode ini hanya berlaku selama 15 menit. Jangan berikan kode ini kepada siapapun demi keamanan akun Anda.\n\nSalam,\nTim AnimeIn`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; background: #0B0F19; color: #f3f4f6; border-radius: 20px; overflow: hidden; border: 1px solid #1f2937;">
            <div style="background: linear-gradient(135deg, #E50914, #991b1b); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">AnimeIn</h1>
              <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0 0; font-size: 13px;">Permintaan Reset Kata Sandi</p>
            </div>
            <div style="padding: 28px 24px;">
              <p style="font-size: 15px; margin-top: 0; color: #e5e7eb;">Halo <b>${name}</b>,</p>
              <p style="font-size: 14px; line-height: 1.6; color: #9ca3af;">Kami menerima permintaan untuk mengatur ulang kata sandi akun AnimeIn Anda. Masukkan kode verifikasi OTP 6 digit berikut pada halaman reset password:</p>
              
              <div style="margin: 24px 0; background: #131A2A; border: 2px dashed #E50914; border-radius: 14px; padding: 20px; text-align: center;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #9ca3af; display: block; margin-bottom: 8px;">KODE VERIFIKASI OTP</span>
                <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: 900; letter-spacing: 10px; color: #ffffff; text-shadow: 0 0 10px rgba(229,9,20,0.5);">${otp}</span>
              </div>

              <p style="font-size: 13px; color: #9ca3af; margin-bottom: 20px;">⏰ Kode OTP ini hanya berlaku selama <b>15 menit</b>. Jangan berikan kode ini kepada siapapun.</p>
              <p style="font-size: 12px; color: #6b7280; margin-bottom: 0;">Jika Anda tidak merasa meminta pengaturan ulang kata sandi, abaikan email ini. Akun Anda tetap aman.</p>
            </div>
            <div style="background: #070a12; padding: 16px; text-align: center; border-top: 1px solid #1f2937;">
              <p style="font-size: 11px; color: #6b7280; margin: 0;">&copy; ${new Date().getFullYear()} AnimeIn Web Platform. Hak cipta dilindungi.</p>
            </div>
          </div>
        `
      });

      console.log('✅ Email OTP terkirim via SMTP ke:', cleanEmail, 'MessageId:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.warn('⚠️ Gagal mengirim email via SMTP (OTP tetap tercatat di log):', err.message);
      return { success: false, error: err.message, fallbackOtp: otp };
    }
  }

  // Fallback simulation mode
  return { success: true, isSimulated: true, otp };
}
