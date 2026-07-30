import { serializeCampaign, type CampaignConfig } from "@/lib/campaign/types";
import { CampaignNav } from "./CampaignNav";
import { CampaignFooter } from "./CampaignFooter";
import { SectionRenderer } from "./SectionRenderer";

/**
 * Reduced-navigation campaign shell. Renders the reduced header, the enabled
 * sections in configured order, and the reduced footer. The ordered, enabled
 * configuration is serialized into the DOM so render order and the enabled set
 * are verifiable from the page source.
 */
export function CampaignShell({ config }: { config: CampaignConfig }) {
  const serialized = serializeCampaign(config);

  return (
    <div data-campaign-shell="" data-campaign-id={config.id}>
      {/* Machine-readable campaign descriptor: ordered sections + enabled set. */}
      <script
        type="application/json"
        id="campaign-config"
        data-campaign-config=""
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serialized) }}
      />
      <CampaignNav nav={config.nav} />
      <main id="main-content">
        {config.sections.map((section) => (
          <SectionRenderer key={section.id} section={section} />
        ))}
      </main>
      <CampaignFooter footer={config.footer} />
    </div>
  );
}
