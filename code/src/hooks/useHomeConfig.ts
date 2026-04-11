import { useState, useEffect } from 'react';
import { configApi } from '@/lib/api';

export interface HeroConfig {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  button1_text?: string;
  button1_link?: string;
  button2_text?: string;
  button2_link?: string;
}

export interface AboutConfig {
  id: string;
  title: string;
  description?: string;
  stats?: { value: string; label: string }[];
  image_url?: string;
  badge_text?: string;
}

export interface CTAConfig {
  id: string;
  title: string;
  description?: string;
  button1_text?: string;
  button1_link?: string;
  button2_text?: string;
  button2_link?: string;
}

export interface SiteSetting {
  id: string;
  key: string;
  value: string;
  type: string;
}

export interface CaseStudy {
  id: string;
  title: string;
  client?: string;
  category?: string;
  challenge?: string;
  solution?: string;
  result?: string;
  testimonial?: string;
  rating?: number;
  image_url?: string;
}

export interface HomeConfig {
  hero: HeroConfig | null;
  about: AboutConfig | null;
  cta: CTAConfig | null;
  services: any[];
  caseStudies: CaseStudy[];
  siteSettings: SiteSetting[];
}

export interface UseHomeConfigReturn {
  config: HomeConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useHomeConfig(): UseHomeConfigReturn {
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await configApi.getHomeConfig();
      setConfig(response.data.data);
    } catch (err: any) {
      console.error('Failed to fetch home config:', err);
      setError(err.message || '获取配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  return {
    config,
    loading,
    error,
    refetch: fetchConfig
  };
}
