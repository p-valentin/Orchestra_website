import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import Features from '@/components/Features'
import Translation from '@/components/Translation'
import Transparency from '@/components/Transparency'
import CtaSection from '@/components/CtaSection'
import ContactForm from '@/components/ContactForm'
import Footer from '@/components/Footer'

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Features />
        <Translation />
        <Transparency />
        <CtaSection />
        <ContactForm />
      </main>
      <Footer />
    </>
  )
}
