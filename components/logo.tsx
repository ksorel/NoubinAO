export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 218 78"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Logo NoubinAO, K-Nowledge"
      className={className}
    >
      <rect x="0" y="2" width="60" height="60" rx="14" fill="#1D4ED8" />
      <g transform="translate(30,32) rotate(-45) translate(-30,-32)">
        <polygon points="30,17 34,32 26,32" fill="#F8FAFC" />
        <polygon points="30,47 34,32 26,32" fill="#F59E0B" />
      </g>
      <circle cx="30" cy="32" r="3" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="1.2" />
      <text
        x="70"
        y="42"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="30"
        fontWeight="400"
        className="fill-slate-900 dark:fill-slate-50"
      >
        Noubin
      </text>
      <text
        x="163"
        y="42"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="30"
        fontWeight="700"
        fill="#1D4ED8"
      >
        AO
      </text>
      <text
        x="139"
        y="58"
        textAnchor="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fontWeight="500"
        letterSpacing="0.5"
        className="fill-slate-500 dark:fill-slate-400"
      >
        K-NOWLEDGE
      </text>
    </svg>
  );
}
