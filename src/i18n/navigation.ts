import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Wrappers localisés de l'API de navigation Next.js.
// <Link>, useRouter, usePathname, redirect, getPathname conscients de la locale.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
