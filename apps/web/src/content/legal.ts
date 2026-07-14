/**
 * Published VYGO LLC legal pack for /privacy and /terms.
 * Source of truth also mirrored in docs/vygo/*.md and public/docs/vygo/*.md.
 */

export type LegalListItem = {
  /** Optional bold lead-in (e.g. category label). */
  lead?: string;
  text: string;
};

export type LegalBlock =
  { type: "paragraph"; text: string } | { type: "list"; items: LegalListItem[] };

export type LegalSection = {
  heading: string;
  blocks: LegalBlock[];
};

export type LegalIntro = {
  beforeLink: string;
  linkHref: "/privacy" | "/terms";
  linkLabel: string;
  afterLink: string;
};

export type LegalDocument = {
  title: string;
  intro: LegalIntro;
  sections: LegalSection[];
};

export const legalMeta = {
  operator: "VYGO LLC",
  operatorDescription: "a Michigan limited liability company",
  effectiveDate: "July 13, 2026",
  contactEmail: "hello@vygo.ai",
} as const;

export const privacyContent: LegalDocument = {
  title: "Privacy Policy",
  intro: {
    beforeLink:
      'This Privacy Policy explains how VYGO LLC, a Michigan limited liability company ("VYGO LLC," "we," "us," or "our"), collects, uses, discloses, and protects personal information when you visit vygo.ai or submit its waitlist form (collectively, the "Site"). It also explains your choices. Your use of the Site is also governed by our ',
    linkHref: "/terms",
    linkLabel: "Terms of Use",
    afterLink: ".",
  },
  sections: [
    {
      heading: "Information We Collect",
      blocks: [
        {
          type: "paragraph",
          text: "When you visit the Site or apply to our waitlist, we collect:",
        },
        {
          type: "list",
          items: [
            {
              lead: "Contact and identity information:",
              text: "full name, work email address, and company name.",
            },
            {
              lead: "Professional details:",
              text: "role, product URL, prototype platform, and current lead stage.",
            },
            {
              lead: "Project information:",
              text: "primary blockers, desired start window, budget range, commercial deadlines, and messages or descriptions you provide.",
            },
            {
              lead: "Technical and marketing data:",
              text: "landing and referring page URLs, UTM parameters, interaction and availability events, and security data associated with rate limiting and bot detection. We hash IP addresses with versioned salts rather than retaining them in raw form for rate limiting.",
            },
            {
              lead: "Consent records:",
              text: "acceptance of the Privacy Policy and your marketing preference.",
            },
            {
              lead: "Anti-bot data:",
              text: "Cloudflare Turnstile tokens and related device or interaction signals used to distinguish people from automated traffic.",
            },
          ],
        },
        {
          type: "paragraph",
          text: "Please do not submit sensitive personal information through free-text fields.",
        },
      ],
    },
    {
      heading: "Sources of Information",
      blocks: [
        {
          type: "paragraph",
          text: "We collect information directly from you, automatically from your browser or device when you use the Site, and from the service providers identified below when they operate the Site on our behalf. We may also receive a referring URL and campaign parameters from the page or link that directed you to us.",
        },
      ],
    },
    {
      heading: "How We Use Information",
      blocks: [
        {
          type: "paragraph",
          text: "We use personal information to:",
        },
        {
          type: "list",
          items: [
            { text: "evaluate and respond to waitlist applications and service inquiries;" },
            { text: "send transactional messages about waitlist status;" },
            {
              text: "send marketing communications when you have opted in, which you may stop using the unsubscribe link in the message;",
            },
            {
              text: "understand Site use, measure demand, and improve the Site and our offerings;",
            },
            { text: "prevent fraud, spam, bot submissions, and other abuse;" },
            { text: "maintain, troubleshoot, and secure our systems; and" },
            {
              text: "comply with law and establish, exercise, or defend legal claims.",
            },
          ],
        },
        {
          type: "paragraph",
          text: "Where a law requires a legal basis, we process information as needed for our legitimate interests in operating, securing, and improving the Site and responding to inquiries; with your consent for optional marketing; to take steps at your request before entering a contract; and to comply with legal obligations. You may withdraw consent at any time without affecting processing that occurred before withdrawal.",
        },
      ],
    },
    {
      heading: "Cookies and Similar Technologies",
      blocks: [
        {
          type: "paragraph",
          text: "Cloudflare Turnstile may use necessary cookies, tokens, and device or interaction signals to protect the waitlist form from automated abuse. We also record Site interaction and availability events to understand application flow and demand. These analytics events do not include your name, email address, phone number, or free-text messages. We do not use advertising cookies or cross-site behavioral advertising on the Site.",
        },
        {
          type: "paragraph",
          text: "Browser controls may allow you to block or delete cookies, but blocking necessary technologies can prevent the waitlist form from working.",
        },
      ],
    },
    {
      heading: "AI-Related Processing",
      blocks: [
        {
          type: "paragraph",
          text: "We do not use personal information submitted through the waitlist to train artificial-intelligence models or make decisions that produce legal or similarly significant effects about you. If our practices change, we will update this policy before applying the new practice as required by law.",
        },
      ],
    },
    {
      heading: "How We Disclose Information",
      blocks: [
        {
          type: "paragraph",
          text: "We disclose personal information to vendors that process it on our behalf to operate the Site:",
        },
        {
          type: "list",
          items: [
            {
              lead: "Resend",
              text: "delivers transactional and opted-in marketing email.",
            },
            {
              lead: "Cloudflare",
              text: "provides Turnstile bot protection and security.",
            },
            {
              lead: "Vercel",
              text: "hosts the marketing Site.",
            },
            {
              lead: "Railway",
              text: "hosts the backend API, PostgreSQL database, and Redis cache.",
            },
          ],
        },
        {
          type: "paragraph",
          text: "We may also disclose information when required by law; to protect rights, safety, and security; in connection with a merger, financing, acquisition, reorganization, bankruptcy, or sale of assets; or at your direction. We do not sell personal information or share it for cross-context behavioral advertising.",
        },
      ],
    },
    {
      heading: "Retention",
      blocks: [
        {
          type: "paragraph",
          text: "We retain waitlist and inquiry information while evaluating your application and for up to 24 months after our last substantive interaction with you, unless a longer period is needed for an active business relationship, legal compliance, dispute resolution, or enforcement of agreements. We retain marketing-consent records until you withdraw consent and for a reasonable period afterward to honor and document your choice. Security and analytics records are retained only as long as reasonably necessary for security, troubleshooting, and aggregate analysis. We delete or de-identify information when the applicable retention period ends.",
        },
      ],
    },
    {
      heading: "Security",
      blocks: [
        {
          type: "paragraph",
          text: "We use administrative, technical, and organizational safeguards appropriate to the nature of the information, including HTTPS encryption in transit, access controls, environment separation, secrets scanning, rate limiting, bot protection, and hashed IP identifiers for rate limiting. Our hosting providers manage infrastructure-level protections, including storage security. No transmission or storage system is completely secure, and we cannot guarantee absolute security.",
        },
      ],
    },
    {
      heading: "International Data Transfers",
      blocks: [
        {
          type: "paragraph",
          text: "We and our service providers may process information in the United States and other countries where they operate. Those countries may have different data-protection laws from your country. Where required, we use recognized transfer safeguards, such as contractual protections, and take steps designed to protect information consistently with this policy.",
        },
      ],
    },
    {
      heading: "Your Privacy Rights",
      blocks: [
        {
          type: "paragraph",
          text: "Depending on where you live, you may have rights to request access to, correction of, deletion of, or a portable copy of your personal information; object to or restrict certain processing; withdraw consent; or appeal our response. You may also opt out of marketing at any time.",
        },
        {
          type: "paragraph",
          text: `To exercise a right, email ${legalMeta.contactEmail} and describe your request. We may ask for information reasonably necessary to verify your identity and authority. We will respond within the period required by applicable law and will not discriminate against you for exercising a privacy right. You may also complain to your local data-protection authority.`,
        },
      ],
    },
    {
      heading: "Children's Privacy",
      blocks: [
        {
          type: "paragraph",
          text: `The Site is intended for people age 18 and older. We do not knowingly collect personal information from anyone under 18. If you believe a person under 18 has provided personal information, contact us at ${legalMeta.contactEmail} so we can delete it.`,
        },
      ],
    },
    {
      heading: "Policy Updates",
      blocks: [
        {
          type: "paragraph",
          text: "We may update this Privacy Policy by posting the revised version on the Site and changing the effective date. If a change is material, we will provide additional notice when required by law.",
        },
      ],
    },
    {
      heading: "Contact and Notices",
      blocks: [
        {
          type: "paragraph",
          text: `For questions, privacy requests, or notices concerning this Privacy Policy, contact VYGO LLC at ${legalMeta.contactEmail}. Notices are effective when received.`,
        },
      ],
    },
  ],
};

export const termsContent: LegalDocument = {
  title: "Terms of Use",
  intro: {
    beforeLink:
      'Welcome to the vygo.ai website. These Terms of Use (the "Terms") govern your access to and use of the website and its waitlist features (collectively, the "Site") operated by VYGO LLC, a Michigan limited liability company ("VYGO LLC," "we," "us," or "our"). By using the Site, you agree to these Terms and acknowledge our ',
    linkHref: "/privacy",
    linkLabel: "Privacy Policy",
    afterLink: ". If you do not agree, do not use the Site.",
  },
  sections: [
    {
      heading: "Eligibility and Accounts",
      blocks: [
        {
          type: "paragraph",
          text: "You must be at least 18 years old and able to enter into a binding agreement to use the Site. When you submit information, you agree to provide accurate and current information. You are responsible for maintaining the confidentiality of any account credentials and for activity under your account. Submitting a waitlist application or contacting VYGO LLC does not form a client relationship. Services begin only under a separately executed agreement that defines scope, fees, timelines, and responsibilities.",
        },
      ],
    },
    {
      heading: "Acceptable Use",
      blocks: [
        {
          type: "paragraph",
          text: "You may not misuse the Site, attempt unauthorized access, interfere with its security or availability, submit malicious content, use it for spam or abuse, violate another person's rights, or use it in violation of applicable law.",
        },
      ],
    },
    {
      heading: "User Content",
      blocks: [
        {
          type: "paragraph",
          text: 'Materials, feedback, or information you submit to us ("User Content") remain yours. You grant VYGO LLC a worldwide, non-exclusive, royalty-free license to host, reproduce, modify, and use User Content only as reasonably necessary to operate, secure, and improve the Site and evaluate or respond to your inquiry. You represent that you have the rights needed to submit User Content and grant this license.',
        },
      ],
    },
    {
      heading: "Intellectual Property",
      blocks: [
        {
          type: "paragraph",
          text: "The Site's text, design, diagrams, software, and related materials are owned by VYGO LLC or its licensors and are protected by intellectual-property laws. Except as permitted by law, you may not copy, modify, distribute, or reuse them without our written permission.",
        },
      ],
    },
    {
      heading: "Third-Party Services",
      blocks: [
        {
          type: "paragraph",
          text: "The Site may reference or link to third-party tools, websites, or resources. A reference does not imply endorsement or partnership. VYGO LLC is not responsible for third-party content, availability, privacy practices, or services.",
        },
      ],
    },
    {
      heading: "Service Changes and Availability",
      blocks: [
        {
          type: "paragraph",
          text: "We may modify, suspend, or discontinue the Site or any feature at any time. We do not guarantee continuous availability. Openings for our services depend on capacity, and compliance-readiness work does not guarantee certification or attestation by an independent auditor or certification body.",
        },
      ],
    },
    {
      heading: "Suspension and Termination",
      blocks: [
        {
          type: "paragraph",
          text: "We may suspend or terminate access to the Site when we reasonably believe a user has violated these Terms, created risk or possible legal exposure, or threatened the Site's security or operation. Provisions that by their nature should survive termination will survive, including intellectual-property, disclaimer, liability, indemnification, and dispute provisions.",
        },
      ],
    },
    {
      heading: "Disclaimers",
      blocks: [
        {
          type: "paragraph",
          text: 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SITE AND ITS CONTENT ARE PROVIDED "AS IS" AND "AS AVAILABLE." VYGO LLC DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SITE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE. SOME JURISDICTIONS DO NOT ALLOW CERTAIN WARRANTY EXCLUSIONS, SO SOME EXCLUSIONS MAY NOT APPLY TO YOU.',
        },
      ],
    },
    {
      heading: "Limitation of Liability",
      blocks: [
        {
          type: "paragraph",
          text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, VYGO LLC AND ITS OFFICERS, MEMBERS, EMPLOYEES, AGENTS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING FROM OR RELATED TO THE SITE OR THESE TERMS, REGARDLESS OF THE THEORY OF LIABILITY AND EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. TO THE MAXIMUM EXTENT PERMITTED BY LAW, THEIR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SITE OR THESE TERMS WILL NOT EXCEED US $100. THESE LIMITATIONS DO NOT APPLY TO LIABILITY THAT CANNOT BE LIMITED OR EXCLUDED BY LAW.",
        },
      ],
    },
    {
      heading: "Indemnification",
      blocks: [
        {
          type: "paragraph",
          text: "To the extent permitted by law, you agree to defend, indemnify, and hold harmless VYGO LLC and its officers, members, employees, and agents from claims, liabilities, damages, losses, and reasonable expenses, including legal fees, arising from your User Content, misuse of the Site, or violation of these Terms or another person's rights.",
        },
      ],
    },
    {
      heading: "Governing Law and Venue",
      blocks: [
        {
          type: "paragraph",
          text: "Michigan law governs these Terms, without regard to conflict-of-laws principles. Any dispute arising from or relating to these Terms or the Site must be brought exclusively in a state or federal court located in Michigan, and you consent to those courts' personal jurisdiction. Nothing in this section limits rights that applicable consumer law does not permit you to waive.",
        },
      ],
    },
    {
      heading: "Changes to the Terms",
      blocks: [
        {
          type: "paragraph",
          text: "We may update these Terms by posting the revised version on the Site and changing the effective date. If a change is material, we will provide additional notice when required by law. Changes apply when posted unless the notice states otherwise. Your continued use of the Site after a change takes effect constitutes acceptance of the revised Terms.",
        },
      ],
    },
    {
      heading: "Contact and Notices",
      blocks: [
        {
          type: "paragraph",
          text: `Questions and legal notices concerning these Terms may be sent to VYGO LLC at ${legalMeta.contactEmail}. Notices are effective when received.`,
        },
      ],
    },
  ],
};
