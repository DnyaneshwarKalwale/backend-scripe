const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  try {
    // Create a more detailed log of the attempt
    console.log('Attempting to send email to:', options.to);
    
    // First check if we're using placeholder/default credentials
    if (process.env.EMAIL_USERNAME === 'your_email@gmail.com' || 
        process.env.EMAIL_PASSWORD === 'your_app_password') {
      console.log('DEVELOPMENT MODE: Email would have been sent with the following details:');
      console.log('To:', options.to);
      console.log('Subject:', options.subject);
      console.log('Content preview:', options.html.substring(0, 100) + '...');
      return Promise.resolve(); // Just return without actually sending
    }

    // For Gmail, we need to handle spaces in the app password
    const password = process.env.EMAIL_PASSWORD?.trim();
    const username = process.env.EMAIL_USERNAME?.trim();
    
    if (!username || !password) {
      console.log('Email credentials missing or invalid');
      return Promise.resolve(); // Continue without failing
    }

    // Create transporter with more robust config
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: username,
        pass: password,
      },
      tls: {
        rejectUnauthorized: false // Helps with some certificate issues
      }
    });

    // Mail options
    const mailOptions = {
      from: `Scripe <${process.env.EMAIL_FROM || username}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    // Send email with detailed logging
    console.log('Sending email with nodemailer...');
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    // Log error details without failing
    console.error('Email sending failed with error:', error.message);
    console.error('Error details:', JSON.stringify(error));
    
    // Don't throw the error, just log it and continue
    return Promise.resolve();
  }
};

const sendVerificationEmail = async (user, verificationUrl) => {
  const subject = 'Scripe - Email Verification';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #6200ea;">Welcome to Scripe</h1>
      </div>
      <p>Hi ${user.firstName},</p>
      <p>Thank you for registering with Scripe! Before we get started, we need to verify your email address.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="background-color: #6200ea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify your email</a>
      </div>
      <p>If the button above doesn't work, please copy and paste the following link into your browser:</p>
      <p>${verificationUrl}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you did not create an account, please ignore this email.</p>
      <p>Best regards,<br>The Scripe Team</p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject,
    html,
  });
};

const sendPasswordResetEmail = async (user, resetUrl) => {
  const subject = 'Scripe - Password Reset';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #6200ea;">Reset Your Password</h1>
      </div>
      <p>Hi ${user.firstName},</p>
      <p>You've requested to reset your password. Click the button below to set a new password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #6200ea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
      </div>
      <p>If the button above doesn't work, please copy and paste the following link into your browser:</p>
      <p>${resetUrl}</p>
      <p>This link will expire in 10 minutes.</p>
      <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
      <p>Best regards,<br>The Scripe Team</p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject,
    html,
  });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
}; 