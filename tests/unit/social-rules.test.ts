import { describe, it, expect } from 'vitest';
import {
  canViewProfile,
  deriveHandle,
  isIndexable,
  isValidHandle,
  isValidProfileLink,
  messageRefusal,
  sniffImageType,
  type MessageAccessInput,
  type ProfileAccessInput,
} from '@convex/lib/social';

// Règles PURES du réseau social (convex/lib/social.ts), en table de vérité :
// on part du cas qui ouvre, et l'on casse une condition à la fois.

describe('canViewProfile', () => {
  const open: ProfileAccessInput = {
    visibility: 'public',
    isSelf: false,
    ownerIsMember: true,
    viewerIsMember: false,
    blockedByOwner: false,
  };

  it('public : lisible par un anonyme', () => {
    expect(canViewProfile(open)).toBe(true);
  });
  it('membres : lisible par un membre seulement', () => {
    expect(canViewProfile({ ...open, visibility: 'members' })).toBe(false);
    expect(
      canViewProfile({ ...open, visibility: 'members', viewerIsMember: true }),
    ).toBe(true);
  });
  it('privé : personne, sauf soi', () => {
    expect(
      canViewProfile({ ...open, visibility: 'private', viewerIsMember: true }),
    ).toBe(false);
    expect(
      canViewProfile({ ...open, visibility: 'private', isSelf: true }),
    ).toBe(true);
  });
  it('propriétaire hors réseau ou blocage : invisible', () => {
    expect(canViewProfile({ ...open, ownerIsMember: false })).toBe(false);
    expect(canViewProfile({ ...open, blockedByOwner: true })).toBe(false);
  });
  it('seul un profil public de membre est indexable', () => {
    expect(isIndexable({ visibility: 'public', ownerIsMember: true })).toBe(
      true,
    );
    expect(isIndexable({ visibility: 'members', ownerIsMember: true })).toBe(
      false,
    );
    expect(isIndexable({ visibility: 'public', ownerIsMember: false })).toBe(
      false,
    );
  });
});

describe('messageRefusal', () => {
  const ok: MessageAccessInput = {
    isSelf: false,
    senderIsMember: true,
    recipientIsMember: true,
    blockedEitherWay: false,
    recipientPolicy: 'members',
    recipientFollowsSender: false,
    recipientHasWritten: false,
  };
  it('tout membre : ouvert', () => {
    expect(messageRefusal(ok)).toBeNull();
  });
  it('chaque condition fermante, une à la fois', () => {
    expect(messageRefusal({ ...ok, isSelf: true })).toBe('SELF');
    expect(messageRefusal({ ...ok, senderIsMember: false })).toBe('NOT_MEMBER');
    expect(messageRefusal({ ...ok, recipientIsMember: false })).toBe(
      'NOT_MEMBER',
    );
    expect(messageRefusal({ ...ok, blockedEitherWay: true })).toBe('BLOCKED');
    expect(messageRefusal({ ...ok, recipientPolicy: 'nobody' })).toBe('POLICY');
    expect(messageRefusal({ ...ok, recipientPolicy: 'followed' })).toBe(
      'POLICY',
    );
  });
  it('« personnes suivies » s’ouvre quand le destinataire suit l’expéditeur', () => {
    expect(
      messageRefusal({
        ...ok,
        recipientPolicy: 'followed',
        recipientFollowsSender: true,
      }),
    ).toBeNull();
  });
  it('un destinataire qui a déjà écrit ne ferme pas sa propre conversation — mais le blocage l’emporte', () => {
    expect(
      messageRefusal({
        ...ok,
        recipientPolicy: 'nobody',
        recipientHasWritten: true,
      }),
    ).toBeNull();
    expect(
      messageRefusal({
        ...ok,
        recipientHasWritten: true,
        blockedEitherWay: true,
      }),
    ).toBe('BLOCKED');
  });
});

describe('handle', () => {
  it('forme et mots réservés', () => {
    expect(isValidHandle('awa-diallo')).toBe(true);
    expect(isValidHandle('ab')).toBe(false);
    expect(isValidHandle('-awa')).toBe(false);
    expect(isValidHandle('awa--d')).toBe(false);
    expect(isValidHandle('Awa')).toBe(false);
    expect(isValidHandle('admin')).toBe(false);
    expect(isValidHandle('a'.repeat(31))).toBe(false);
  });
  it('dérivé du nom, sans accents, toujours valide', () => {
    expect(deriveHandle('Émilie Ouédraogo')).toBe('emilie-ouedraogo');
    expect(isValidHandle(deriveHandle('محمد'))).toBe(true);
    expect(isValidHandle(deriveHandle('Admin'))).toBe(true);
    expect(isValidHandle(deriveHandle('x'.repeat(80)))).toBe(true);
  });
});

describe('liens de profil', () => {
  it('https absolu seulement', () => {
    expect(isValidProfileLink('https://exemple.org')).toBe(true);
    expect(isValidProfileLink('http://exemple.org')).toBe(false);
    expect(isValidProfileLink('exemple.org')).toBe(false);
    expect(isValidProfileLink('javascript:alert(1)')).toBe(false);
    expect(isValidProfileLink('https://u:p@exemple.org')).toBe(false);
    expect(isValidProfileLink('https://localhost')).toBe(false);
    expect(isValidProfileLink(`https://exemple.org/${'a'.repeat(300)}`)).toBe(
      false,
    );
  });
});

describe('sniffImageType', () => {
  it('reconnaît PNG, JPEG, WebP par leurs octets', () => {
    expect(
      sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])),
    ).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
    expect(
      sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')),
    ).toBe('image/webp');
  });
  it('refuse SVG, HTML, PDF et un fichier vide', () => {
    for (const s of ['<svg ', '<!doctype html>', '%PDF-1.7', '']) {
      expect(sniffImageType(new TextEncoder().encode(s))).toBeNull();
    }
  });
});
