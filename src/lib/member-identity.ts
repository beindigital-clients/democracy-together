// The name to greet a signed-in person by, and to show beside their photo.
//
// Two sources, in this order: the display name of their network profile (the
// one they chose to show), then the name carried by the account. The e-mail
// address is NOT a name: "Bienvenue, jean.dupont@example.org" is what the old
// member area printed, and it read as a machine talking. Where a label is
// needed anyway (the side column), the caller falls back to the address
// itself — never to a piece of it.
//
// The name is used WHOLE. Cutting it down to a "first name" guesses at a
// naming order that varies across the network's languages and cultures, and
// guesses wrong on an organisation-style display name.
export function memberName(input: {
  profileExists: boolean;
  profileName: string | null | undefined;
  accountName: string | null | undefined;
}): string | null {
  const fromProfile = input.profileExists ? input.profileName?.trim() : '';
  if (fromProfile) return fromProfile;
  const fromAccount = input.accountName?.trim();
  return fromAccount || null;
}
