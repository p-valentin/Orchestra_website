import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import DocsSidebar, { type SidebarSection } from '@/components/docs/DocsSidebar'
import { docHref, docsSections } from '@/lib/docs'

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  // Serialize the manifest for the client sidebar (hrefs only, no fs types).
  const sections: SidebarSection[] = docsSections.map(section => ({
    label: section.label,
    items: section.items.map(item => ({ href: docHref(item.slug), label: item.label })),
  }))

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="hero-light mx-auto w-full max-w-6xl flex-1 px-5 pb-32 pt-28 sm:px-8 lg:pt-36">
        <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12">
          <DocsSidebar sections={sections} />
          <div className="mt-8 min-w-0 lg:mt-0">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
