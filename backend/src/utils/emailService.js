const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Create transporter
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Mail options
  const mailOptions = {
    from: `Scripe <${process.env.EMAIL_FROM}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  // Send email
  await transporter.sendMail(mailOptions);
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

const sendTeamInvitationEmail = async (invitation, teamName, inviter, inviteUrl) => {
  const subject = `You've been invited to join ${teamName} on Scripe`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #6200ea;">Team Invitation</h1>
      </div>
      <p>Hi there,</p>
      <p>${inviter.firstName} ${inviter.lastName} has invited you to join their team "${teamName}" on Scripe.</p>
      <p>You've been invited as a <strong>${invitation.role}</strong>.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteUrl}" style="background-color: #6200ea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">Accept Invitation</a>
      </div>
      <p>If the button above doesn't work, please copy and paste the following link into your browser:</p>
      <p>${inviteUrl}</p>
      <p>This invitation will expire in 7 days.</p>
      <p>Best regards,<br>The Scripe Team</p>
    </div>
  `;

  await sendEmail({
    to: invitation.email,
    subject,
    html,
  });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTeamInvitationEmail,
}; 