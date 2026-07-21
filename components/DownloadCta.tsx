import DownloadButton from './DownloadButton'

export default function DownloadCta() {
  return (
    <section id="download" className="border-t border-line bg-panel/40">
      <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 lg:py-24">
        <h2 className="font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl">
          Every download starts a
          <span className="block text-brass">14-day free trial.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-md leading-relaxed text-muted">
          All features, no card. Create an account, and the clock starts the first time you
          sign in inside the app. If Orchestra earns its keep, it&rsquo;s{' '}
          <a href="#pricing" className="text-brass-bright underline-offset-4 hover:underline">
            $129 once
          </a>{' '}
          — yours forever.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <DownloadButton platform="mac" arch="arm64" label="macOS" />
          <DownloadButton platform="win" arch="x64" label="Windows" />
          <DownloadButton platform="linux" arch="x64" label="Linux" />
        </div>
      </div>
    </section>
  )
}
