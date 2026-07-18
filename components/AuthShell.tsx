import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

// Shared frame for the account pages (signup / forgot / reset / welcome).
// These exist only to serve the desktop app: it stays sign-in only, so the
// flows that need a browser — email confirmation and password recovery —
// happen here.
export default function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string
  intro?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <>
      <Nav />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20">
        <div className="rounded-xl border border-line bg-panel p-8">
          <h1 className="font-display text-2xl font-medium">{title}</h1>
          {intro && <p className="mt-2 text-sm text-muted">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </main>
      <Footer />
    </>
  )
}

export function AuthField({
  label,
  name,
  type = 'text',
  autoComplete,
  minLength,
  placeholder,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
  minLength?: number
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required
        minLength={minLength}
        maxLength={254}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line-strong bg-well px-4 py-3 text-fg placeholder:text-faint outline-none transition-colors focus:border-brass"
      />
    </label>
  )
}

export function AuthButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg border border-brass/50 px-5 py-3 font-medium text-brass-bright transition-colors hover:bg-brass hover:text-[#1a1306] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-3 rounded-lg border border-[#f0a8a2]/30 bg-[#f0a8a2]/10 px-4 py-2.5 text-sm text-[#f0a8a2]">
      {message}
    </p>
  )
}

export function AuthNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-brass/40 bg-brass/10 px-4 py-3 text-sm">
      {children}
    </p>
  )
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-brass-bright underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}
