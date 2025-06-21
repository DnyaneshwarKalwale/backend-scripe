const nodemailer = require('nodemailer');

/**
 * Send email utility
 * @param {Object} options - Email options
 * @param {string} options.email - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.message - Email message
 * @returns {Promise} - Resolves with info about the sent email
 */
const sendEmail = async (options) => {
  try {
    // Create a transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Define email options
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'Scripe'} <${process.env.EMAIL_FROM || 'noreply@scripe.com'}>`,
      to: options.email,
      subject: options.subject,
      text: options.message,
      // Optional HTML version
      html: options.html || options.message.replace(/\n/g, '<br>'),
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw the error - fail gracefully
    return { error: error.message };
  }
};

module.exports = sendEmail; 