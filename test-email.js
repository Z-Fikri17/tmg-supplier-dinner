// Run: node test-email.js
// Must be in the same folder as your .env file
require('dotenv').config();

const nodemailer = require('nodemailer');

const cfg = {
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

console.log('--- SMTP Config Loaded ---');
console.log('HOST  :', cfg.host);
console.log('PORT  :', cfg.port);
console.log('SECURE:', cfg.secure);
console.log('USER  :', cfg.auth.user);
console.log('PASS  :', cfg.auth.pass ? '✓ set (' + cfg.auth.pass.length + ' chars)' : '✗ MISSING');
console.log('FROM  :', process.env.SMTP_FROM);
console.log('TEST_TO:', process.env.SMTP_TEST_TO);
console.log('--------------------------\n');

if (!cfg.host || !cfg.auth.user || !cfg.auth.pass) {
  console.error('❌ Missing SMTP config — check your .env file.');
  process.exit(1);
}

const transporter = nodemailer.createTransport(cfg);

transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP connection FAILED:\n', err.message);
    console.log('\n--- Common fixes ---');
    if (err.message.includes('Invalid login') || err.message.includes('535')) {
      console.log('→ App Password is wrong. Generate a new one at:');
      console.log('  https://myaccount.google.com/apppasswords');
      console.log('→ Make sure 2-Step Verification is ON in your Google account.');
    }
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      console.log('→ Cannot reach smtp.gmail.com:587. Check your firewall/network.');
    }
    if (err.message.includes('self signed') || err.message.includes('certificate')) {
      console.log('→ TLS issue. Try setting SMTP_SECURE=false in .env');
    }
    process.exit(1);
  }

  console.log('✅ SMTP connection OK — now sending test email...\n');

  transporter.sendMail({
    from: `${process.env.SMTP_FROM_NAME || 'TMG'} <${process.env.SMTP_FROM}>`,
    to:   process.env.SMTP_TEST_TO || process.env.SMTP_USER,
    subject: 'TMG Email Test ✓',
    text: 'If you see this, your SMTP config is working correctly!',
    html: '<p>If you see this, your <strong>SMTP config is working</strong> correctly!</p>',
  }, (err2, info) => {
    if (err2) {
      console.error('❌ Send FAILED:\n', err2.message);
    } else {
      console.log('✅ Email sent! Message ID:', info.messageId);
      console.log('→ Check inbox at:', process.env.SMTP_TEST_TO || process.env.SMTP_USER);
    }
  });
});
