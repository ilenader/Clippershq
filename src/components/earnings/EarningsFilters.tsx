"use client";

import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { EARNINGS_FILTER_OPTIONS, type EarningsFilterKey } from "@/lib/earnings";

interface EarningsFiltersProps {
  values: EarningsFilterKey[];
  onChange: (values: EarningsFilterKey[]) => void;
}

export function EarningsFilters({ values, onChange }: EarningsFiltersProps) {
  return (
    <MultiDropdown
      label="Filter"
      options={EARNINGS_FILTER_OPTIONS}
      values={values as string[]}
      onChange={(v) => onChange(v as EarningsFilterKey[])}
      allLabel="All earnings"
    />
  );
}
