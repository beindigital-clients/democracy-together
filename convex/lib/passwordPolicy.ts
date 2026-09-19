import { ConvexError } from 'convex/values';

// Politique de mot de passe (sécurité — constat M4). Valeurs CHOISIES, pas
// subies : sans ces options, Convex Auth applique ses propres défauts
// (8 caractères, 10 échecs par heure), qui ne sont écrits nulle part et donc
// jamais relus.
//
// Profil de menace particulier ici : il n'y a PAS d'auto-inscription. Un compte
// naît d'une validation d'adhésion ou d'une invitation d'administrateur — ce
// sont donc tous des comptes de valeur (représentants d'organisations membres,
// secrétariat, modération), sans population de comptes jetables pour diluer une
// attaque. S'y ajoute l'absence de second facteur : pour un compte qui en a un,
// le mot de passe est le seul rempart.
//
// LIMITE : une vraie vérification « ce mot de passe a déjà fuité » demanderait
// un jeu de données volumineux ou un appel réseau à chaque saisie. Hors sujet
// ici ; ce qui suit est un plancher, pas un audit de robustesse.

// 12 caractères plutôt qu'une exigence de composition (majuscule + chiffre +
// symbole) : à gêne égale pour l'utilisateur, la longueur coûte bien plus cher
// à l'attaquant, alors que les règles de composition produisent surtout des
// substitutions prévisibles (« Motdepasse1! ») et des mots de passe notés sur
// un papier. Partagée avec l'interface (attribut `minLength` des formulaires)
// pour que le navigateur refuse ce que le serveur refuserait.
export const PASSWORD_MIN_LENGTH = 12;

// Plafond d'échecs de connexion par heure — `maxFailedAttempsPerHour` de Convex
// Auth (défaut de la bibliothèque : 10). 5, parce que ce n'est pas un
// verrouillage : le crédit se reconstitue en continu, soit un essai de plus
// toutes les 12 minutes. Les deux chemins de connexion ont des compteurs
// SÉPARÉS — mot de passe (clé : le compte) et code à usage unique (clé :
// l'e-mail) : quelqu'un qui épuise son crédit en tapant un mauvais mot de passe
// garde la connexion par code, il n'est pas enfermé dehors. Côté code à six
// chiffres, 5 essais par heure rendent le tirage au hasard inutile.
export const MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR = 5;

// Les mots de passe les plus courants, minusculés. Liste volontairement courte
// et centrée sur ceux qui SURVIVRAIENT au plancher de longueur : les classiques
// courts (« azerty », « 123456 ») sont déjà refusés par PASSWORD_MIN_LENGTH ;
// ils figurent quand même ici pour que la liste reste vraie si le plancher
// bouge. Les dernières entrées sont les évidences propres à ce projet — le
// premier mot de passe qu'on tente contre un compte connu est le nom du site.
const COMMON_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  '123456789012',
  '1234567890123',
  'azerty',
  'azertyuiop',
  'azertyuiop123',
  'qwerty',
  'qwertyuiop',
  'qwertyuiop123',
  'abcd1234',
  'abcdefghijkl',
  'abcdefghijklm',
  'motdepasse',
  'motdepasse1',
  'motdepasse123',
  'monmotdepasse',
  'password',
  'password1',
  'password123',
  'password1234',
  'passw0rd',
  'p@ssw0rd123',
  'administrateur',
  'administrator',
  'adminadmin123',
  'welcome123',
  'bienvenue123',
  'letmein123',
  'iloveyou123',
  'trustno1234',
  'changeme123',
  'democracy',
  'democracy123',
  'democracytogether',
  'democracytogether1',
  'democracy-together',
]);

// Un seul caractère répété franchit le plancher de longueur sans rien valoir
// (« aaaaaaaaaaaa ») : c'est l'échappatoire la plus immédiate face à une règle
// qui ne parle que de longueur, donc celle qu'il faut fermer avec elle.
const SINGLE_REPEATED_CHARACTER = /^(.)\1*$/;

// Quelle règle casse, sans lever — forme dont l'INTERFACE a besoin.
//
// Le formulaire ne peut pas apprendre le motif du refus par l'erreur serveur :
// l'application passe par `ConvexAuthNextjsProvider`, donc par la route
// /api/auth, et `@convex-dev/auth` y convertit un ConvexError en
// `new Response(null, { status, statusText: error.data })`. Le corps est nul,
// `data` est aplati en texte de statut, et le navigateur ne reçoit plus qu'une
// erreur ordinaire. Le formulaire applique donc la même règle avant d'appeler
// le serveur — exactement ce que `minLength` fait déjà pour la longueur.
//
// Ce n'est PAS une validation côté client au sens faible : le serveur refuse
// toujours, par `validatePasswordRequirements` ci-dessous. Le client ne fait
// que dire POURQUOI, là où le réseau ne le laisse plus passer.
export type PasswordRefusal = 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_COMMON';

export function passwordRefusal(password: string): PasswordRefusal | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return 'PASSWORD_TOO_SHORT';
  }
  if (
    COMMON_PASSWORDS.has(password.toLowerCase()) ||
    SINGLE_REPEATED_CHARACTER.test(password)
  ) {
    // Comparaison EXACTE, jamais « contient » : refuser
    // « motdepasse-de-mon-chat-2019 » au motif qu'on y lit « motdepasse »
    // serait hostile pour un mot de passe pourtant solide.
    return 'PASSWORD_TOO_COMMON';
  }
  return null;
}

// Appelée par le provider Password sur les flux « signUp » et
// « reset-verification » (option `validatePasswordRequirements`) — donc partout
// où un mot de passe est POSÉ, jamais à la connexion : un mot de passe existant
// devenu non conforme n'enferme personne dehors, il se corrige au prochain
// changement.
//
// C'est ici que la politique est APPLIQUÉE. Le contrôle du formulaire ne fait
// que doubler celui-ci pour le message ; le retirer n'ouvrirait rien.
export function validatePasswordRequirements(password: string): void {
  const refus = passwordRefusal(password);
  if (refus) throw new ConvexError(refus);
}
