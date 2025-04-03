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

const sendVerificationEmail = async (user, verificationUrl) => {
  // Extract OTP from user object or generate a new one
  const otp = user.emailVerificationOTP || Math.floor(100000 + Math.random() * 900000).toString();
  
  const subject = 'Scripe - Email Verification Code';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #6200ea;">Welcome to Scripe</h1>
      </div>
      <p>Hi ${user.firstName},</p>
      <p>Thank you for registering with Scripe! To verify your email address, please use the following verification code:</p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; font-size: 24px; letter-spacing: 5px; font-weight: bold;">
          ${otp}
        </div>
      </div>
      <p>This code will expire in 30 minutes. Please do not share this code with anyone.</p>
      <p>If you did not create an account, please ignore this email.</p>
      <p>Best regards,<br>The Scripe Team</p>
    </div>
  `;

  await sendEmail({
    to: user.email,
    subject,
    html,
  });
  
  // Return the OTP so it can be saved to the user record
  return otp;
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
  try {
    // Generate the invite URL with the token
    const frontendUrl = process.env.FRONTEND_URL || 'https://deluxe-cassata-51d628.netlify.app';
    const tokenUrl = `${frontendUrl}/invitations?token=${invitation.token}`;
    
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
          <a href="${tokenUrl}" style="background-color: #6200ea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">Accept Invitation</a>
        </div>
        <p>If the button above doesn't work, please copy and paste the following link into your browser:</p>
        <p>${tokenUrl}</p>
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