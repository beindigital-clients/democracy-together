import { describe, it, expect } from 'vitest';
import {
  checkFileContent,
  extensionOf,
  sanitizeFileName,
  ACCEPTED_EXTENSIONS,
} from '@convex/lib/fileCheck';
import {
  effectiveVisibility,
  effectiveWorkspaceRole,
  isInvitationExpired,
  nextStatus,
  workspaceRoleAtLeast,
} from '@convex/lib/communaute';

// PURE rules of the community workstream: content check of a shared
// file, space roles, moderation state machine. They can be tested
// without a database — that is why they live outside the Convex modules.

const enc = (s: string) => new TextEncoder().encode(s);
const PDF = enc('%PDF-1.4\n...');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const ZIP_DOCX = enc('PK\u0003\u0004....[Content_Types].xml....');
const ODT = enc(
  'PK\u0003\u0004..........mimetypeapplication/vnd.oasis.opendocument.text',
);

describe('Fichiers partagés — le contenu, pas l’étiquette', () => {
  it('accepte chaque format dont les octets portent la signature', () => {
    expect(checkFileContent('a.pdf', PDF)).toEqual({
      ok: true,
      contentType: 'application/pdf',
    });
    expect(checkFileContent('a.PNG', PNG).ok).toBe(true);
    expect(checkFileContent('a.jpeg', JPEG).ok).toBe(true);
    expect(checkFileContent('a.docx', ZIP_DOCX).ok).toBe(true);
    expect(checkFileContent('a.odt', ODT).ok).toBe(true);
    expect(checkFileContent('notes.md', enc('# Titre\nÉté 2026 — ok')).ok).toBe(
      true,
    );
    expect(checkFileContent('data.csv', enc('a;b\n1;2\n')).ok).toBe(true);
  });

  it('refuse une extension hors liste, quel que soit le contenu', () => {
    for (const name of ['virus.exe', 'page.html', 'script.js', 'sans']) {
      expect(checkFileContent(name, PDF)).toEqual({
        ok: false,
        code: 'FILE_TYPE_NOT_ALLOWED',
      });
    }
  });

  it('refuse des octets qui ne correspondent pas à l’extension', () => {
    expect(checkFileContent('image.pdf', PNG)).toEqual({
      ok: false,
      code: 'FILE_CONTENT_MISMATCH',
    });
    // An arbitrary ZIP is not a .docx.
    expect(checkFileContent('a.docx', enc('PK\u0003\u0004 rien')).ok).toBe(
      false,
    );
    // An .odt that does not declare the right OpenDocument type.
    expect(checkFileContent('a.ods', ODT).ok).toBe(false);
    // A binary (null byte, invalid UTF-8) is not text.
    expect(checkFileContent('a.txt', new Uint8Array([0x41, 0, 0x42])).ok).toBe(
      false,
    );
    expect(checkFileContent('a.txt', new Uint8Array([0xc3])).ok).toBe(false);
    expect(checkFileContent('a.txt', new Uint8Array([0xff, 0xfe])).ok).toBe(
      false,
    );
    // Empty file.
    expect(checkFileContent('a.pdf', new Uint8Array()).ok).toBe(false);
  });

  it('nettoie le nom : sans chemin, sans caractère de contrôle, borné', () => {
    expect(sanitizeFileName('../../etc/passwd.txt', 160)).toBe('passwd.txt');
    expect(sanitizeFileName('C:\\docs\\rapport.pdf', 160)).toBe('rapport.pdf');
    expect(sanitizeFileName('a\u0000b\nc.pdf', 160)).toBe('abc.pdf');
    const long = sanitizeFileName(`${'x'.repeat(300)}.pdf`, 20);
    expect(long).toHaveLength(20);
    expect(extensionOf(long)).toBe('pdf');
  });

  it('la liste des extensions acceptées est dérivée des formats', () => {
    expect(ACCEPTED_EXTENSIONS).toEqual(
      expect.arrayContaining(['pdf', 'png', 'docx', 'odt', 'csv']),
    );
    expect(ACCEPTED_EXTENSIONS).not.toContain('exe');
  });
});

describe('Espaces — rôles et visibilité', () => {
  it('les rôles hérités valent animateur et contributeur', () => {
    expect(effectiveWorkspaceRole('owner')).toBe('animateur');
    expect(effectiveWorkspaceRole('member')).toBe('contributeur');
    expect(effectiveWorkspaceRole('lecteur')).toBe('lecteur');
  });

  it('hiérarchie lecteur < contributeur < animateur', () => {
    expect(workspaceRoleAtLeast('lecteur', 'contributeur')).toBe(false);
    expect(workspaceRoleAtLeast('contributeur', 'contributeur')).toBe(true);
    expect(workspaceRoleAtLeast('animateur', 'lecteur')).toBe(true);
    expect(workspaceRoleAtLeast(null, 'lecteur')).toBe(false);
  });

  it('un espace sans visibilité déclarée reste ouvert', () => {
    expect(effectiveVisibility(undefined)).toBe('open');
    expect(effectiveVisibility('private')).toBe('private');
  });

  it('une invitation expire à son échéance, pas avant', () => {
    expect(isInvitationExpired(1000, 999)).toBe(false);
    expect(isInvitationExpired(1000, 1000)).toBe(true);
  });
});

describe('Modération — machine à états', () => {
  it('valider : depuis en attente, et en révision d’un rejet ou d’un retrait', () => {
    expect(nextStatus('pending', 'approve')).toBe('published');
    expect(nextStatus('rejected', 'approve')).toBe('published');
    expect(nextStatus('removed', 'approve')).toBe('published');
    expect(nextStatus('published', 'approve')).toBeNull();
  });

  it('rejeter : seulement ce qui attend ; retirer : seulement ce qui est en ligne', () => {
    expect(nextStatus('pending', 'reject')).toBe('rejected');
    expect(nextStatus('published', 'reject')).toBeNull();
    expect(nextStatus('published', 'remove')).toBe('removed');
    expect(nextStatus('pending', 'remove')).toBeNull();
  });
});
