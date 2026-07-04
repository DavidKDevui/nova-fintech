import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { TrustStrip } from "@/components/TrustStrip";
import { Features } from "@/components/Features";
import { FeatureRows } from "@/components/FeatureRows";
import { Optimisations } from "@/components/Optimisations";
import { Steps } from "@/components/Steps";
import { Stats } from "@/components/Stats";
import { Testimonial } from "@/components/Testimonial";
import { Pricing } from "@/components/Pricing";
import { Faq } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TrustStrip />
        <Features />
        <FeatureRows />
        <Optimisations />
        <Steps />
        <Stats />
        <Testimonial />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
