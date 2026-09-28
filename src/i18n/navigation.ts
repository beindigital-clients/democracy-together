import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Localized wrappers of the Next.js navigation API.
// Locale-aware <Link>, useRouter, usePathname, redirect, getPathname.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
