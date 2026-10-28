import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (children: ReactNode, p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {children}
  </svg>
);

export const IconCalendar = (p: P) => base(<><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>, p);
export const IconPlan = (p: P) => base(<><rect x="3.5" y="4" width="17" height="16.5" rx="3" /><path d="M8 9.5h8M8 14h5" /><path d="m15.5 15.5 1.4 1.4 2.6-2.8" /></>, p);
export const IconTeam = (p: P) => base(<><circle cx="9" cy="8.5" r="3.2" /><path d="M3.2 19c.4-3.2 2.7-5 5.8-5s5.4 1.8 5.8 5" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16.5 14.2c2.4 0 4 1.3 4.4 3.8" /></>, p);
export const IconChart = (p: P) => base(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>, p);
export const IconMore = (p: P) => base(<><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></>, p);
export const IconBell = (p: P) => base(<><path d="M6 17.5V11a6 6 0 1 1 12 0v6.5l1.5 1.5h-15z" /><path d="M10 21.5a2.2 2.2 0 0 0 4 0" /></>, p);
export const IconChevronL = (p: P) => base(<path d="m14.5 5.5-6.5 6.5 6.5 6.5" />, p);
export const IconChevronR = (p: P) => base(<path d="m9.5 5.5 6.5 6.5-6.5 6.5" />, p);
export const IconCheck = (p: P) => base(<path d="m5 12.5 4.5 4.5L19 7.5" />, p);
export const IconX = (p: P) => base(<path d="M6 6l12 12M18 6 6 18" />, p);
export const IconWarn = (p: P) => base(<><path d="M12 3.5 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></>, p);
export const IconInfo = (p: P) => base(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.7v.1" /></>, p);
export const IconPhone = (p: P) => base(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />, p);
export const IconSwap = (p: P) => base(<><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" /></>, p);
export const IconMove = (p: P) => base(<><path d="M5 12h14M13 6l6 6-6 6" /></>, p);
export const IconTrash = (p: P) => base(<><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></>, p);
export const IconUp = (p: P) => base(<path d="m6 14.5 6-6 6 6" />, p);
export const IconDown = (p: P) => base(<path d="m6 9.5 6 6 6-6" />, p);
export const IconPlus = (p: P) => base(<path d="M12 5v14M5 12h14" />, p);
export const IconSettings = (p: P) => base(<><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>, p);
export const IconLogout = (p: P) => base(<><path d="M10 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" /></>, p);
export const IconHistory = (p: P) => base(<><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 4v4.5H8M12 7.5V12l3 2" /></>, p);
export const IconSend = (p: P) => base(<><path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z" /></>, p);
export const IconCamera = (p: P) => base(<><rect x="2.8" y="6.5" width="13" height="11" rx="2.5" /><path d="m15.8 10.5 5.4-3v9l-5.4-3z" /></>, p);
export const IconWand = (p: P) => base(<><path d="m5 19 10-10M14.5 4.5l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM18.5 13.5l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6z" /></>, p);
export const IconLock = (p: P) => base(<><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>, p);
export const IconUser = (p: P) => base(<><circle cx="12" cy="8.5" r="3.6" /><path d="M4.5 20c.6-3.8 3.5-5.8 7.5-5.8s6.9 2 7.5 5.8" /></>, p);
export const IconEmpty = (p: P) => base(<><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M9 15h6" /></>, p);

export const IconSun = (p: P) => base(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" /></>, p);
export const IconMoon = (p: P) => base(<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2z" />, p);
export const IconDownload = (p: P) => base(<><path d="M12 4v11M7.5 10.8 12 15.3l4.5-4.5M4.5 19.5h15" /></>, p);
export const IconUpload = (p: P) => base(<><path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M4.5 19.5h15" /></>, p);
export const IconFilm = (p: P) => base(<><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M8 4.5v15M16 4.5v15M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5" /></>, p);
export const IconPalette = (p: P) => base(<><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2.1-.6-1.1 0-2.4 1.3-2.4H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7 16.7 3.5 12 3.5z" /><circle cx="7.8" cy="11.5" r="1" fill="currentColor" /><circle cx="10.5" cy="7.8" r="1" fill="currentColor" /><circle cx="15" cy="8" r="1" fill="currentColor" /></>, p);
export const IconReport = (p: P) => base(<><path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" /><path d="M14 3.5V8h4M9 13h6M9 16.5h6" /></>, p);
export const IconDatabase = (p: P) => base(<><ellipse cx="12" cy="6" rx="7.5" ry="2.8" /><path d="M4.5 6v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6" /></>, p);
export const IconSearch = (p: P) => base(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>, p);
export const IconImage = (p: P) => base(<><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="m4.5 17.5 4.5-4.5 3.5 3.5 3-3 4 4" /></>, p);
export const IconSmartphone = (p: P) => base(<><rect x="5.5" y="2.5" width="13" height="19" rx="2.8" /><line x1="12" y1="17.5" x2="12.01" y2="17.5" strokeWidth={2.8} /></>, p);
export const IconShare = (p: P) => base(<><path d="M4.5 12v7a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></>, p);
export const IconPlusSquare = (p: P) => base(<><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></>, p);
export const IconApple = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.62-.75 1.04-1.8 1.01-2.84-.96.04-2.13.64-2.79 1.4-.58.67-1.1 1.74-1.01 2.78 1.07.08 2.17-.59 2.79-1.34z" />
  </svg>
);

export const BrandMark = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
    <rect x="3" y="7" width="12" height="10" rx="2.6" stroke="currentColor" strokeWidth="2" />
    <path d="m15 11 6-3.2v8.4L15 13z" fill="currentColor" />
    <circle cx="7.2" cy="12" r="1.5" fill="currentColor" />
  </svg>
);
