/**
 * Simple SMTP Test Email
 * Tests if your SendGrid/Mailgun SMTP configuration works
 */

const nodemailer = require('nodemailer');

// Use the same SMTP settings as Firebase Console
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'apikey',
    pass: process.env.SMTP_PASS // Your SendGrid/Mailgun API key
  }
});

// Test email details
const testEmail = 'konowy@denipl.net';
const fromEmail = process.env.SMTP_FROM || 'test@yourdomain.com';

async function sendTestEmail() {
  try {
    console.log('📧 Sending test email to:', testEmail);
    console.log('🔧 Using SMTP: smtp.sendgrid.net:587');
    console.log('');

    const mailOptions = {
      from: fromEmail,
      to: testEmail,
      subject: 'Test Email from ZEEN Backend',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>🧪 Test Email from ZEEN Backend</h2>
          <p>This is a test email to verify SMTP configuration.</p>
          <p>If you received this, your SendGrid/Mailgun SMTP is working!</p>
          <p>Time sent: ${new Date().toLocaleString()}</p>
          <hr>
          <p><strong>ZEEN Backend Test</strong></p>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);

    console.log('✅ Test email sent successfully!');
    console.log('📨 Message ID:', result.messageId);
    console.log('📧 Check your inbox:', testEmail);
    console.log('');
    console.log('💡 If you don\'t see the email:');
    console.log('   - Check spam/junk folder');
    console.log('   - Verify your SendGrid API key');
    console.log('   - Check SendGrid dashboard for delivery status');
    console.log('   - Make sure sender email is verified in SendGrid');

  } catch (error) {
    console.log('❌ Failed to send test email:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Check your SendGrid API key is correct');
    console.log('2. Verify sender email in SendGrid dashboard');
    console.log('3. Check SendGrid activity feed for errors');
    console.log('4. Try Mailgun if SendGrid doesn\'t work');
  }
}

sendTestEmail();