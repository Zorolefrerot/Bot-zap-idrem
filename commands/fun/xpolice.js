'use strict';
/*
 * 🧬 MeR~NeL — commands/fun/xpolice.js
 * Xpolice — change la police d'un texte (20 styles Unicode).
 *   Xpolice italique j'aime mernel → 𝘫'𝘢𝘪𝘮𝘦 𝘮𝘦𝘳𝘯𝘦𝘭
 *   Xpolice (seul) → la liste des 20 polices
 */

const { listStyles, hasStyle, transform } = require('../../utils/fontMap');

module.exports = {
  name: 'xpolice',
  description: 'Change la police d’un texte (20 styles) — Xpolice italique ton texte',
  usage: 'Xpolice <style> <texte> · Xpolice (liste)',
  category: 'fun',
  aliases: ['xfont', 'xstyle'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    if (ctx.args.length === 0) {
      const lines = ['🔤 ' + ctx.fmt.bold('LES 20 POLICES DE MeR~NeL'), ''];
      for (const { id, preview } of listStyles()) {
        lines.push(`▸ ${ctx.fmt.bold(id)} → ${preview}`);
      }
      lines.push('', '📌 ' + ctx.fmt.bold('Exemple') + ' : ' + ctx.fmt.bold('Xpolice italique j’aime MeR~NeL'));
      return ctx.send(ctx.fmt.frame('🔤 XPOLICE — STYLES', lines));
    }

    const styleId = ctx.args[0];
    const text = ctx.args.slice(1).join(' ').trim();
    if (!text) {
      return ctx.send(
        ctx.fmt.frame('🔤 XPOLICE', '⚠️ ' + ctx.fmt.bold('Ajoute ton texte.') + '\n📌 ' + ctx.fmt.bold('Exemple') + ' : Xpolice gras MeR~NeL')
      );
    }
    if (!hasStyle(styleId)) {
      const ids = listStyles().map((s) => s.id);
      return ctx.send(
        ctx.fmt.frame('🔤 XPOLICE', [
          '⚠️ ' + ctx.fmt.bold(`Police « ${styleId} » inconnue.`),
          '📌 ' + ctx.fmt.bold('Styles') + ' : ' + ctx.fmt.bold(ids.join(' · ')),
        ])
      );
    }
    const out = transform(text, styleId);
    if (!out || !out.trim()) {
      return ctx.send(ctx.fmt.frame('🔤 XPOLICE', '⚠️ ' + ctx.fmt.bold('Texte vide après transformation.')));
    }
    await ctx.send(out);
  },
};
