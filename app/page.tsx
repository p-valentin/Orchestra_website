import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import InstrumentMarquee from '@/components/InstrumentMarquee'
import HowItWorks from '@/components/HowItWorks'
import FeatureSplits from '@/components/FeatureSplits'
import CodeOwnership from '@/components/CodeOwnership'
import UseCases from '@/components/UseCases'
import Pricing from '@/components/Pricing'
import DownloadCta from '@/components/DownloadCta'
import ContactForm from '@/components/ContactForm'
import Footer from '@/components/Footer'
import { organizationSchema, ORGANIZATION_ID } from '@/lib/schema'
import { SITE_URL } from '@/lib/site'

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Orchestra',
    operatingSystem: 'Windows, macOS, Linux',
    applicationCategory: 'DeveloperApplication',
    description:
      'Desktop studio for browser automation and web RPA. Build flows visually, watch them run live, export plain Playwright code you own.',
    url: SITE_URL,
    downloadUrl: `${SITE_URL}/downloads`,
    offers: { '@type': 'Offer', price: '149', priceCurrency: 'USD' },
    publisher: { '@id': ORGANIZATION_ID },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Orchestra',
    url: SITE_URL,
    publisher: { '@id': ORGANIZATION_ID },
  },
  // "Orchestra" is an ambiguous brand token — it collides with Meta's
  // Orchestra, orchestra.com and the English word. Without an Organization
  // entity there is nothing tying the name to this domain, which is part of
  // why even the brand query doesn't resolve here.
  organizationSchema(),
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
        <Pricing />
        <DownloadCta />
        <ContactForm />
      </main>
      <Footer />
    </>
  )
}
