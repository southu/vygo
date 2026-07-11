"use client";

import { useId, useState } from "react";
import type { FaqItem } from "@/content/faq";

type FAQAccordionProps = {
  items: readonly FaqItem[];
};

export function FAQAccordion({ items }: FAQAccordionProps) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const expanded = openIndex === index;
        const buttonId = `${baseId}-btn-${index}`;
        const panelId = `${baseId}-panel-${index}`;

        return (
          <div key={item.question} className="card !p-0 overflow-hidden">
            <h3>
              <button
                id={buttonId}
                type="button"
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-ink"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpenIndex(expanded ? null : index)}
              >
                <span>{item.question}</span>
                <span className="text-purple" aria-hidden="true">
                  {expanded ? "−" : "+"}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!expanded}
              className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted"
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
