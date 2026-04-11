import { PageMeta } from '@/components/common/PageMeta';
import Header from '@/components/generated/Header';
import Footer from '@/components/generated/Footer';
import HeroSection from '@/components/generated/HeroSection';
import ServicesSection from '@/components/generated/ServicesSection';
import PortfolioSection from '@/components/generated/PortfolioSection';
import AboutSection from '@/components/generated/AboutSection';
import CaseStudiesSection from '@/components/generated/CaseStudiesSection';
import CTASection from '@/components/generated/CTASection';

export default function Home() {
  return (
    <>
      <PageMeta
        title="盖可设计圈 - 让创意落地，让设计发声"
        description="面向个人品牌的多元化创意设计与技术服务平台，提供 3D 建模、应用开发、原画设计、学习交友、教育咨询等服务"
        keywords={['盖可设计圈', '3D 建模', '应用开发', '原画设计', '设计服务', '创意社区']}
      />
      <div className="min-h-screen bg-[#0A0A0F]">
        <Header />
        <main className="pt-20">
          <HeroSection />
          <ServicesSection />
          <PortfolioSection />
          <AboutSection />
          <CaseStudiesSection />
          <CTASection />
        </main>
        <Footer />
      </div>
    </>
  );
}
