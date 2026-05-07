import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { email, token, role, invitedByName } = await req.json();

  if (!email || !token) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://motherlink.io';
  const inviteUrl = `${baseUrl}/signup?token=${token}`;

  const { error } = await resend.emails.send({
    from: 'Motherlink <invitations@motherlink.io>',
    to: email,
    subject: `You've been invited to Motherlink`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 24px;">
            <tr>
              <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #222;border-radius:12px;overflow:hidden;">
                  <tr>
                    <td style="padding:40px 40px 32px;border-bottom:1px solid #1a1a1a;">
                      <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Motherlink</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:40px;">
                      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">You've been invited</h1>
                      <p style="margin:0 0 8px;font-size:15px;color:#888;line-height:1.6;">
                        <strong style="color:#aaa">${invitedByName || 'A team admin'}</strong> has invited you to join Motherlink as <strong style="color:#aaa">${role || 'a team member'}</strong>.
                      </p>
                      <p style="margin:0 0 32px;font-size:15px;color:#888;line-height:1.6;">
                        This invitation expires in 7 days. Click the button below to create your account.
                      </p>
                      <a href="${inviteUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:8px;letter-spacing:-0.2px;">
                        Accept Invitation
                      </a>
                      <p style="margin:32px 0 0;font-size:13px;color:#555;line-height:1.6;">
                        Or copy this link into your browser:<br />
                        <a href="${inviteUrl}" style="color:#7c3aed;word-break:break-all;">${inviteUrl}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 40px;background:#0d0d0d;border-top:1px solid #1a1a1a;">
                      <p style="margin:0;font-size:12px;color:#444;">If you didn't expect this invitation, you can safely ignore this email.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error('Resend error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
