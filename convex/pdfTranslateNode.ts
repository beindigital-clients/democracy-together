'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { locale } from './lib/locales';
import { translatePdf } from './lib/pdfTranslate/index';
import { translateBlocks } from './lib/pdfTranslate/translateBlocks';

// PDF TRANSLATION KEEPING THE DESIGN — the Node entry point.
//
// The engine (convex/lib/pdfTranslate) needs Node: pdf.js to read the text
// with its positions, pdfkit and fontkit to set the translation, Arabic
// included. This file holds only actions, as the Convex guidelines require
// of a "use node" module.
//
// `translateFile` is the prototype's door: a PDF in, its translation out,
// both in base64, nothing stored. It lets a real document go through the
// real model from the command line, before the jobs that will translate
// every attached PDF at publication exist:
//
//   npx convex run pdfTranslateNode:translateFile \
//     '{"pdfBase64":"…","sourceLocale":"fr","targetLocale":"en"}'

export const translateFile = internalAction({
  args: {
    pdfBase64: v.string(),
    sourceLocale: locale,
    targetLocale: locale,
  },
  returns: v.object({
    pdfBase64: v.string(),
    pages: v.number(),
    blocks: v.number(),
    translated: v.number(),
    shrunk: v.number(),
    overflowing: v.number(),
    skippedPages: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    ms: v.number(),
  }),
  handler: async (_ctx, args) => {
    const started = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    const { bytes, stats } = await translatePdf(
      new Uint8Array(Buffer.from(args.pdfBase64, 'base64')),
      {
        targetLocale: args.targetLocale,
        translate: async (texts) => {
          const r = await translateBlocks(
            texts,
            args.sourceLocale,
            args.targetLocale,
          );
          inputTokens += r.inputTokens;
          outputTokens += r.outputTokens;
          return r.translations;
        },
      },
    );
    return {
      pdfBase64: Buffer.from(bytes).toString('base64'),
      ...stats,
      inputTokens,
      outputTokens,
      ms: Date.now() - started,
    };
  },
});
