/**
 * LEGAL REVIEW: Draft for legal review — not finalized legal advice.
 * Source copy is a readable placeholder for counsel review.
 * Do not present as finalized legal advice until counsel approves.
 */

export const legalMeta = {
  /** Machine-readable / visible marker for deployed legal pages. */
  reviewMarker: "legal-review-draft",
  reviewLabel: "Draft for legal review",
  disclaimer:
    "This page is a draft placeholder for counsel review and is not finalized legal advice.",
  effectiveDate: "2026-07-01",
  contactEmail: "hello@vygo.ai",
} as const;

export const privacyContent = {
  title: "Privacy Notice",
  sections: [
    {
      heading: "Overview",
      body: "This draft notice describes how vygo may collect and process information through the marketing website and waitlist application. It is not finalized legal advice and will be reviewed by counsel before being treated as operative policy language.",
    },
    {
      heading: "Data collected through the application form",
      body: "Depending on the fields you complete, we may collect your name, work email, company name, product or company URL, role/title, product stage, primary blocker, desired start window, budget range, description of your needs, consent preferences, and limited attribution data such as UTM parameters and referrer.",
    },
    {
      heading: "Purpose of processing",
      body: "We process application data to review waitlist and audit requests, respond to inquiries, operate the website, protect against abuse, improve our services, and—only where you separately consent—send marketing updates.",
    },
    {
      heading: "Service providers",
      body: "We may use service providers for website hosting, database storage, email delivery, anti-bot protection, privacy-friendly analytics, and error monitoring. Providers process data only as needed to provide those services under contractual protections appropriate to the engagement.",
    },
    {
      heading: "Retention",
      body: "Application records are retained for as long as needed to evaluate openings, maintain legitimate business records, meet legal obligations, and resolve disputes. Retention periods will be finalized with counsel and operational practice.",
    },
    {
      heading: "Security measures",
      body: "We apply administrative, technical, and organizational measures appropriate to the nature of the data, including access controls, transport encryption, and operational logging. No method of transmission or storage is perfectly secure.",
    },
    {
      heading: "Marketing consent",
      body: "Marketing updates are optional and separate from required application processing consent. You may unsubscribe from marketing communications using the instructions in those messages or by contacting us.",
    },
    {
      heading: "Access and deletion",
      body: `To request access to or deletion of waitlist-related personal data, contact ${legalMeta.contactEmail}. We may need to verify your request and retain limited information where required by law or legitimate operational needs.`,
    },
    {
      heading: "International processing",
      body: "If you access the site or submit an application from outside the United States, your information may be processed in the United States or other locations where we or our providers operate. Cross-border transfer details will be finalized with counsel as needed.",
    },
    {
      heading: "Effective date and changes",
      body: `This draft is effective as of ${legalMeta.effectiveDate} for planning purposes only. We may update this notice; material changes will be reflected on this page with an updated effective date after legal review.`,
    },
  ],
} as const;

export const termsContent = {
  title: "Website Terms",
  sections: [
    {
      heading: "Informational nature of the website",
      body: "The vygo.ai website provides general information about production engineering services. Content is for informational purposes and does not create a professional engagement, guarantee availability, or constitute legal, security, or compliance advice.",
    },
    {
      heading: "No engagement until a signed agreement",
      body: "Submitting a waitlist application or contacting vygo does not form a client relationship. Services begin only under a separately executed agreement that defines scope, fees, timelines, and responsibilities.",
    },
    {
      heading: "No guarantee of availability or certification outcomes",
      body: "Openings depend on capacity. Compliance readiness work does not guarantee certification or attestation decisions by independent auditors or certification bodies.",
    },
    {
      heading: "Intellectual property of website content",
      body: "Website text, design, diagrams, and related materials are owned by vygo or its licensors and may not be copied or reused except as permitted by law or written permission.",
    },
    {
      heading: "Acceptable use",
      body: "You agree not to misuse the site, attempt unauthorized access, interfere with security or availability, submit malicious content, or use the waitlist for spam or abusive purposes.",
    },
    {
      heading: "External links",
      body: "The site may reference third-party tools or resources. Those references do not imply partnership or endorsement, and vygo is not responsible for third-party sites or services.",
    },
    {
      heading: "Disclaimer and limitation",
      body: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SITE AND ITS CONTENT ARE PROVIDED “AS IS” WITHOUT WARRANTIES OF ANY KIND. LIMITATION-OF-LIABILITY LANGUAGE WILL BE FINALIZED BY COUNSEL AND IS NOT OPERATIVE FINAL LEGAL ADVICE IN THIS DRAFT.",
    },
    {
      heading: "Contact",
      body: `Questions about these terms: ${legalMeta.contactEmail}.`,
    },
  ],
} as const;
