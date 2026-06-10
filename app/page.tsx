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

export default function Page() {
  return (
    <>
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
