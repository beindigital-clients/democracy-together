// Contenu légal (F-09 RGPD) — mentions légales, politique de confidentialité,
// déclaration d'accessibilité. Bilingue FR/EN. Rédigé à partir des faits connus
// (association loi 1901, agence Be in Digital, sous-traitants techniques) ; les
// éléments juridiques non confirmés sont explicitement marqués « [à compléter :
// … ] » (jamais inventés) — à renseigner avant mise en ligne / passage juridique.
//
// IMPORTANT : ne contient aucune fabrication d'identifiants (SIRET/RNA), de noms
// de responsables ou d'adresses ; ces champs portent un marqueur à compléter.

export type LegalSection = { heading: string; body: string[] };

export type LegalDoc = {
  eyebrow: string;
  title: string;
  updatedLabel: string;
  updated: string;
  intro: string;
  homeLabel: string;
  sections: LegalSection[];
};

export type LegalKind = 'mentions' | 'confidentialite' | 'accessibilite';

const TODO_FR = '[à compléter avant mise en ligne]';
const TODO_EN = '[to be completed before launch]';

const CONTENT: Record<LegalKind, Record<'fr' | 'en', LegalDoc>> = {
  mentions: {
    fr: {
      eyebrow: 'Informations légales',
      title: 'Mentions légales',
      updatedLabel: 'Dernière mise à jour',
      updated: '27 juin 2026',
      homeLabel: 'Accueil',
      intro:
        'Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique, voici les informations relatives à l’éditeur et à l’hébergement du présent site.',
      sections: [
        {
          heading: 'Éditeur du site',
          body: [
            `Le site est édité par Democracy Together, association régie par la loi du 1ᵉʳ juillet 1901, dont le siège social est situé à Paris ${TODO_FR} (adresse postale complète).`,
            `Numéro RNA (Répertoire National des Associations) : ${TODO_FR}.`,
            'Contact : via le formulaire de la page Contact du site.',
          ],
        },
        {
          heading: 'Directeur de la publication',
          body: [
            `Le directeur ou la directrice de la publication est le représentant légal de l’association : ${TODO_FR} (nom et qualité).`,
          ],
        },
        {
          heading: 'Conception et réalisation',
          body: ['Conception, design et développement : Be in Digital.'],
        },
        {
          heading: 'Hébergement et infrastructure',
          body: [
            'La plateforme s’appuie sur les prestataires techniques suivants :',
            'Vercel Inc. — hébergement et diffusion de l’application web.',
            'Convex, Inc. — backend applicatif (comptes, annuaire, publications) et stockage des fichiers.',
            'Sanity AS — système de gestion des contenus éditoriaux (espace de rédaction).',
            `Les coordonnées légales complètes et les régions d’hébergement des données de ces prestataires sont précisées dans la politique de confidentialité ${TODO_FR} (régions UE à confirmer).`,
          ],
        },
        {
          heading: 'Propriété intellectuelle',
          body: [
            'Sauf mention contraire, les contenus éditoriaux du site (textes, identité visuelle, éléments graphiques) sont la propriété de Democracy Together ou de ses partenaires, et protégés par le droit de la propriété intellectuelle.',
            'Les publications déposées par les membres restent la propriété de leurs auteurs ; elles sont diffusées selon la licence indiquée sur chaque fiche de publication.',
          ],
        },
        {
          heading: 'Liens hypertextes',
          body: [
            'Le site peut contenir des liens vers des sites tiers. Democracy Together n’exerce aucun contrôle sur ces ressources externes et décline toute responsabilité quant à leur contenu.',
          ],
        },
        {
          heading: 'Données personnelles',
          body: [
            'Le traitement des données à caractère personnel est détaillé dans la politique de confidentialité, accessible depuis le pied de page du site.',
          ],
        },
      ],
    },
    en: {
      eyebrow: 'Legal information',
      title: 'Legal notice',
      updatedLabel: 'Last updated',
      updated: 'June 27, 2026',
      homeLabel: 'Home',
      intro:
        'In accordance with French Act No. 2004-575 of 21 June 2004 on confidence in the digital economy, the following information identifies the site’s publisher and host.',
      sections: [
        {
          heading: 'Site publisher',
          body: [
            `The site is published by Democracy Together, a non-profit association governed by the French Act of 1 July 1901, with its registered office in Paris ${TODO_EN} (full postal address).`,
            `Association registration number (RNA): ${TODO_EN}.`,
            'Contact: via the Contact page form on this site.',
          ],
        },
        {
          heading: 'Publication director',
          body: [
            `The publication director is the association’s legal representative: ${TODO_EN} (name and capacity).`,
          ],
        },
        {
          heading: 'Design and development',
          body: ['Design and development: Be in Digital.'],
        },
        {
          heading: 'Hosting and infrastructure',
          body: [
            'The platform relies on the following technical providers:',
            'Vercel Inc. — hosting and delivery of the web application.',
            'Convex, Inc. — application backend (accounts, directory, publications) and file storage.',
            'Sanity AS — editorial content management system.',
            `The full legal details and data-hosting regions of these providers are set out in the privacy policy ${TODO_EN} (EU regions to be confirmed).`,
          ],
        },
        {
          heading: 'Intellectual property',
          body: [
            'Unless stated otherwise, the site’s editorial content (text, visual identity, graphic elements) belongs to Democracy Together or its partners and is protected by intellectual-property law.',
            'Publications deposited by members remain the property of their authors and are distributed under the licence indicated on each publication page.',
          ],
        },
        {
          heading: 'Hyperlinks',
          body: [
            'The site may contain links to third-party sites. Democracy Together has no control over these external resources and accepts no liability for their content.',
          ],
        },
        {
          heading: 'Personal data',
          body: [
            'The processing of personal data is detailed in the privacy policy, accessible from the site footer.',
          ],
        },
      ],
    },
  },

  confidentialite: {
    fr: {
      eyebrow: 'Protection des données',
      title: 'Politique de confidentialité',
      updatedLabel: 'Dernière mise à jour',
      updated: '27 juin 2026',
      homeLabel: 'Accueil',
      intro:
        'Democracy Together accorde une grande importance à la protection de vos données personnelles. Cette politique explique quelles données nous traitons, pourquoi, et quels sont vos droits au titre du Règlement général sur la protection des données (RGPD).',
      sections: [
        {
          heading: 'Responsable du traitement',
          body: [
            'Le responsable du traitement est l’association Democracy Together (voir les Mentions légales).',
            `Délégué à la protection des données / référent RGPD : ${TODO_FR} (adresse de contact dédiée).`,
          ],
        },
        {
          heading: 'Données que nous traitons',
          body: [
            'Compte et profil : adresse e-mail, nom, rôle dans le réseau, langue préférée.',
            'Adhésion : informations transmises via le formulaire de candidature (organisation ou personne, pays, message).',
            'Contributions : publications déposées et fichiers associés, ainsi que leur statut de modération.',
            'Contact : contenu des messages envoyés via le formulaire de contact.',
            'Données techniques : journaux d’audit des actions sensibles (sécurité) et données strictement nécessaires au fonctionnement (session d’authentification).',
          ],
        },
        {
          heading: 'Finalités et bases légales',
          body: [
            'Gestion des comptes et des adhésions — exécution de la relation associative et, le cas échéant, consentement.',
            'Publication et modération des contributions — intérêt légitime du réseau à diffuser des travaux vérifiés.',
            'Sécurité, prévention des abus et journalisation — intérêt légitime et respect des obligations légales.',
            'Réponses aux demandes de contact — intérêt légitime à répondre aux sollicitations.',
          ],
        },
        {
          heading: 'Destinataires et sous-traitants',
          body: [
            'Vos données ne sont jamais vendues. Elles sont accessibles à l’équipe habilitée de Democracy Together et à nos sous-traitants techniques, liés par contrat :',
            'Vercel (hébergement), Convex (backend et stockage), Sanity (contenus éditoriaux), Resend (envoi d’e-mails transactionnels), Zoho (messagerie du domaine).',
          ],
        },
        {
          heading: 'Transferts hors Union européenne',
          body: [
            `Certains prestataires sont susceptibles d’héberger ou de traiter des données en dehors de l’Union européenne. Les garanties appropriées (clauses contractuelles types, régions UE lorsque disponibles) sont en cours de mise en conformité : ${TODO_FR} (régions et garanties à confirmer).`,
          ],
        },
        {
          heading: 'Durées de conservation',
          body: [
            `Compte : conservé tant que le compte est actif, puis supprimé ou anonymisé ${TODO_FR} (délai à valider) après la dernière activité.`,
            `Candidatures et messages de contact : ${TODO_FR} (durée à valider).`,
            'Publications publiées : conservées tant qu’elles sont en ligne dans la bibliothèque.',
            `Journaux d’audit : ${TODO_FR} (durée à valider, finalité sécurité).`,
          ],
        },
        {
          heading: 'Cookies et traceurs',
          body: [
            'Le site utilise uniquement des cookies et stockages strictement nécessaires : préférence de langue, préférence de thème et session d’authentification. Ils sont exemptés de consentement car indispensables au service.',
            'Aucun traceur publicitaire ni outil de mesure d’audience tiers n’est actuellement déposé. Si une mesure d’audience est ajoutée à l’avenir, votre consentement préalable sera recueilli.',
          ],
        },
        {
          heading: 'Vos droits',
          body: [
            'Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité de vos données.',
            'Pour exercer ces droits, contactez-nous via le formulaire de contact ou à l’adresse du référent RGPD indiquée ci-dessus.',
            'Vous pouvez également introduire une réclamation auprès de la Commission nationale de l’informatique et des libertés (CNIL), www.cnil.fr.',
          ],
        },
      ],
    },
    en: {
      eyebrow: 'Data protection',
      title: 'Privacy policy',
      updatedLabel: 'Last updated',
      updated: 'June 27, 2026',
      homeLabel: 'Home',
      intro:
        'Democracy Together takes the protection of your personal data seriously. This policy explains what data we process, why, and what your rights are under the General Data Protection Regulation (GDPR).',
      sections: [
        {
          heading: 'Data controller',
          body: [
            'The data controller is the Democracy Together association (see the Legal notice).',
            `Data protection officer / GDPR contact: ${TODO_EN} (dedicated contact address).`,
          ],
        },
        {
          heading: 'Data we process',
          body: [
            'Account and profile: email address, name, network role, preferred language.',
            'Membership: information submitted via the application form (organisation or individual, country, message).',
            'Contributions: deposited publications and associated files, along with their moderation status.',
            'Contact: the content of messages sent via the contact form.',
            'Technical data: audit logs of sensitive actions (security) and data strictly necessary for operation (authentication session).',
          ],
        },
        {
          heading: 'Purposes and legal bases',
          body: [
            'Managing accounts and memberships — performance of the association relationship and, where applicable, consent.',
            'Publishing and moderating contributions — the network’s legitimate interest in disseminating vetted work.',
            'Security, abuse prevention and logging — legitimate interest and compliance with legal obligations.',
            'Responding to contact requests — legitimate interest in answering enquiries.',
          ],
        },
        {
          heading: 'Recipients and processors',
          body: [
            'Your data is never sold. It is accessible to authorised Democracy Together staff and to our contractually bound technical processors:',
            'Vercel (hosting), Convex (backend and storage), Sanity (editorial content), Resend (transactional email), Zoho (domain mailboxes).',
          ],
        },
        {
          heading: 'Transfers outside the European Union',
          body: [
            `Some providers may host or process data outside the European Union. Appropriate safeguards (standard contractual clauses, EU regions where available) are being brought into compliance: ${TODO_EN} (regions and safeguards to be confirmed).`,
          ],
        },
        {
          heading: 'Retention periods',
          body: [
            `Account: kept while the account is active, then deleted or anonymised ${TODO_EN} (period to be confirmed) after the last activity.`,
            `Applications and contact messages: ${TODO_EN} (period to be confirmed).`,
            'Published publications: kept while they remain online in the library.',
            `Audit logs: ${TODO_EN} (period to be confirmed, security purpose).`,
          ],
        },
        {
          heading: 'Cookies and trackers',
          body: [
            'The site uses only strictly necessary cookies and storage: language preference, theme preference and authentication session. These are exempt from consent as they are essential to the service.',
            'No advertising trackers or third-party analytics are currently set. If audience measurement is added in the future, your prior consent will be collected.',
          ],
        },
        {
          heading: 'Your rights',
          body: [
            'You have the right to access, rectify, erase, restrict, object to and port your data.',
            'To exercise these rights, contact us via the contact form or at the GDPR contact address above.',
            'You may also lodge a complaint with the French data protection authority (CNIL), www.cnil.fr.',
          ],
        },
      ],
    },
  },

  accessibilite: {
    fr: {
      eyebrow: 'Accessibilité',
      title: 'Déclaration d’accessibilité',
      updatedLabel: 'Dernière mise à jour',
      updated: '27 juin 2026',
      homeLabel: 'Accueil',
      intro:
        'Democracy Together s’engage à rendre son site accessible au plus grand nombre, conformément à l’article 47 de la loi n° 2005-102 du 11 février 2005 et au Référentiel général d’amélioration de l’accessibilité (RGAA).',
      sections: [
        {
          heading: 'État de conformité',
          body: [
            `Un audit RGAA complet n’a pas encore été réalisé. À ce stade, le niveau de conformité ne peut être déclaré : ${TODO_FR} (audit RGAA à mener, puis indiquer « conforme », « partiellement conforme » ou « non conforme »).`,
            'Le site a néanmoins été conçu en intégrant de bonnes pratiques d’accessibilité : structure sémantique, navigation au clavier, respect du contraste, libellés de formulaires associés, respect de la préférence « mouvement réduit » et alternatives textuelles.',
          ],
        },
        {
          heading: 'Contenus non accessibles',
          body: [
            `La liste des contenus non conformes et des dérogations éventuelles sera publiée à l’issue de l’audit : ${TODO_FR}.`,
          ],
        },
        {
          heading: 'Établissement de cette déclaration',
          body: [
            'Cette déclaration a été établie le 27 juin 2026. Elle sera mise à jour après la réalisation de l’audit de conformité.',
          ],
        },
        {
          heading: 'Retour d’information et contact',
          body: [
            'Si vous rencontrez un défaut d’accessibilité vous empêchant d’accéder à un contenu, contactez-nous via le formulaire de contact afin que nous puissions vous orienter vers une alternative et corriger le problème.',
          ],
        },
        {
          heading: 'Voies de recours',
          body: [
            'Si vous constatez un défaut d’accessibilité et que, après nous avoir signalé le problème, vous n’obtenez pas de réponse satisfaisante, vous pouvez adresser une réclamation ou une demande de saisine au Défenseur des droits (www.defenseurdesdroits.fr).',
          ],
        },
      ],
    },
    en: {
      eyebrow: 'Accessibility',
      title: 'Accessibility statement',
      updatedLabel: 'Last updated',
      updated: 'June 27, 2026',
      homeLabel: 'Home',
      intro:
        'Democracy Together is committed to making its website accessible to as many people as possible, in line with French accessibility law (Article 47 of Act No. 2005-102) and the RGAA accessibility framework.',
      sections: [
        {
          heading: 'Compliance status',
          body: [
            `A full RGAA audit has not yet been carried out. At this stage, the level of compliance cannot be declared: ${TODO_EN} (RGAA audit to be conducted, then state “compliant”, “partially compliant” or “non-compliant”).`,
            'The site was nonetheless built with accessibility good practices: semantic structure, keyboard navigation, colour contrast, associated form labels, respect for the “reduced motion” preference and text alternatives.',
          ],
        },
        {
          heading: 'Non-accessible content',
          body: [
            `The list of non-compliant content and any exemptions will be published once the audit is complete: ${TODO_EN}.`,
          ],
        },
        {
          heading: 'Preparation of this statement',
          body: [
            'This statement was prepared on 27 June 2026. It will be updated once the compliance audit has been carried out.',
          ],
        },
        {
          heading: 'Feedback and contact',
          body: [
            'If you encounter an accessibility barrier that prevents you from accessing content, contact us via the contact form so we can point you to an alternative and fix the issue.',
          ],
        },
        {
          heading: 'Remedies',
          body: [
            'If you report an accessibility problem and do not receive a satisfactory response, you may refer the matter to the French Defender of Rights (www.defenseurdesdroits.fr).',
          ],
        },
      ],
    },
  },
};

export function getLegalContent(kind: LegalKind, locale: string): LegalDoc {
  const lang = locale === 'en' ? 'en' : 'fr';
  return CONTENT[kind][lang];
}
