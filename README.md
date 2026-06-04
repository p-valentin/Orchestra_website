# Orchestra Landing Page

Marketing site for [Orchestra](https://github.com/p-valentin/Orchestra) — a desktop browser automation tool.

Built with Next.js 16 App Router, Tailwind CSS, and Resend for email.

## Development

```bash
npm install
npm run dev
```

## Environment variables

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key for contact form emails |
| `CONTACT_EMAIL` | Address that receives contact form submissions (e.g. `hello@orchestra-automation.com`) |
| `RESEND_FROM` | Sender address (must be verified in Resend) |
| `BETA_SIGNUP_URL` | POST endpoint for beta claim submissions |

Without these set the forms accept submissions but log them server-side only.

## Deployment

Vercel — connect the repo and set the environment variables above.

The contact form and beta signup use Server Actions so a static export won't work.
