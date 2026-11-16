import { config } from '../config.js';

/**
 * Single source of truth for ChargeNeighbor policies.
 *
 * The booking engine reads the same numbers that the policy pages display, so
 * the published cancellation window can never drift from what is enforced.
 * Edit this file (or the env vars it reads) and every screen updates.
 */

export const cancellation = {
  freeUntilHours: 12,
  partialUntilHours: 2,
  partialRefundPercent: 50,
  noShowRefundPercent: 0,
  hostCancelRefundPercent: 100,
};

export const bookingRules = {
  minLeadMinutes: config.minLeadMinutes,
  slotStepMinutes: config.slotStepMinutes,
  holdMinutes: 15,
  gracePeriodMinutes: 15,
  maxAdvanceDays: 60,
};

export const fees = {
  platformFeePercent: config.platformFeePercent,
  currency: config.currency,
};

const effectiveDate = '2 November 2026';
const operator = 'ChargeNeighbor';

/**
 * Refund percentage a driver receives when cancelling `minutesBefore` the start.
 */
export function refundPercentForCancellation(minutesBefore) {
  const hours = minutesBefore / 60;
  if (hours >= cancellation.freeUntilHours) return 100;
  if (hours >= cancellation.partialUntilHours) return cancellation.partialRefundPercent;
  return 0;
}

export const policyDocuments = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    summary:
      'The agreement between you, the driver or host, and ChargeNeighbor when you use the platform.',
    updated: effectiveDate,
    sections: [
      {
        heading: 'What ChargeNeighbor is',
        body: [
          `${operator} is a marketplace. Hosts list individually owned residential charging points and drivers reserve charging time directly from them. We are not the owner, operator or installer of any charger on the platform, and we do not supply electricity.`,
          'Hosts decide their own price, availability and house rules. Drivers decide which charger to reserve. ChargeNeighbor provides discovery, booking records, payment collection (when online payments are enabled) and support.',
        ],
      },
      {
        heading: 'Accounts',
        body: [
          'You must sign in with a phone number you control and provide accurate information about yourself and your vehicle. One person may hold a driver account and a host account, but listings may only be created for a property you are entitled to offer.',
          'You are responsible for activity on your account. Tell support immediately if you believe someone else has access to it.',
        ],
      },
      {
        heading: 'Host obligations',
        body: [
          'A host must have permission from the property owner or residents, and must keep the charging point and its electrical installation in a safe, working condition that meets applicable local electrical safety rules.',
          'Hosts must describe the charger accurately (connector, current type, rated power), keep the availability calendar honest, and pause the listing when the charger is unavailable.',
          'Hosts may not discriminate against drivers on grounds protected by applicable law.',
        ],
      },
      {
        heading: 'Driver obligations',
        body: [
          'A driver must arrive within the booked window, follow the house rules shown on the listing, use only the charger described, and leave the space clean and unobstructed at the end of the session.',
          'A driver must not share access details, check-in codes or the private address of a host with anyone else.',
        ],
      },
      {
        heading: 'Bookings and price',
        body: [
          'The price shown before you confirm is the price for that session, including the ChargeNeighbor service fee. The full breakdown is displayed before you reserve.',
          'Energy delivered is not metered in this release. Sessions are sold in time units, not per kWh, and the amount of energy actually delivered depends on your vehicle, the charger and conditions at the property.',
          'A booking is only confirmed when the platform shows a booking reference and a confirmed status.',
        ],
      },
      {
        heading: 'Liability',
        body: [
          'ChargeNeighbor is not liable for the condition of a host property, the performance of a host charger, or damage caused by a driver at a host property. Responsibility for property damage, injury, electrical faults, theft and vehicle damage follows applicable law and any insurance each party holds.',
          'Nothing in these terms limits rights you have under applicable consumer protection law.',
        ],
      },
      {
        heading: 'Suspension',
        body: [
          'We may pause a listing or suspend an account where we have a reasonable belief that a charger is unsafe, a listing is misleading, fraud is involved, or repeated cancellations or no-shows are harming other users. Where practical, we tell you why and how to respond.',
        ],
      },
      {
        heading: 'Changes',
        body: [
          'We may update these terms as the product changes. Material changes are announced in the app before they take effect.',
        ],
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary:
      'What we collect, why we need it, how long we keep it, and what is never shown publicly.',
    updated: effectiveDate,
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Account: your phone number, display name, and the account roles you use. Your phone number is verified with a one-time code.',
          'Sign-in credentials: if you choose a login ID and password, we store the login ID and a salted scrypt hash of the password. The password itself is never stored, logged or sent back to your browser.',
          'Booking data: which listing you reserved, the time window, the amount, the booking status and any cancellation or report you raise.',
          'Vehicle profile (optional): the connector type and optional efficiency figures you enter to make compatibility checks easier.',
          'Listing data (hosts): charger specifications, photos, house rules, the public neighbourhood, a private street address used only for access, and availability windows.',
          'Technical data: server logs needed to operate the service and secure it, including IP address and request timestamps.',
        ],
      },
      {
        heading: 'What is public, and what is not',
        body: [
          'Listings show a neighbourhood or area (for example a locality and city) and an approximate map position. They never show the exact address, house number, host phone number, private access instructions or any code.',
          'The exact address and access instructions are revealed to the driver only after a booking is confirmed, and only for the duration of that booking.',
          'Check-in codes are generated per booking. There are no reusable access codes in public listing data.',
        ],
      },
      {
        heading: 'Why we process it',
        body: [
          'To create and secure your account, to show compatible chargers near you, to record bookings and payments, to send booking updates, to handle cancellations, refunds, reports and disputes, and to meet legal obligations.',
          'We do not sell personal data, and we do not use the details of a host property for advertising.',
        ],
      },
      {
        heading: 'Retention',
        body: [
          'Account data is kept while your account exists. Booking and payment records are kept as long as required for tax, accounting and dispute handling. Verification records keep only the status and a provider reference, not copies of identity documents.',
        ],
      },
      {
        heading: 'Your controls',
        body: [
          'You can update your profile, delete a listing, pause a listing, and request deletion of your account from Account settings. Deletion removes your profile and public content; records we must retain for legal, tax or fraud-prevention reasons are kept for the required period and then deleted.',
          'You can unsubscribe from non-essential notifications without affecting booking messages.',
        ],
      },
      {
        heading: 'Internal access',
        body: [
          'Support and admin staff can see only what a case requires. Sensitive actions are logged in an audit trail.',
        ],
      },
    ],
  },
  {
    slug: 'cancellation',
    title: 'Cancellation & Refunds',
    summary: `The exact windows applied by the booking engine at ${operator}, including host cancellations.`,
    updated: effectiveDate,
    cancellationTable: true,
    sections: [
      {
        heading: 'When a driver cancels',
        body: [
          `More than ${cancellation.freeUntilHours} hours before the session start: full refund.`,
          `Between ${cancellation.partialUntilHours} and ${cancellation.freeUntilHours} hours before the start: ${cancellation.partialRefundPercent}% of the amount paid is refunded.`,
          `Less than ${cancellation.partialUntilHours} hours before the start, or a no-show: no refund.`,
        ],
      },
      {
        heading: 'When a host cancels or the charger fails',
        body: [
          'If a host cancels a confirmed booking or the charger is not usable when the driver arrives, the driver receives a full refund of the amount paid, including the service fee.',
          'Repeated host cancellations, or a charger reported unusable more than once, put the listing into review.',
        ],
      },
      {
        heading: 'Late arrival and overstay',
        body: [
          `We hold the slot for ${bookingRules.gracePeriodMinutes} minutes after the start time. After that the host may mark the booking as a no-show and the session may be released.`,
          'Staying beyond the booked window without the host agreeing to an extension is not permitted. The host may end the session and report an overstay.',
        ],
      },
      {
        heading: 'How refunds are paid',
        body: [
          'Refunds are issued to the original payment method where an online payment was taken, and are tracked with a refund status you can see in your booking history. Bank settlement timing depends on the payment provider and your bank.',
          'In offline payment mode, no money is collected by the platform, so there is nothing to refund through the platform; the cancellation window still decides whether you owe the host anything.',
        ],
      },
      {
        heading: 'Disputes',
        body: [
          'If you disagree with a cancellation outcome or a session did not happen as described, open a report from the booking within 7 days. Support reviews the booking record, both parties\' account of events and any evidence, then applies this policy and records the outcome.',
        ],
      },
    ],
  },
  {
    slug: 'safety',
    title: 'Safety Policy',
    summary:
      'How charging visits are kept predictable, and what the platform does and does not guarantee.',
    updated: effectiveDate,
    sections: [
      {
        heading: 'Verification, stated precisely',
        body: [
          'A verified phone number means we have confirmed the person controls that number. It does not mean we have verified their identity, their property, or the safety of their charger.',
          'A reviewed listing means a human on our team checked that the submitted charger details, photos and rules are complete and plausible. It is not an electrical inspection and it does not certify the installation.',
          'Badges on the website always spell out which of these applies. We never present phone verification as identity verification.',
        ],
      },
      {
        heading: 'Electrical safety',
        body: [
          'Hosts are responsible for using a charger that is correctly installed, earthed and protected by appropriate circuit protection, and for keeping cables, plugs and connectors in good condition.',
          'The app does not replace a professional electrical inspection. If a charger looks damaged, smells burnt, sparks, or trips repeatedly, stop the session immediately and report it.',
        ],
      },
      {
        heading: 'During a visit',
        body: [
          'Park only in the space described in the booking, respect the household, keep noise down, and keep children and pets supervised.',
          'The check-in code in your booking is unique to that booking. Do not share it. Do not share the address or any access detail with anyone else.',
        ],
      },
      {
        heading: 'Emergencies',
        body: [
          'ChargeNeighbor is not an emergency service and cannot dispatch help. In an emergency, contact local emergency services first, then report the incident in the app so support can follow up.',
          'For non-emergency problems during a session, use the report action on the booking. Support aims to respond during operating hours.',
        ],
      },
      {
        heading: 'Reporting and blocking',
        body: [
          'You can report a listing, a session or a user from the listing page, the booking page or the help page. Reports are reviewed by support; serious reports lead to the listing or account being paused while we investigate.',
        ],
      },
    ],
  },
  {
    slug: 'hosts',
    title: 'Host Rules',
    summary:
      'What it takes to list a home charger, what you control, and what we expect from you.',
    updated: effectiveDate,
    sections: [
      {
        heading: 'Eligibility',
        body: [
          'You must have the right to offer charging at the property — as owner, or with the permission of the owner or residents. Your charger must be a real, working installation at that property.',
          'Your account phone number must be verified, and your listing must be reviewed before it appears in search.',
        ],
      },
      {
        heading: 'What you control',
        body: [
          'Your price per hour, the availability windows you publish, the house rules, the maximum session length, and whether the listing is paused. Pausing a listing hides it from search immediately; bookings already confirmed stay valid unless you cancel them, which triggers a full refund.',
        ],
      },
      {
        heading: 'Pricing and earnings',
        body: [
          `Drivers pay your hourly price plus a ${config.platformFeePercent}% platform service fee. Your gross earning for a session is your hourly price multiplied by the booked duration. The fee, any refund, and the resulting net amount are shown on every booking in your dashboard.`,
          'We do not promise a fixed or guaranteed income. Demand depends on your location, price, availability and time of year.',
        ],
      },
      {
        heading: 'Photos and listing accuracy',
        body: [
          'Photos must be of the actual charging point and parking space. Do not use stock images or photos of someone else\'s installation.',
          'If your charger, connector, power rating or access arrangements change, update the listing before the next booking.',
        ],
      },
      {
        heading: 'Guest conduct and your household',
        body: [
          'You may set reasonable house rules about parking, noise, supervision and arrival windows, as long as they are not discriminatory and are shown before a driver books.',
          'You must not ask a driver to pay outside the platform, or ask for identity documents beyond what the platform collects.',
        ],
      },
    ],
  },
  {
    slug: 'community',
    title: 'Community & Acceptable Use',
    summary:
      'The behaviour that keeps a neighbour-to-neighbour marketplace worth using.',
    updated: effectiveDate,
    sections: [
      {
        heading: 'Reviews',
        body: [
          'Only a driver who completed a session on a listing can review it, and each completed booking can be reviewed once. Reviews must describe the charging experience, not personal details about the host or household.',
          'Reviews must not contain addresses, phone numbers, names of people who live at the property, or anything that identifies a private home.',
          'We remove reviews that break these rules and record the moderation action.',
        ],
      },
      {
        heading: 'Prohibited conduct',
        body: [
          'Fake listings, listing a charger that does not exist, or charging for a session you cannot deliver.',
          'Harassment, discrimination, threats, or entering areas of a property that are not part of the booking.',
          'Attempting to move a payment off-platform, or asking another user for their password, one-time code or check-in code.',
          'Scraping, probing or attacking the platform, or trying to access another user\'s account or booking.',
        ],
      },
      {
        heading: 'Consequences',
        body: [
          'Depending on severity we may warn, remove content, cancel bookings with refunds, pause a listing, or suspend an account. Fraud and safety incidents may be reported to the authorities where the law requires it.',
        ],
      },
    ],
  },
];

/**
 * What a listing needs before it can be submitted for review. Shared with the
 * interface so the checklist shown to a host is exactly what the API enforces.
 */
export const listingRules = {
  descriptionMin: 30,
  descriptionMax: 1200,
  photosMin: 1,
  availabilityWindowsMin: 1,
  requiresAccessNotes: true,
};

export const policyIndex = policyDocuments.map(({ slug, title, summary, updated }) => ({
  slug,
  title,
  summary,
  updated,
}));

export function getPolicy(slug) {
  return policyDocuments.find((doc) => doc.slug === slug) ?? null;
}

export const policyMeta = {
  effectiveDate,
  operator,
  cancellation,
  bookingRules,
  fees,
  refundPercentForCancellation,
};
