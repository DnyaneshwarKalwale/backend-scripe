const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY || 're_U4Z6UVo3_MRUNx8RznmbSpAikpp3nFcUg');

const sendEmail = async (options) => {
  try {
    // Use Resend for sending emails
    const data = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    
    console.log('Email sent successfully with Resend:', data);
    return data;
  } catch (error) {
    console.error('Error sending email with Resend:', error);
    
    // Fallback to nodemailer if Resend fails
    console.log('Falling back to nodemailer...');
    try {
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
      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent with nodemailer fallback:', info);
      return info;
    } catch (fallbackError) {
      console.error('Nodemailer fallback also failed:', fallbackError);
      throw fallbackError;
    }
  }
};

const sendVerificationEmail = async (user, netlifyVerificationUrl, vercelVerificationUrl) => {
  const subject = 'Scripe - Email Verification';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #6200ea;">Welcome to Scripe</h1>
      </div>
      <p>Hi ${user.firstName},</p>
      <p>Thank you for registering with Scripe! Before we get started, we need to verify your email address.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${netlifyVerificationUrl}" style="background-color: #6200ea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify your email</a>
      </div>
      <p>You can verify your email using either of these links:</p>
      <p><strong>Option 1:</strong> <a href="${netlifyVerificationUrl}">${netlifyVerificationUrl}</a></p>
      <p><strong>Option 2:</strong> <a href="${vercelVerificationUrl}">${vercelVerificationUrl}</a></p>
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

const sendPasswordResetEmail = async (user, netlifyResetUrl, vercelResetUrl) => {
  const subject = 'Scripe - Password Reset';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #6200ea;">Reset Your Password</h1>
      </div>
      <p>Hi ${user.firstName},</p>
      <p>You've requested to reset your password. Click the button below to set a new password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${netlifyResetUrl}" style="background-color: #6200ea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
      </div>
      <p>You can reset your password using either of these links:</p>
      <p><strong>Option 1:</strong> <a href="${netlifyResetUrl}">${netlifyResetUrl}</a></p>
      <p><strong>Option 2:</strong> <a href="${vercelResetUrl}">${vercelResetUrl}</a></p>
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

const sendTeamInvitationEmail = async (invitation, teamName, inviter, netlifyInviteUrl, vercelInviteUrl) => {
  try {
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
          <a href="${netlifyInviteUrl}" style="background-color: #6200ea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">Accept Invitation</a>
        </div>
        <p>You can access your invitation at either of these links:</p>
        <p><strong>Option 1:</strong> <a href="${netlifyInviteUrl}">${netlifyInviteUrl}</a></p>
        <p><strong>Option 2:</strong> <a href="${vercelInviteUrl}">${vercelInviteUrl}</a></p>
        <p>This invitation will expire in 7 days.</p>
        <p>Best regards,<br>The Scripe Team</p>
      </div>
    `;

    await sendEmail({
      to: invitation.email,
      subject,
      html,
    });
  } catch (error) {
    console.error('Error sending team invitation email:', error);
  }
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTeamInvitationEmail,
}; 