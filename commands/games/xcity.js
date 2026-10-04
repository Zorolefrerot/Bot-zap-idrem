'use strict';
/*
 * 🧬 MeR~NeL — commands/games/xcity.js
 * Xcity 🏙️ — City-Builder JvJ : ta ville, ton territoire, ton armée, tes traités.
 *   Xcity create <nom>            → fonder (or interne, PAS des XCoins)
 *   Xcity status                  → ta fiche complète
 *   Xcity build <type>            → construire (house, farm, mine, factory…)
 *   Xcity collect                 → lever les impôts (1 min) + événements 10 %
 *   Xcity upgrade                 → niveau supérieur (pop + or + bâtiments)
 *   Xcity expand                  → +1 km² (touristes → plus d'or)
 *   Xcity train <soldat|archer|cavalier> · Xcity officer <capitaine|general>
 *   Xcity decree <conscription|festival|tax|none>
 *   Xcity send <ville> money <somme> | send <ville> <res> <qté>
 *   Xcity market · buy <res> <qté> · sell <res> <qté>
 *   Xcity attack <ville>          → pillage 15 % … TRAHISON d'un traité = 80 % !
 *   Xcity treaty propose <ville> <peace|alliance|trade> · accept <ville> · break <ville>
 *   Xcity barbarians · raid <n°>  → camps barbares PvE
 *   Xcity top <or|pop|armee|rep> · news · notif · profile <ville> · delete confirm
 */

const { CityGame, BUILD_COST, UNITS, OFFICERS, DECREES, RES, RES_LABEL, TREATY_TYPES } = require('../../systems/city');

const SHORT = Number.isInteger;

function nfc(n) { return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

module.exports = {
  name: 'xcity',
  description: 'City-Builder JvJ 🏙️ — ville, territoire (km²), armée, traités, trahisons à 80 %',
  usage: 'Xcity <create|status|build|collect|upgrade|expand|train|officer|decree|send|market|buy|sell|attack|treaty|barbarians|raid|top|news|notif|profile|delete>',
  category: 'games',
  aliases: ['xville', 'city'],
  adminOnly: false,
  cooldownMs: 3000,
  run: async (ctx) => {
    const game = new CityGame(ctx.db.cities);
    const sub = String(ctx.args[0] || '').toLowerCase();
    const a = ctx.args.slice(1);
    const uid = ctx.senderID;
    const bad = (err) => ctx.send(`⚠️ ${err}`);
    const dmHints = async (res) => {
      for (const dm of res && res.dm || []) {
        try { await ctx.bot.send({ body: dm.txt }, dm.to); } catch (_) { /* PV indisponible : notif interne seulement */ }
      }
    };

    /* ── CREATE ── */
    if (sub === 'create') {
      const name = a.join(' ').trim();
      if (!name) return bad('Donne un nom : Xcity create Nouvelle-Racine');
      const res = game.create(uid, name, ctx.senderName);
      if (!res.ok) return bad(res.err);
      await dmHints(res);
      return ctx.send(ctx.fmt.frame('🏙️ VILLE FONDÉE', [
        `${ctx.fmt.bold(res.city.name)} — maire ${ctx.fmt.bold(res.city.mayor)}`,
        `💰 ${nfc(res.city.gold)}$ (or interne) · 👥 50 · 📐 1 km² · 😊 50/100`,
        `📦 Spécialités : ${res.city.produce.map((r) => RES_LABEL[r]).join(' · ')}`,
        '🧭 Débute : Xcity status · Xcity collect · Xcity build house',
      ]));
    }

    /* ── DELETE ── */
    if (sub === 'delete') {
      if (String(a[0] || '').toLowerCase() !== 'confirm') {
        return ctx.send(ctx.fmt.frame('🏚️ RASER LA VILLE', [
          '⚠️ Ton or, ton armée et tes traités seront PERDUS.',
          `📌 ${ctx.fmt.bold('Confirme')} : ${ctx.fmt.bold('Xcity delete confirm')}`,
        ]));
      }
      const res = game.remove(uid);
      if (!res.ok) return bad(res.err);
      return ctx.send('🏚️ Ta ville a été rasée. Tu peux en fonder une nouvelle : Xcity create <nom>');
    }

    /* ── STATUS ── */
    if (sub === 'status') {
      const s = game.status(uid);
      if (!s) return bad('Tu n’as pas de ville — Xcity create <nom>');
      const L = s.lines;
      return ctx.send(ctx.fmt.frame(`🏙️ ${s.city.name.toUpperCase()} — 𝗟𝘃𝗹 ${s.city.lvl}`, [
        L.main, L.land, L.buildings, L.ress, L.army, L.decree, L.treaties, L.rep,
      ]));
    }

    /* ── PROFILE ── */
    if (sub === 'profile') {
      const p = game.profile(a.join(' '));
      if (!p) return bad('Ville introuvable — Xcity top pour la liste.');
      return ctx.send(ctx.fmt.frame(`🏛️ ${p.name.toUpperCase()}`, [
        `👑 ${p.mayor} — 𝗟𝘃𝗹 ${p.lvl} · ⭐ ${p.rep} (${p.title})`,
        `👥 ${nfc(p.pop)} hab. · 📐 ${p.km2} km² · 😊 ${p.moral}/100 · 💰 ${nfc(p.gold)}$`,
        `🏗️ ${p.buildings || '—'}`,
        `⚔️ Armée : ${p.army} — ✅${p.wins} ❌${p.losses}`,
      ]));
    }

    /* ── BUILD ── */
    if (sub === 'build') {
      const res = game.build(uid, String(a[0] || '').toLowerCase());
      if (!res.ok) return bad(res.err);
      const label = BUILD_LABEL[res.type] || res.type;
      return ctx.send(ctx.fmt.frame('🏗️ CONSTRUCTION', [
        `${label} n°${res.count} édifié${res.type === 'house' ? ` — 👥 population ${res.pop}` : ''}`,
        `💰 Trésor : ${nfc(res.gold)}$`,
      ]));
    }

    /* ── COLLECT ── */
    if (sub === 'collect') {
      const res = game.collect(uid);
      if (!res.ok) return bad(res.err);
      const lines = [
        `💰 +${nfc(res.income)}$ (impôts) + 🧳 ${nfc(res.tourists)} touristes → +${nfc(res.tourism)}$`,
        `📦 Production : ${Object.entries(res.produced).map(([r, q]) => `${RES_LABEL[r]} +${q}`).join(' · ')}`,
      ];
      if (res.decreeNote) lines.push(res.decreeNote);
      if (res.exodus) lines.push(`🏚️ Moral bas : ${res.exodus} habitants fuient la ville…`);
      if (res.event) lines.push(`🎲 ${res.event}`);
      lines.push(`💰 Trésor : ${nfc(res.gold)}$ · 😊 moral ${res.moral}/100`);
      return ctx.send(ctx.fmt.frame('🧾 COLLECTE', lines));
    }

    /* ── UPGRADE ── */
    if (sub === 'upgrade') {
      const res = game.upgrade(uid);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🏛️ NIVEAU SUPÉRIEUR', [
        `${ctx.fmt.bold(`𝗟𝘃𝗹 ${res.lvl}`)} atteint ! (−${nfc(res.cost)}$)`,
        '🎁 De nouveaux bâtiments, unités et officiers se débloquent.',
      ]));
    }

    /* ── EXPAND (km²) ── */
    if (sub === 'expand') {
      const res = game.expand(uid);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('📐 ANNEXION', [
        `Territoire : ${ctx.fmt.bold(`${res.km2} km²`)} (−${nfc(res.cost)}$) · 👥 +2`,
        `🧳 Désormais ≈ ${res.tourists} touristes/collect → +${nfc(res.tourists * 2)}$`,
      ]));
    }

    /* ── TRAIN / OFFICER ── */
    if (sub === 'train') {
      const res = game.train(uid, String(a[0] || '').toLowerCase());
      if (!res.ok) return bad(res.err);
      const u = UNITS[res.unit];
      return ctx.send(ctx.fmt.frame('🪖 RECRUTEMENT', [
        `${u.label} enrôlé — ${res.total}/${res.capacity} dans les casernes`,
        `💰 −${nfc(res.cost)}$ → trésor ${nfc(res.gold)}$`,
      ]));
    }
    if (sub === 'officer') {
      const res = game.buyOfficer(uid, String(a[0] || '').toLowerCase());
      if (!res.ok) return bad(res.err);
      const o = OFFICERS[res.officer];
      return ctx.send(ctx.fmt.frame('🎖️ OFFICER RECRUTÉ', [
        `${o.label} entre au service de la ville — ${o.txt}`,
        `💰 −${nfc(res.cost)}$ → trésor ${nfc(res.gold)}$`,
      ]));
    }

    /* ── ARMY ── */
    if (sub === 'army') {
      const s = game.status(uid);
      if (!s) return bad('Tu n’as pas de ville — Xcity create <nom>');
      const c = s.city;
      return ctx.send(ctx.fmt.frame('🪖 ARMÉE', [
        `🪖 ${c.units.soldier} soldats · 🏹 ${c.units.archer} archers · 🐎 ${c.units.cavalry} cavaliers`,
        `⚔️ Puissance attaque ${Math.round(game.power(c, 'att') * 10) / 10} · 🛡️ défense ${Math.round(game.power(c, 'def') * 10) / 10}`,
        `🎖️ ${s.city.officers.captain ? 'Capitaine ✓' : 'Capitaine ✗'} · ${s.city.officers.general ? 'Général ✓' : 'Général ✗'}`,
      ]));
    }

    /* ── DECREE ── */
    if (sub === 'decree') {
      const res = game.decree(uid, String(a[0] || '').toLowerCase());
      if (!res.ok) return bad(res.err);
      if (!res.decree) return ctx.send('📜 Décret abrogé — la ville reprend son rythme normal.');
      const d = DECREES[res.decree];
      return ctx.send(ctx.fmt.frame('📜 DÉCRET SIGNÉ', [`${d.label} — ${d.txt}`]));
    }

    /* ── SEND ── */
    if (sub === 'send') {
      const targetName = a[0];
      const kind = String(a[1] || '').toLowerCase() === 'money' ? 'money' : String(a[1] || '').toLowerCase();
      const res = game.send(uid, targetName, kind, kind, a[2]);
      if (!res.ok) return bad(res.err);
      await dmHints(res);
      const line = res.kind === 'money'
        ? `💱 ${nfc(res.received)}$ livrés à ${res.targetName}${res.tax ? ` — taxe de convoi ${nfc(res.tax)}$` : ' — pacte commercial : 0 taxe'}`
        : `📦 ${res.qty} × ${RES_LABEL[res.key]} livrés à ${res.targetName}`;
      return ctx.send(ctx.fmt.frame('🚚 CONVOI PARTI', [line]));
    }

    /* ── MARKET / BUY / SELL ── */
    if (sub === 'market') {
      const v = game.marketView();
      return ctx.send(ctx.fmt.frame('🌐 GRAND MARCHÉ', [
        ...RES.map((r) => `${RES_LABEL[r]} : ${nfc(game.priceOf(r))}$${v.shortage === r ? ' ⚠️ PÉNURIE ×2' : ''}`),
        '💱 Xcity buy <res> <qté> · Xcity sell <res> <qté> — prix re-tirés chaque 24 h',
      ]));
    }
    if (sub === 'buy' || sub === 'sell') {
      const res = game.marketTrade(uid, sub, String(a[0] || '').toLowerCase(), a[1]);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame(sub === 'buy' ? '🛒 ACHAT' : '💹 VENTE', [
        `${RES_LABEL[res.res]} ×${res.qty} — ${sub === 'buy' ? 'coût' : 'recette'} ${nfc(res.total)}$`,
        `💰 Trésor : ${nfc(res.gold)}$${res.shortage === res.res ? ' (⚠️ pénurie ×2)' : ''}`,
      ]));
    }

    /* ── ATTACK ── */
    if (sub === 'attack') {
      const res = game.attack(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      await dmHints(res);
      if (res.betrayal) {
        const t = TREATY_TYPES[res.treatyType];
        return ctx.send(ctx.fmt.frame('🗡️ TRAHISON !', [
          `Tu as ROMPU le traité ${t.label} — victoire automatique, portes ouvertes…`,
          `💰 Butin : ${ctx.fmt.bold(`${nfc(res.loot)}$`)} — ${ctx.fmt.bold('80 % de son or')} !`,
          `⭐ Réputation ${res.rep} (${res.title}) — le monde retiendra ta trahison.`,
        ]));
      }
      if (res.win) {
        const lines = [
          `🎌 Victoire ! Butin : ${ctx.fmt.bold(`${nfc(res.loot)}$`)} (15 %, plafonné)`,
          Object.keys(res.pillage || {}).length ? `📦 Pillage : ${Object.entries(res.pillage).map(([r, q]) => `${RES_LABEL[r]} +${q}`).join(' · ')}` : null,
          `⚔️ Pertes : toi ${res.lostA} unité(s) — défenseur ${res.lostD}`,
          res.shareNote ? `🤝 ${res.shareNote}` : null,
        ].filter(Boolean);
        return ctx.send(ctx.fmt.frame('⚔️ ATTAQUE — VICTOIRE', lines));
      }
      return ctx.send(ctx.fmt.frame('☠️ ATTAQUE — DÉFAITE', [
        `Ta puissance ${res.rollA} vs défense ${res.rollD} — repoussé !`,
        `⚔️ Pertes : toi ${res.lostA} unité(s) — défenseur ${res.lostD} · ⭐ le défenseur gagne +2 réputation`,
      ]));
    }

    /* ── TREATY ── */
    if (sub === 'treaty') {
      const action = String(a[0] || '').toLowerCase();
      if (action === 'list') {
        const res = game.treatiesList(uid);
        if (!res.ok) return bad(res.err);
        const lines = [
          ...res.rows.map((r) => `${TREATY_TYPES[r.type].label} — ${r.name} (${r.hoursLeft} h restantes)`),
          ...res.invites.map((p) => `📥 Proposition ${TREATY_TYPES[p.type].label} de ${game.nameOf(p.from)} → Xcity treaty accept ${game.nameOf(p.from)}`),
        ];
        return ctx.send(ctx.fmt.frame('📜 TRAITÉS', lines.length ? lines : ['Aucun traité — Xcity treaty propose <ville> <peace|alliance|trade>']));
      }
      if (action === 'propose') {
        const res = game.treatyPropose(uid, a[1] || '', String(a[2] || '').toLowerCase());
        if (!res.ok) return bad(res.err);
        await dmHints(res);
        const t = TREATY_TYPES[res.type];
        const effect = { peace: 'non-agression 48 h', alliance: 'non-agression + 10 % du butin partagé', trade: 'envois d’or SANS taxe pendant 48 h' }[res.type];
        return ctx.send(ctx.fmt.frame('📜 PROPOSITION ENVOYÉE', [
          `Traité ${t.label} proposé à ${ctx.fmt.bold(res.targetName)} — ${effect}.`,
          `⚠️ L’attaquer quand même = 🗡️ TRAHISON : 80 % de son or pillé, réputation détruite.`,
          `📥 Il accepte : Xcity treaty accept <ton nom de ville>`,
        ]));
      }
      if (action === 'accept' || action === 'decline') {
        const res = game.treatyRespond(uid, a.slice(1).join(' '), action === 'accept');
        if (!res.ok) return bad(res.err);
        if (!res.accepted) return ctx.send(`❌ Traité ${TREATY_TYPES[res.type].label} proposé par ${res.fromName} : REFUSÉ.`);
        return ctx.send(ctx.fmt.frame('🤝 TRAITÉ SIGNÉ', [
          `${ctx.fmt.bold(res.fromName)} × ta ville — ${TREATY_TYPES[res.type].label} pour 48 h`,
          '⭐ +2 réputation chacun · 😊 moral +3 · le rompre coûtera cher.',
        ]));
      }
      if (action === 'break') {
        const res = game.treatyBreak(uid, a.slice(1).join(' '));
        if (!res.ok) return bad(res.err);
        await dmHints(res);
        return ctx.send(ctx.fmt.frame('💔 TRAITÉ ROMPU', [
          `Traité ${TREATY_TYPES[res.brokenType].label} brisé — ⭐ réputation ${res.rep} (${res.title})`,
          '🕊️ Un dirigeant avisé préfère la signature à la lame…',
        ]));
      }
      return bad('Usage : Xcity treaty propose <ville> <peace|alliance|trade> · accept <ville> · break <ville> · list');
    }

    /* ── BARBARIANS / RAID ── */
    if (sub === 'barbarians') {
      const camps = game.ensureBarbs();
      return ctx.send(ctx.fmt.frame('🏕️ CAMPS BARBARES', [
        ...camps.map((b) => b.power > 0
          ? `${b.id}. ${b.name} — puissance ${b.power} · butin ≈ ${nfc(b.gold)}$`
          : `${b.id}. ${b.name} — 🪦 rasé (revient dans ~24 h)`),
        '⚔️ Xcity raid <n°> — victoire : +3 réputation',
      ]));
    }
    if (sub === 'raid') {
      const res = game.raid(uid, a[0]);
      if (!res.ok) return bad(res.err);
      if (res.win) {
        return ctx.send(ctx.fmt.frame('🏕️ RAID — VICTOIRE', [
          `${res.camp} rasé ! 💰 +${nfc(res.gold)}$ · ⭐ +3 réputation`,
          `📦 Butin : ${Object.entries(res.res).map(([r, q]) => `${RES_LABEL[r]} +${q}`).join(' · ') || '—'} · ⚔️ pertes ${res.lostA}`,
        ]));
      }
      return ctx.send(ctx.fmt.frame('🏕️ RAID — DÉFAITE', [
        `${res.camp} t’a repoussé (puissance ${res.rollA} vs ${res.rollD}).`,
        `⚔️ Pertes : ${res.lostA} unité(s) — entraîne plus de soldats !`,
      ]));
    }

    /* ── TOP ── */
    if (sub === 'top') {
      const kind = String(a[0] || 'or').toLowerCase();
      const res = game.top(kind);
      const label = { or: '💰 or', pop: '👥 population', rep: '⭐ réputation', armee: '⚔️ armée' }[res.kind] || '💰 or';
      return ctx.send(ctx.fmt.frame('🏆 TOP VILLES', [
        ...res.rows.map((r, i) => {
          const val = { or: `${nfc(r.gold)}$`, pop: `${nfc(r.pop)} hab.`, rep: `${r.rep} ⭐`, armee: `${Math.round(r.army * 10) / 10} ⚔️` }[res.kind];
          return `${ctx.fmt.bold(`${i + 1}.`)} ${r.name} (${r.title}) — ${val}`;
        }),
        res.rows.length ? `📊 Classement par ${label}` : 'Aucune ville encore — Xcity create <nom>',
      ]));
    }

    /* ── NEWS ── */
    if (sub === 'news') {
      const news = game.store.data.news.slice(0, 12);
      return ctx.send(ctx.fmt.frame('📰 CHRONIQUES DU MONDE', news.length
        ? news.map((n) => `• ${n.txt}`)
        : ['Le monde est calme… trop calme. 🌅']));
    }

    /* ── NOTIF ── */
    if (sub === 'notif') {
      const c = game.cityOf(uid);
      if (!c) return bad('Tu n’as pas de ville — Xcity create <nom>');
      const notes = c.notif.splice(0);
      game.save();
      return ctx.send(ctx.fmt.frame('🔔 NOTIFICATIONS', notes.length ? notes : ['Aucune notification.']));
    }

    /* ── AIDE ── */
    return ctx.send(ctx.fmt.frame('🏙️ XCITY — CITY-BUILDER JvJ', [
      `🧱 ${ctx.fmt.bold('Fonder')} : Xcity create <nom> — status · build <type> · collect · upgrade`,
      `📐 ${ctx.fmt.bold('Territoire')} : Xcity expand — les km² attirent des touristes 💰`,
      `🪖 ${ctx.fmt.bold('Armée')} : train <soldat|archer|cavalier> · officer <capitaine|general> · decree <type>`,
      `💱 ${ctx.fmt.bold('Économie')} : market · buy <res> <qté> · sell <res> <qté> · send <ville> money <somme>`,
      `📦 ${ctx.fmt.bold('Ressources')} : send <ville> <res> <qté> — ${RES.join(', ')}`,
      `⚔️ ${ctx.fmt.bold('Guerre')} : attack <ville> — pillage 15 % · 🗡️ TRAHISON d’un traité = 80 % !`,
      `📜 ${ctx.fmt.bold('Diplomatie')} : treaty propose <ville> <peace|alliance|trade> · accept · break · list`,
      `🏕️ ${ctx.fmt.bold('PvE')} : barbarians · raid <n°>`,
      `📊 ${ctx.fmt.bold('Monde')} : top <or|pop|armee|rep> · news · notif · profile <ville> · delete confirm`,
      `💰 L’or city est ${ctx.fmt.bold('interne')} — vos XCoins ne sont pas touchés.`,
    ]));
  },
};
