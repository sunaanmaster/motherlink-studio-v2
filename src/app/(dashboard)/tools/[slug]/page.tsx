import React from 'react';
import ToolPageClient from '@/components/tools/ToolPageClient';

// ============================================================
// Dynamic Tool Page — Static Param Generation for Export
// ============================================================

// Define the default slugs to be pre-generated for static export
export function generateStaticParams() {
  const defaultSlugs = [
    'image-generator',
    'writing-assistant',
    'seo-assistant',
    'documentation-qa',
    'campaign-assistant'
  ];
  
  return defaultSlugs.map((slug) => ({
    slug: slug,
  }));
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ToolPageClient initialSlug={slug} />;
}
