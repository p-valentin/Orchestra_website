import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import InstrumentMarquee from '@/components/InstrumentMarquee'
import HowItWorks from '@/components/HowItWorks'
import FeatureSplits from '@/components/FeatureSplits'
import CodeOwnership from '@/components/CodeOwnership'
import UseCases from '@/components/UseCases'
import DownloadCta from '@/components/DownloadCta'
import ContactForm from '@/components/ContactForm'
import Footer from '@/components/Footer'

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Orchestra',
    operatingSystem: 'Windows, macOS, Linux',
    applicationCategory: 'DeveloperApplication',
    description:
      'Desktop studio for browser automation, web scraping and web RPA. Build flows visually, watch them run live, export plain Playwright code you own.',
    url: 'https://orchestra-automation.com',
    downloadUrl: 'https://orchestra-automation.com/downloads',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Orchestra',
    url: 'https://orchestra-automation.com',
  },
]

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Nav />
      <main>
        <Hero />
        <InstrumentMarquee />
        <HowItWorks />
        <FeatureSplits />
        <CodeOwnership />
        <UseCases />
        <DownloadCta />
        <ContactForm />
      </main>
      <Footer />
    </>
  )
}
