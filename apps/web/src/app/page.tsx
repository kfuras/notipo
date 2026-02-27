import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Personas } from "@/components/landing/personas";
import { TemplatePreview } from "@/components/landing/template-preview";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { Cta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { JsonLd } from "@/components/landing/json-ld";

export default function Home() {
  return (
    <>
      <JsonLd />
      <Nav />
      <main className="overflow-hidden">
        <Hero />
        <Personas />
        <TemplatePreview />
        <HowItWorks />
        <Features />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
