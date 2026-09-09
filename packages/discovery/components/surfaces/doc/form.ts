/**
 * The synthetic source document: a bilingual NBFC loan application, hand-filled,
 * photocopied, photographed. Three pages.
 *
 * **This is fabricated and nobody who reads Tamil has checked it.** The four specific
 * assumptions — that the Tamil reads naturally, that ௧/௪ are confusable in someone's
 * handwriting, that a struck-through correction looks like this on a real form, and
 * that this field set is plausible — are listed in
 * grammar/log/2026-09-09-doc-decisions.md. Correct them, don't trust them.
 *
 * Coordinates are normalised (0–1 of page width and height), which is what pdf.js
 * reports for a text item's bounding box. That's deliberate: the overlay maths here
 * is identical to the maths over a real PDF, so swapping the renderer later changes
 * nothing about the provenance design.
 *
 * The regions must match `scripts.docReviewFull` in grammar/agent-runtime.ts. They're
 * duplicated rather than derived because the script is the agent's *claim* about where
 * it looked and this file is what's actually on the paper — and a claim that can't
 * disagree with the evidence is not a claim. `npm test` checks they line up.
 */

export interface FormLine {
  page: number;
  /** Printed on the form. */
  label: string;
  labelTa?: string;
  /** Where the written value sits. Matches the script's provenance region. */
  region: { x: number; y: number; w: number; h: number };
  /** The field name this line corresponds to, if the agent extracted it. */
  field?: string;
  /** What is on the paper. */
  written?: string;
  lang?: string;
  /** An earlier value, struck through. */
  struck?: string;
  /** Rendered as an unreadable smear rather than text. */
  smudged?: boolean;
  /**
   * How much room the printed label needs to the left of the value, in page
   * widths. Fields in the right-hand column of the form get a narrow gutter, or
   * their label reaches back across the field beside them.
   */
  labelSpan?: number;
}

export const FORM_TITLE = {
  en: 'Application for business loan',
  ta: 'வணிகக் கடன் விண்ணப்பம்',
  meta: 'Form NBFC-4 · Mylapore branch · page',
};

export const FORM_LINES: FormLine[] = [
  /* ---- page 1: identity and the loan ---- */
  { page: 1, label: 'Applicant name', labelTa: 'விண்ணப்பதாரர் பெயர்', field: 'applicant_name',
    written: 'முருகன் சுப்ரமணியன்', lang: 'ta-IN',
    region: { x: .30, y: .175, w: .38, h: .035 } },
  { page: 1, label: "Father's name", labelTa: 'தந்தை பெயர்', field: 'father_name',
    written: 'சுப்ரமணியன் கிருஷ்ணன்', lang: 'ta-IN',
    region: { x: .30, y: .225, w: .38, h: .035 } },
  { page: 1, label: 'Date of birth', labelTa: 'பிறந்த தேதி', field: 'date_of_birth',
    written: '12 / 03 / 1987',
    region: { x: .30, y: .275, w: .22, h: .032 } },
  { page: 1, label: 'Address', labelTa: 'முகவரி', field: 'address',
    written: '14/2, தெற்கு மாட வீதி, மயிலாப்பூர், சென்னை', lang: 'ta-IN',
    region: { x: .30, y: .325, w: .52, h: .06 } },
  { page: 1, label: 'PIN', field: 'pincode', written: '600004',
    region: { x: .72, y: .325, w: .12, h: .032 }, labelSpan: .10 },
  { page: 1, label: 'Mobile', labelTa: 'கைபேசி', field: 'mobile', written: '98407 21133',
    region: { x: .30, y: .40, w: .28, h: .032 } },
  { page: 1, label: 'PAN', field: 'pan', written: 'AXKPS4412N',
    region: { x: .30, y: .45, w: .26, h: .032 } },
  { page: 1, label: 'Aadhaar', field: 'aadhaar',
    region: { x: .30, y: .485, w: .26, h: .032 } },
  { page: 1, label: 'Loan amount', labelTa: 'கடன் தொகை', field: 'loan_amount', written: '4,15,000',
    region: { x: .62, y: .52, w: .20, h: .034 } },
  { page: 1, label: 'Purpose', labelTa: 'நோக்கம்', field: 'loan_purpose',
    written: 'व्यवसाय विस्तार', lang: 'hi-IN',
    region: { x: .30, y: .57, w: .34, h: .034 } },
  { page: 1, label: 'Tenure', field: 'tenure_months', written: '36 months',
    region: { x: .62, y: .57, w: .12, h: .034 }, labelSpan: .10 },

  /* ---- page 2: employment and banking ---- */
  { page: 2, label: 'Employer / firm', labelTa: 'நிறுவனம்', field: 'employer_name',
    written: 'ஸ்ரீ வேங்கடேஸ்வரா டிரேடர்ஸ்', struck: 'ஸ்ரீ வேங்கடேஸ்வரா ஸ்டோர்ஸ்', lang: 'ta-IN',
    region: { x: .30, y: .18, w: .44, h: .036 } },
  { page: 2, label: 'Employment type', field: 'employment_type', written: 'Self-employed',
    region: { x: .30, y: .23, w: .24, h: .032 } },
  { page: 2, label: 'Years', field: 'years_in_business', written: '7',
    region: { x: .58, y: .23, w: .08, h: .032 }, labelSpan: .10 },
  { page: 2, label: 'Existing EMI', field: 'existing_emi', written: '8,400',
    region: { x: .58, y: .31, w: .16, h: .032 }, labelSpan: .10 },
  { page: 2, label: 'Bank', labelTa: 'வங்கி', field: 'bank_name',
    written: 'Indian Overseas Bank, Mylapore',
    region: { x: .30, y: .40, w: .42, h: .034 } },
  { page: 2, label: 'Account number', field: 'account_number', smudged: true,
    region: { x: .30, y: .45, w: .30, h: .034 } },
  { page: 2, label: 'IFSC', field: 'ifsc', written: 'IOBA0001234',
    region: { x: .30, y: .50, w: .26, h: .032 } },

  /* ---- page 3: security and signatures ---- */
  { page: 3, label: 'Property value', labelTa: 'சொத்து மதிப்பு', field: 'property_value',
    written: '28,50,000',
    region: { x: .58, y: .22, w: .22, h: .034 }, labelSpan: .10 },
  { page: 3, label: 'Property type', field: 'property_type',
    region: { x: .30, y: .27, w: .30, h: .034 } },
  { page: 3, label: 'Guarantor name', labelTa: 'உத்தரவாதம்', field: 'guarantor_name',
    written: 'கே. சுப்ரமணியன்', lang: 'ta-IN',
    region: { x: .30, y: .40, w: .36, h: .036 } },
  { page: 3, label: 'Guarantor signature', field: 'guarantor_signature', smudged: true,
    region: { x: .30, y: .85, w: .30, h: .05 } },
];

export const linesFor = (page: number) => FORM_LINES.filter((line) => line.page === page);

export const lineForField = (field: string) => FORM_LINES.find((line) => line.field === field);
