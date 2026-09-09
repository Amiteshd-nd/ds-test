'use client';

/**
 * The review pane: 22 rows, dense, one line each until she opens one.
 *
 * Confidence Without Numbers, in three channels per row and no percentages:
 * the band's *word* ("check this"), the row's weight and ground, and — the one
 * that matters — whether the field can be cleared by the bulk action at the
 * bottom. `needsEyes()` in the reducer owns that last one so it can't drift.
 *
 * Rows are buttons. Selecting one drives the provenance overlay in the other
 * pane; nothing navigates, because the moment verification costs her a context
 * switch she stops doing it.
 */
import { useEffect, useRef } from 'react';
import { copy } from './copy';
import { needsEyes, type DocState, type Field } from '@/lib/surfaces/doc/reducer';
import styles from './doc.module.css';

const FIELD_LABELS: Record<string, string> = {
  applicant_name: 'Applicant name',
  father_name: "Father's name",
  date_of_birth: 'Date of birth',
  address: 'Address',
  pincode: 'PIN code',
  mobile: 'Mobile',
  pan: 'PAN',
  loan_amount: 'Loan amount',
  loan_purpose: 'Purpose',
  tenure_months: 'Tenure',
  monthly_income: 'Monthly income',
  existing_emi: 'Existing EMI',
  debt_to_income: 'Debt to income',
  employer_name: 'Employer',
  employment_type: 'Employment',
  years_in_business: 'Years in business',
  bank_name: 'Bank',
  ifsc: 'IFSC',
  property_type: 'Property type',
  property_value: 'Property value',
  guarantor_name: 'Guarantor',
};

const label = (name: string) => FIELD_LABELS[name] ?? name.replace(/_/g, ' ');

const format = (value: string | number | null) => {
  if (value === null) return '—';
  if (typeof value === 'number') return new Intl.NumberFormat('en-IN').format(value);
  return value;
};

/** The mark in the last column: three states, and none of them a colour alone. */
function reviewMark(field: Field) {
  if (field.review === 'corrected') return '±';
  if (field.review === 'reviewed') return '✓';
  return needsEyes(field) ? '•' : '';
}

function flagNote(field: Field): string | null {
  if (field.conflict && !field.conflict.chosen) return copy.conflict.heading;
  if (field.outOfRange) return copy.range.heading;
  if (field.confusable) return copy.confusable.heading;
  if (field.struckThrough) return copy.struck.heading;
  return null;
}

export function Ledger({
  state,
  selected,
  onSelect,
}: {
  state: DocState;
  selected?: string;
  onSelect: (field: string) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Keep the selected row in view when selection moves from elsewhere (a flag in
  // the gate, say). Never steals focus — it only scrolls.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!state.fields.length) {
    return <p className={styles.empty}>{copy.source.none}</p>;
  }

  return (
    <ol className={styles.ledger}>
      {state.fields.map((field) => {
        const note = flagNote(field);
        const isSelected = field.name === selected;
        return (
          <li key={field.name}>
            <button
              type="button"
              ref={isSelected ? selectedRef : undefined}
              className={styles.row}
              data-selected={String(isSelected)}
              data-band={field.band}
              data-origin={field.origin}
              data-review={field.review}
              onClick={() => onSelect(field.name)}
              aria-expanded={isSelected}
            >
              <span className={styles.rowName}>{label(field.name)}</span>
              <span
                className={styles.rowValue}
                lang={field.lang}
                data-numeric={String(typeof field.value === 'number')}
              >
                {field.conflict && !field.conflict.chosen
                  ? field.conflict.candidates.map((c) => c.value).join('  /  ')
                  : format(field.value)}
              </span>
              {/* The band as words, so the state is in the accessible name too. */}
              <span className={styles.rowBand}>
                {field.origin === 'inferred' ? copy.origin.inferredShort : copy.band[field.band]}
              </span>
              <span className={styles.rowMark} aria-label={copy.field[field.review]}>
                {reviewMark(field)}
              </span>
              {note && (
                <span className={styles.rowNote} data-kind="flag">
                  {note}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export { label as fieldLabel, format as formatValue };
