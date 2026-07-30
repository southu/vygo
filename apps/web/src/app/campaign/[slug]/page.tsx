import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaign, getCampaignSlugs } from "@/content/campaigns";
import { CampaignShell } from "@/components/campaign-landing/CampaignShell";

type PageParams = { slug: string };

export function generateStaticParams(): PageParams[] {
  return getCampaignSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const campaign = getCampaign(slug);
  if (!campaign) return {};

  const { meta } = campaign;
  return {
    // Absolute so the root "%s | vygo.ai" template does not double the suffix.
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: meta.canonical },
    openGraph: {
      type: "website",
      url: meta.canonical,
      title: meta.ogTitle,
      description: meta.ogDescription,
      siteName: "vygo.ai",
      images: [{ url: meta.ogImage, width: 1200, height: 630, alt: meta.ogImageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.ogTitle,
      description: meta.ogDescription,
      images: [meta.ogImage],
    },
  };
}

export default async function CampaignPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const campaign = getCampaign(slug);
  if (!campaign) notFound();
  return <CampaignShell config={campaign} />;
}
