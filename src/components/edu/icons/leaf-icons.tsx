interface LeafIconProps {
  className?: string;
}

const LEAF_OUTLINE = "M16 4C9 6 5 12 5 18c0 5 4 9 9 9h2c5 0 9-4 9-9 0-6-4-12-9-14Z";

export function LeafStudentsIcon({ className }: LeafIconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d={LEAF_OUTLINE} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12.5" cy="15" r="1.3" fill="currentColor" />
      <circle cx="19.5" cy="15" r="1.3" fill="currentColor" />
      <circle cx="16" cy="20" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function LeafRevenueIcon({ className }: LeafIconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d={LEAF_OUTLINE} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M16 11v10M13 13.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.2-3 2.5c-1.7.3-3 1.1-3 2.5s1.3 2.5 3 2.5 3-1.1 3-2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LeafProfitIcon({ className }: LeafIconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d={LEAF_OUTLINE} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M11 20l3.5-4 2.5 2.5L21 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13h-3.5M21 13v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LeafAttendanceIcon({ className }: LeafIconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d={LEAF_OUTLINE} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M11 17l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LeafLessonsIcon({ className }: LeafIconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d={LEAF_OUTLINE} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M11 13h10M11 17h10M11 21h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function LeafGradeIcon({ className }: LeafIconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d={LEAF_OUTLINE} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M16 10l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LeafDebtorsIcon({ className }: LeafIconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d={LEAF_OUTLINE} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.55" />
      <path d="M16 12v6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="22" r="1.2" fill="currentColor" />
    </svg>
  );
}
