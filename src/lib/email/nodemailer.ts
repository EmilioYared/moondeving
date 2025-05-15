import nodemailer from 'nodemailer';

// Create a transporter using your email service provider details
const transporter = nodemailer.createTransport({
  service: 'gmail', // Or another service like 'hotmail', 'outlook', etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  // Add debug option for troubleshooting
  debug: process.env.NODE_ENV !== 'production',
});

export async function sendDeveloperNotification(
  email: string,
  decision: 'accepted' | 'rejected',
  feedback: string,
  fullName: string
) {
  try {
    console.log(`Attempting to send email to ${email} with decision: ${decision}`);
    
    const mailOptions = {
      from: `"MoonDev Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: decision === 'accepted' ? 'Welcome to the Team!' : 'Your MoonDev Application',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: ${decision === 'accepted' ? '#10B981' : '#EF4444'};">
            ${decision === 'accepted' ? 'Congratulations! 🎉' : 'Thank You for Your Application'}
          </h1>
          <p>Dear ${fullName},</p>
          <p>${feedback}</p>
          ${decision === 'accepted' 
            ? '<p>We are excited to welcome you to our team!</p>' 
            : '<p>Thank you for your interest in MoonDev.</p>'}
          <p>Best regards,<br>MoonDev Team</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (err) {
    console.error('Email sending failed:', err);
    return false;
  }
}