export function LogoIcon({ className = "w-6 h-6", id = "default" }: { className?: string; id?: string }) {
  const gradId = `logo-grad-${id}`;

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill={`url(#${gradId})`} />
      <path
        d="M9 8h4v10.4L19 8h4v16h-4V13.6L13 24H9V8z"
        fill="white"
      />
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#A855F7" />
          <stop offset="1" stopColor="#FF4CE2" />
        </linearGradient>
      </defs>
    </svg>
  );
}
