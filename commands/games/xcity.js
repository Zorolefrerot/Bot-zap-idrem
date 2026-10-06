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
 *   Xcity train <soldat|archer|cavalier> · Xcity officer <capitaine|général>  (FR accepté)
 *   Xcity decree <conscription|festival|tax|none>
 *   Xcity send <ville> money <somme> | send <ville> <res> <qté>
 *   Xcity market · buy <res> <qté> · sell <res> <qté>
 *   Xcity attack <ville>          → pillage 15 % … TRAHISON d'un traité = 80 % !
 *   Xcity treaty propose <ville> <peace|alliance|trade> · accept <ville> · break <ville>
 *   Xcity barbarians · raid <n°>  → camps barbares PvE
 *   Xcity top <or|pop|armee|rep> · news · notif · profile <ville> · delete confirm
 */

const { CityGame, BUILD_COST, BUILD_LABEL, UNITS, OFFICERS, DECREES, RES, RES_LABEL, TREATY_TYPES, ELEMENTS, CURE_PRICE, WORKS } = require('../../systems/city');

/* 🇫🇷 Alias FR → clés du moteur : « soldat », « capitaine », « général »…
 * fonctionnent EXACTEMENT comme les termes techniques. */
const UNIT_ALIASES = {
  soldat: 'soldier', soldier: 'soldier', soldats: 'soldier',
  archer: 'archer', archers: 'archer', tireur: 'archer',
  cavalier: 'cavalry', cavalry: 'cavalry', chevalier: 'cavalry',
};
const OFFICER_ALIASES = {
  capitaine: 'captain', captain: 'captain',
  general: 'general', 'général': 'general', generale: 'general', 'générale': 'general',
};

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
    game.sweepViruses(); // ☣️ les virus dont le délai a expiré font leurs morts ici
    const cur = () => game.cur(); // 💱 monnaie mondiale (modifiable par le Président)
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
        `💰 ${nfc(res.city.gold)}${cur()} (or interne) · 👥 50 · 📐 1 km² · 😊 50/100`,
        `📦 Spécialités : ${res.city.produce.map((r) => RES_LABEL[r]).join(' · ')}`,
        '',
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

    /* ── RENAME ── */
    if (sub === 'rename') {
      // Xcity rename <nouveau nom>            → sa propre ville
      // Xcity rename <ville> <nouveau nom>    → la sienne OU (admin) celle d'un autre
      const oldName = a.length >= 2 ? a[0] : '';
      const newName = a.length >= 2 ? a.slice(1).join(' ') : a.join(' ');
      const res = game.rename(uid, oldName, newName, { isAdmin: ctx.isAdmin(uid) });
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🏷️ VILLE RENOMMÉE', [
        `${res.oldName} ${'\u2192'} ${ctx.fmt.bold(res.newName)} (maire ${res.mayor})`,
      ]));
    }

    /* ── STATUS ── */
    if (sub === 'status') {
      const s = game.status(uid);
      if (!s) return bad('Tu n’as pas de ville — Xcity create <nom>');
      const L = s.lines;
      const rows = [L.main, L.land];
      if (L.lab) rows.push(L.lab);
      rows.push('', L.buildings, L.ress, '', L.army, L.decree, '', L.treaties, L.rep);
      return ctx.send(ctx.fmt.frame(`🏙️ ${s.city.name.toUpperCase()} — 𝗟𝘃𝗹 ${s.city.lvl}`, rows));
    }

    /* ── PROFILE ── */
    if (sub === 'profile') {
      const p = game.profile(a.join(' '));
      if (!p) return bad('Ville introuvable — Xcity top pour la liste.');
      return ctx.send(ctx.fmt.frame(`🏛️ ${p.name.toUpperCase()}`, [
        `👑 ${p.mayor} — 𝗟𝘃𝗹 ${p.lvl} · ⭐ ${p.rep} (${p.title})`,
        `👥 ${nfc(p.pop)} hab. · 📐 ${p.km2} km² · 😊 ${p.moral}/100 · 💰 ${nfc(p.gold)}${cur()}`,
        '',
        '',
        `🏗️ ${p.buildings || '—'}`,
        `⚔️ Armée : ${p.army} — ✅${p.wins} ❌${p.losses}`,
      ]));
    }

    /* ── BUILD ── */
    if (sub === 'build') {
      if (!a[0]) {
        return ctx.send(ctx.fmt.frame('🏗️ CONSTRUCTIONS DISPONIBLES', [
          ...Object.entries(BUILD_COST).map(([t, cost]) => `${BUILD_LABEL[t]} — ${nfc(cost)}${cur()}`),
          '',
          '📌 ' + ctx.fmt.bold('Format') + ' : Xcity build <type>',
          '🏠 Maison = +5 habitants · 🪖 Caserne = recruter l’armée',
        ]));
      }
      const res = game.build(uid, String(a[0] || '').toLowerCase());
      if (!res.ok) return bad(res.err);
      const label = BUILD_LABEL[res.type] || res.type;
      return ctx.send(ctx.fmt.frame('🏗️ CONSTRUCTION', [
        `${label} n°${res.count} édifié${res.type === 'house' ? ` — 👥 population ${res.pop}` : ''}`,
        `💰 Trésor : ${nfc(res.gold)}${cur()}`,
      ]));
    }

    /* ── COLLECT ── */
    if (sub === 'collect') {
      const res = game.collect(uid);
      if (!res.ok) return bad(res.err);
      const lines = [
        `💰 +${nfc(res.income)}${cur()} (impôts) + 🧳 ${nfc(res.tourists)} touristes → +${nfc(res.tourism)}${cur()}`,
        `📦 Production : ${Object.entries(res.produced).map(([r, q]) => `${RES_LABEL[r]} +${q}`).join(' · ')}`,
      ];
      lines.push('');
      if (res.blightNote) lines.push(res.blightNote);
      if (res.sabNote) lines.push(res.sabNote);
      if (res.decreeNote) lines.push(res.decreeNote);
      if (res.exodus) lines.push(`🏚️ Moral bas : ${res.exodus} habitants fuient la ville…`);
      if (res.event) { lines.push(''); lines.push(`🎲 ${res.event}`); }
      lines.push('');
      lines.push(`💰 Trésor : ${nfc(res.gold)}${cur()} · 😊 moral ${res.moral}/100`);
      return ctx.send(ctx.fmt.frame('🧾 COLLECTE', lines));
    }

    /* ── UPGRADE ── */
    if (sub === 'upgrade') {
      const res = game.upgrade(uid);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🏛️ NIVEAU SUPÉRIEUR', [
        `${ctx.fmt.bold(`𝗟𝘃𝗹 ${res.lvl}`)} atteint ! (−${nfc(res.cost)}${cur()})`,
        '',
        '🎁 De nouveaux bâtiments, unités et officiers se débloquent.',
      ]));
    }

    /* ── EXPAND (km²) ── */
    if (sub === 'expand') {
      const res = game.expand(uid);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('📐 ANNEXION', [
        `Territoire : ${ctx.fmt.bold(`${res.km2} km²`)} (−${nfc(res.cost)}${cur()}) · 👥 +2`,
        `🧳 Désormais ≈ ${res.tourists} touristes/collect → +${nfc(res.tourists * 2)}${cur()}`,
      ]));
    }

    /* ── TRAIN / OFFICER ── */
    if (sub === 'train') {
      if (a[0]) a[0] = UNIT_ALIASES[String(a[0]).toLowerCase()] || String(a[0]).toLowerCase();
      if (!a[0]) {
        return ctx.send(ctx.fmt.frame('🪖 UNITÉS À RECRUTER', [
          ...Object.entries(UNITS).map(([k, u]) => `${u.label} — ${nfc(u.cost)}${cur()} · puissance ${u.pow} · 𝗟𝘃𝗹 ${u.minLvl}+`),
          '',
          '📌 ' + ctx.fmt.bold('Format') + ' : Xcity train <soldat|archer|cavalier> (caserne requise)',
          '🧮 Capacité : 15 unités par caserne — Xcity build barracks pour agrandir',
        ]));
      }
      const res = game.train(uid, String(a[0] || '').toLowerCase());
      if (!res.ok) return bad(res.err);
      const u = UNITS[res.unit];
      return ctx.send(ctx.fmt.frame('🪖 RECRUTEMENT', [
        `${u.label} enrôlé — ${res.total}/${res.capacity} dans les casernes`,
        `💰 −${nfc(res.cost)}${cur()} → trésor ${nfc(res.gold)}${cur()}`,
      ]));
    }
    if (sub === 'officer') {
      if (a[0]) a[0] = OFFICER_ALIASES[String(a[0]).toLowerCase()] || String(a[0]).toLowerCase();
      if (!a[0]) {
        return ctx.send(ctx.fmt.frame('🎖️ OFFICIERS À RECRUTER', [
          ...Object.entries(OFFICERS).map(([k, o]) => `${o.label} — ${nfc(o.cost)}${cur()} · 𝗟𝘃𝗹 ${o.minLvl}+ · ${o.txt}`),
          '',
          '📌 ' + ctx.fmt.bold('Format') + ' : Xcity officer <type>',
        ]));
      }
      const res = game.buyOfficer(uid, String(a[0] || '').toLowerCase());
      if (!res.ok) return bad(res.err);
      const o = OFFICERS[res.officer];
      return ctx.send(ctx.fmt.frame('🎖️ OFFICER RECRUTÉ', [
        `${o.label} entre au service de la ville — ${o.txt}`,
        `💰 −${nfc(res.cost)}${cur()} → trésor ${nfc(res.gold)}${cur()}`,
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
      if (!a[0]) {
        return ctx.send(ctx.fmt.frame('📜 DÉCRETS DISPONIBLES', [
          ...Object.entries(DECREES).map(([k, d]) => `${d.label} — ${d.txt}`),
          '',
          '🕊️ none — abroger le décret en cours',
          '',
          '📌 ' + ctx.fmt.bold('Changement') + ' : 1 par heure maximum',
        ]));
      }
      const res = game.decree(uid, String(a[0] || '').toLowerCase());
      if (!res.ok) return bad(res.err);
      if (!res.decree) return ctx.send('📜 Décret abrogé — la ville reprend son rythme normal.');
      const d = DECREES[res.decree];
      return ctx.send(ctx.fmt.frame('📜 DÉCRET SIGNÉ', [`${d.label} — ${d.txt}`]));
    }

    /* ── SEND ── */
    if (sub === 'send') {
      if (!a[0]) {
        return ctx.send(ctx.fmt.frame('🚚 ENVOYER À UNE VILLE', [
          '',
          '💱 ' + ctx.fmt.bold('Or') + ' : Xcity send <ville> money <somme>',
          '📦 ' + ctx.fmt.bold('Ressources') + ' : Xcity send <ville> <res> <qté>',
          `📦 Liste : ${RES.join(', ')}`,
          '',
          '🤝 Partenaire commercial (traité trade) = 0 taxe · sinon 10 %',
        ]));
      }
      const targetName = a[0];
      const kind = String(a[1] || '').toLowerCase() === 'money' ? 'money' : String(a[1] || '').toLowerCase();
      const res = game.send(uid, targetName, kind, kind, a[2]);
      if (!res.ok) return bad(res.err);
      await dmHints(res);
      const line = res.kind === 'money'
        ? `💱 ${nfc(res.received)}${cur()} livrés à ${res.targetName}${res.tax ? ` — taxe de convoi ${nfc(res.tax)}${cur()}` : ' — pacte commercial : 0 taxe'}`
        : `📦 ${res.qty} × ${RES_LABEL[res.key]} livrés à ${res.targetName}`;
      return ctx.send(ctx.fmt.frame('🚚 CONVOI PARTI', [line]));
    }

    /* ── MARKET / BUY / SELL ── */
    if (sub === 'market') {
      const v = game.marketView();
      return ctx.send(ctx.fmt.frame('🌐 GRAND MARCHÉ', [
        ...RES.map((r) => `${RES_LABEL[r]} : ${nfc(game.priceOf(r))}$${v.shortage === r ? ' ⚠️ PÉNURIE ×2' : ''}`),
        '',
        '',
        '💱 Xcity buy <res> <qté> · Xcity sell <res> <qté> — prix re-tirés chaque 24 h',
      ]));
    }
    if (sub === 'buy' || sub === 'sell') {
      const res = game.marketTrade(uid, sub, String(a[0] || '').toLowerCase(), a[1]);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame(sub === 'buy' ? '🛒 ACHAT' : '💹 VENTE', [
        `${RES_LABEL[res.res]} ×${res.qty} — ${sub === 'buy' ? 'coût' : 'recette'} ${nfc(res.total)}${cur()}`,
        `💰 Trésor : ${nfc(res.gold)}${cur()}${res.shortage === res.res ? ' (⚠️ pénurie ×2)' : ''}`,
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
          '',
          `💰 Butin : ${ctx.fmt.bold(`${nfc(res.loot)}${cur()}`)} — ${ctx.fmt.bold('80 % de son or')} !`,
          '',
          `⭐ Réputation ${res.rep} (${res.title}) — le monde retiendra ta trahison.`,
        ]));
      }
      if (res.win) {
        const lines = [
          `🎌 Victoire ! Butin : ${ctx.fmt.bold(`${nfc(res.loot)}${cur()}`)} (15 %, plafonné)`,
          Object.keys(res.pillage || {}).length ? `📦 Pillage : ${Object.entries(res.pillage).map(([r, q]) => `${RES_LABEL[r]} +${q}`).join(' · ')}` : null,
          '',
          `⚔️ Pertes : toi ${res.lostA} unité(s) — défenseur ${res.lostD}`,
          res.shareNote ? `🤝 ${res.shareNote}` : null,
        ].filter(Boolean);
        return ctx.send(ctx.fmt.frame('⚔️ ATTAQUE — VICTOIRE', lines));
      }
      return ctx.send(ctx.fmt.frame('☠️ ATTAQUE — DÉFAITE', [
        `Ta puissance ${res.rollA} vs défense ${res.rollD} — repoussé !`,
        '',
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
          '',
          `⚠️ L’attaquer quand même = 🗡️ TRAHISON : 80 % de son or pillé, réputation détruite.`,
          '',
          `📥 Il accepte : Xcity treaty accept <ton nom de ville>`,
        ]));
      }
      if (action === 'accept' || action === 'decline') {
        const res = game.treatyRespond(uid, a.slice(1).join(' '), action === 'accept');
        if (!res.ok) return bad(res.err);
        if (!res.accepted) return ctx.send(`❌ Traité ${TREATY_TYPES[res.type].label} proposé par ${res.fromName} : REFUSÉ.`);
        return ctx.send(ctx.fmt.frame('🤝 TRAITÉ SIGNÉ', [
          `${ctx.fmt.bold(res.fromName)} × ta ville — ${TREATY_TYPES[res.type].label} pour 48 h`,
          '',
          '⭐ +2 réputation chacun · 😊 moral +3 · le rompre coûtera cher.',
        ]));
      }
      if (action === 'break') {
        const res = game.treatyBreak(uid, a.slice(1).join(' '));
        if (!res.ok) return bad(res.err);
        await dmHints(res);
        return ctx.send(ctx.fmt.frame('💔 TRAITÉ ROMPU', [
          `Traité ${TREATY_TYPES[res.brokenType].label} brisé — ⭐ réputation ${res.rep} (${res.title})`,
          '',
          '🕊️ Un dirigeant avisé préfère la signature à la lame…',
        ]));
      }
      return bad('Usage : Xcity treaty propose <ville> <peace|alliance|trade> · accept <ville> · break <ville> · list');
    }

    /* ── LABORATOIRE ── */
    if (sub === 'lab') {
      const res = game.labView(uid);
      if (!res.ok) return bad(res.err);
      const lines = [
        `🧪 ${res.labs} labo(s) · 🔬 ${res.scientists}/${res.capacity} scientifiques`,
        `🧬 Stock : ${res.stock || 'vide'}`,
        '',
      ];
      if (res.viruses.length) {
        lines.push('☣️ ' + ctx.fmt.bold('Vos organismes') + ' :');
        for (const v of res.viruses) {
          const mins = Math.max(0, Math.ceil((v.deadline ? v.deadline - Date.now() : v.life) / 60000));
          lines.push(`• ${v.name} — ${v.tier === 'pandemic' ? '🦠 pandémie' : '☣️ virus'} · puissance ${v.power} · ${v.deadline ? `${mins} min restantes` : `prêt (${mins} min de vie)`}${Object.keys(v.infected).length ? ' · RELÂCHÉ' : ''}`);
        }
      } else lines.push('🧫 Aucun virus en réserve — Xcity synth <nom> <3 éléments>');
      lines.push('');
      if (res.infectedBy.length) lines.push(`🚑 VILLE INFECTÉE : ${res.infectedBy.map((v) => v.name).join(', ')} — Xcity cure <nom>`);
      return ctx.send(ctx.fmt.frame('🧪 LABORATOIRE', lines));
    }
    if (sub === 'hire') {
      const res = game.hire(uid, a[0]);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🔬 RECRUTEMENT SCIENTIFIQUE', [
        `${res.hired} scientifique(s) embauché(s) — équipe : ${res.scientists}/${res.capacity}`,
        `💰 −${nfc(res.cost)}${cur()} → trésor ${nfc(res.gold)}${cur()}`,
      ]));
    }
    if (sub === 'research') {
      const res = game.research(uid);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🔎 CAMPAGNE DE RECHERCHE', [
        res.found.length
          ? `🧬 Découvert : ${res.found.map((k) => ELEMENTS[k].label).join(' · ')}`
          : '🕳️ Aucun élément découvert cette fois… (plus de scientifiques = plus de chances)',
        `🧬 Stock : ${res.stock}`,
        `💰 −200$ → trésor ${nfc(res.gold)}${cur()}`,
      ]));
    }
    if (sub === 'synth') {
      if (a.length < 2) {
        return ctx.send(ctx.fmt.frame('☣️ SYNTHÈSE VIRALE', [
          '📌 ' + ctx.fmt.bold('Virus') + ' : Xcity synth <nom> <elt1> <elt2> <elt3> — 500$',
          '',
          '📌 ' + ctx.fmt.bold('Pandémie') + ' : Xcity synth <nom> <6 éléments dont 1 rare> rancon <prix> — 2 000$',
          '',
          `🧬 Éléments : ${Object.keys(ELEMENTS).join(', ')}`,
          '',
          '🔴 Rares : mercure, cesium, plutonium · 🧪 2 labos + 🔬 4 scientifiques requis pour une pandémie',
          '',
          '⏳ La durée de vie du virus dépend de sa synthèse · créateur JAMAIS dévoilé',
        ]));
      }
      const name = a[0];
      const rest = a.slice(1).map(String);
      let ransomArg = null;
      const ri = rest.findIndex((x) => x.toLowerCase() === 'rancon' || x.toLowerCase() === 'rançon');
      if (ri !== -1) { ransomArg = rest[ri + 1]; rest.splice(ri, 2); }
      const res = game.synth(uid, name, rest, ransomArg);
      if (!res.ok) return bad(res.err);
      const v = res.virus;
      return ctx.send(ctx.fmt.frame(res.tier === 'pandemic' ? '🦠 PANDEMIE SYNTHÉTISÉE' : '☣️ VIRUS SYNTHÉTISÉ', [
        `${ctx.fmt.bold(v.name)} — puissance ${v.power} · durée de vie ~${Math.round(v.life / 60000)} min`,
        v.tier === 'pandemic'
          ? `🗝️ Rançon fixée : ${nfc(v.ransom)}${cur()} par ville — un jour, tu pourras l’unleash…`
          : '🎯 Relâche-le : Xcity infect <ville> <nom> — TA cible ne saura JAMAIS qui a frappé',
      ]));
    }
    if (sub === 'infect') {
      const res = game.infect(uid, a[0] || '', a[1] || '');
      if (!res.ok) return bad(res.err);
      await dmHints(res);
      return ctx.send(ctx.fmt.frame('☣️ CONTAMINATION', [
        `Le virus ${ctx.fmt.bold(res.virus.name)} frappe ${res.targetName} — ${res.infected} habitants infectés.`,
        '',
        `⏳ ~${res.mins} min avant des morts · 💊 soins 100$/habitant · 🕵️ AUCUNE trace vers toi.`,
        '',
        '📰 L’info passe aux chroniques (nom du virus seul).',
      ]));
    }
    if (sub === 'unleash') {
      const res = game.unleash(uid, a[0] || '');
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🦠 PANDEMIE RELÂCHÉE', [
        `${ctx.fmt.bold(res.virus.name)} frappe ${res.hits} ville(s) — TA ville est épargnée.`,
        '',
        `🗝️ Rançon exigée : ${nfc(res.virus.ransom)}${cur()} par ville → elles paieront via Xcity send ${res.virus.name} money <somme>`,
        '',
        `⏳ ~${res.mins} min · 📰 L’annonce de rançon est passée aux chroniques et aux notifs — tu restes ANONYME.`,
      ]));
    }
    if (sub === 'cure') {
      const res = game.cure(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('💊 SOINS URGENTS', [
        `${res.cnt} habitants sauvés — facture : ${nfc(res.cost)}${cur()} (100$/habitant)`,
        '',
        '🛏️ Ta ville est tirée d’affaire… mais où est passé cet argent ?',
      ]));
    }

    /* ── ASSEMBLÉE DES VILLES 🏛️ ── */
    if (sub === 'assemblee') {
      if (String(a[0] || '').toLowerCase() === 'ouvrir') {
        const res = game.openElection(uid);
        if (!res.ok) return bad(res.err);
        return ctx.send(ctx.fmt.frame('🏛️ ÉLECTIONS OUVERTES', [
          '📢 CANDIDATURES ouvertes pendant 30 min',
          `🧾 Caution : ${nfc(50000)}${cur()} → versée au trésor de l'Assemblée`,
          '📌 Postuler : Xcity candidater',
        ]));
      }
      const v = game.assemblyView();
      const lines = [];
      if (v.president) {
        lines.push(`👑 PRÉSIDENT GÉNÉRAL : ${ctx.fmt.bold(v.president.name)} — mandat encore ${v.president.label}`);
      } else if (v.phase) {
        lines.push(v.phase === 'candidacy' ? `📜 CANDIDATURES ouvertes (${v.minutesLeft} min)` : `🗳️ VOTE EN COURS (${v.minutesLeft} min)`);
      } else lines.push('🏛️ Aucun Président en exercice — Xcity assemblee ouvrir');
      lines.push('');

      lines.push(`🏦 Trésor de l'Assemblée : ${nfc(v.treasury)}${cur()} — alimenté par le GOUVERNEMENT SUPÉRIEUR (+10${cur()}/min/ville, jamais pris sur les villes)`);
      lines.push(`💱 Monnaie : ${ctx.fmt.bold(v.currency)} · 💵 Salaire présidentiel : 50 000${cur()}/h`);
      if (v.candidates.length) {
        lines.push('');

        lines.push('🎟️ ' + ctx.fmt.bold('Candidats (score = habitants + 20×voix − 1000×scandales) :'));
        for (const c of v.candidates) lines.push(`• ${c.name} — 👥${c.pop} + 🗳️${c.votes} → score ${c.score}${c.scandals ? ` (⚠️ ${c.scandals} scandale(s))` : ''}`);
      } else if (v.phase === 'candidacy') lines.push('Aucun candidat pour l’instant — Xcity candidater');
      return ctx.send(ctx.fmt.frame('🏛️ ASSEMBLÉE DES VILLES', lines));
    }
    if (sub === 'candidater') {
      const res = game.candidater(uid);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🏛️ CANDIDATURE DÉPOSÉE', [
        `Caution payée : ${nfc(50000)}${cur()} → trésor de l'Assemblée`,
        '',
        '🗳️ À l’ouverture du vote : ta ville reçoit ses habitants + 20 points par maire qui te vote.',
        '',
        '⚠️ Tes scandales passés coûtent 1 000 points chacun…',
      ]));
    }
    if (sub === 'vote') {
      const res = game.castVote(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🗳️ VOTE ENREGISTRÉ', [
        `Ta ville vote pour ${ctx.fmt.bold(res.forCity)} — ta voix vaut ${res.weight} points.`,
        '',
        '🤫 Dernier vote compte : trahir et changer est permis…',
      ]));
    }
    if (sub === 'monnaie') {
      const res = game.setCurrency(uid, a[0]);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('💱 MONNAIE CHANGÉE', [
        `L'Assemblée adopte désormais : ${ctx.fmt.bold(res.currency)}`,
        'Tous les affichages du jeu l\u2019utilisent.',
      ]));
    }
    if (sub === 'don') {
      const res = game.don(uid, a[0] || '', a[1]);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🏛️ TRANSFERT PRÉSIDENTIEL', [
        `${nfc(res.amount)}${cur()} versés à ${res.city} — 🏦 trésor : ${nfc(res.treasury)}${cur()}`,
      ]));
    }
    if (sub === 'batir') {
      const res = game.buildFor(uid, a[0] || '', String(a[1] || '').toLowerCase());
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🏛️ CONSTRUCTION PUBLIQUE', [
        `${BUILD_LABEL[res.type] || res.type} financée pour ${res.city} — −${nfc(res.cost)}${cur()}`,
        `🏦 Trésor de l'Assemblée : ${nfc(res.treasury)}${cur()}`,
      ]));
    }
    if (sub === 'pocket') {
      const res = game.pocket(uid, a[0]);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🥀 DÉTOURNEMENT', [
        `${nfc(res.amount)}${cur()} transférés dans TON trésor personnel…`,
        '',
        `⭐ Réputation ${res.rep} · scandales : ${res.scandals} (−1 000 points chacun aux élections)`,
        '',
        '📰 La presse s’en empare — les maires ne l’oublieront pas.',
      ]));
    }
    if (sub === 'quarantine') {
      const res = game.quarantine(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🚧 QUARANTAINE', [
        `${res.city} est confinée 30 min — plus d'attaques, d'espions ni de virus.`,
        res.free ? 'Mesure présidentielle : gratuite.' : 'Mesure d’urgence : −3 000' + cur(),
      ]));
    }

    /* ── OPS SPÉCIALES : espionnage, toxines, dissuasion ☢️ ── */
    if (sub === 'spy') {
      const res = game.spy(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      if (res.caught) {
        return ctx.send(ctx.fmt.frame('🕵️ ESPION ATTRAPÉ', [
          `Ton espion a été repéré à ${res.city} — réputation ${res.rep}`,
          'La cible a été prévenue…',
        ]));
      }
      return ctx.send(ctx.fmt.frame('🕵️ RAPPORT D’ESPIONNAGE', [
        `🎯 ${res.city} — 💰 ${nfc(res.gold)}${cur()} · 😊 ${res.moral}/100`,
        '',
        `🪖 Armée : ${res.units} · 🤝 ${res.treaties} traité(s)`,
        'Personne ne t’a vu passer.',
      ]));
    }
    if (sub === 'biotoxin') {
      const res = game.biotoxin(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🥀 BIOTOXINE DISPERSÉE', [
        `Les récoltes de ${res.city} se fanent — fermes improductives pour 3 collects.`,
        '',
        '🕵️ Aucune trace vers toi… (sauf si elle est VACCINÉE, c’est un échec)',
      ]));
    }
    if (sub === 'propaganda') {
      const res = game.propaganda(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('📻 PROPAGANDE', [
        `${res.city} : moral -10 (désormais ${res.targetMoral}/100) — la tienne : +5 (${res.myMoral}/100)`,
        '',
        'Moins de moral = moins de touristes chez eux…',
      ]));
    }
    if (sub === 'sabotage') {
      const res = game.sabotage(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      if (res.caught) return ctx.send(ctx.fmt.frame('🧨 SABOTAGE DÉMASQUÉ', [`Les agents ont été identifiés à ${res.city} — réputation ${res.rep}`]));
      return ctx.send(ctx.fmt.frame('🧨 SABOTAGE RÉUSSI', [
        `La production de ${res.city} est réduite de moitié pour 2 collects.`,
        '',
        'Tu n’as pas laissé de trace.',
      ]));
    }
    if (sub === 'counterfeit') {
      const res = game.counterfeit(uid);
      if (!res.ok) return bad(res.err);
      if (res.success) {
        return ctx.send(ctx.fmt.frame('🎭 FAUSSE MONNAIE', [`Billets parfaitement imités : +${nfc(res.gain)}${cur()} — trésor ${nfc(res.gold)}${cur()}`]));
      }
      return ctx.send(ctx.fmt.frame('🎭 FAUX-MONNAYEUR DÉMASQUÉ', [
        `Amende : −${nfc(res.fine)}${cur()} · réputation ${res.rep}`,
        '',
        'La presse parle d’un atelier démantelé…',
      ]));
    }
    if (sub === 'investigate') {
      const res = game.investigate(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      if (res.revealed) {
        return ctx.send(ctx.fmt.frame('📰 ENQUÊTE EXCLUSIVE', [
          `Le virus ${ctx.fmt.bold(res.virus)} a été créé par ${ctx.fmt.bold(res.creatorName)} (maire ${res.mayor}) !`,
          '',
          'La chronique est publique — le masque tombe.',
        ]));
      }
      return ctx.send(ctx.fmt.frame('📰 ENQUÊTE SANS RÉSULTAT', [
        res.reason === 'introuvable' ? 'Ce virus est introuvable dans les registres.' : 'Vos journalistes n’ont rien trouvé… 800' + cur() + ' perdus.',
      ]));
    }
    if (sub === 'nuke') {
      if (String(a[0] || '').toLowerCase() === 'build') {
        const res = game.nukeBuild(uid);
        if (!res.ok) return bad(res.err);
        return ctx.send(ctx.fmt.frame('☢️ PROGRAMME NUCLÉAIRE', [
          `Ogive n°${res.nukes} assemblée — DISSUASION : ton arsenal est visible sur ton profil.`,
          '⚡ Frappe : Xcity nuke <ville> — le monde entier sera informé.',
        ]));
      }
      const res = game.nuke(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('☢️ FRAPPE NUCLÉAIRE', [
        `${res.city} : ${res.deaths} habitants morts, −${nfc(res.drained)}${cur()} pillés, bâtiments en ruine`,
        '',
        `⭐ Réputation ${res.rep} · ☢️ ogives restantes : ${res.nukes} · 🚧 zone en quarantaine 30 min`,
        '',
        'Le monde entier a reçu l’alerte.',
      ]));
    }
    if (sub === 'vaccinate') {
      const res = game.vaccinate(uid);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('💉 IMMUNITÉ NATIONALE', [
        'Campagne de vaccination terminée — ta ville refuse virus et biotoxines pendant 24 h.',
      ]));
    }
    if (sub === 'vaccine') {
      const res = game.vaccine(uid, a[0] || '', a[1] || '');
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('💉 VACCIN DU MARCHÉ NOIR', [
        `${res.city} sauvée de « ${res.virus} » (${res.cnt} habitants × 80${cur()} = ${nfc(res.price)}${cur()} pour toi)`,
        '',
        '⭐ +2 réputation — un remède officieux, mais un remède quand même.',
      ]));
    }

    /* ── GOUVERNANCE MONDIALE 🏛️ ── */
    if (sub === 'decret') {
      if (!a[0]) {
        return ctx.send(ctx.fmt.frame('📜 DÉCRETS MONDIAUX (1 par mandat)', [
          '🎪 foire — prix de VENTE +20 % au marché (1 h)',
          '🕊️ paix — attaques et frappes désactivées (2 h)',
          '⚒️ corvee — +30 % de revenus partout (1 h)',
          '🌑 couvrefeu — opérations secrètes bloquées (1 h)',
          '',
          '📌 ' + ctx.fmt.bold('Format') + ' : Xcity decret <type> (Président)',
        ]));
      }
      const res = game.worldDecree(uid, String(a[0]).toLowerCase());
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('📜 DÉCRET SIGNÉ', [
        `${res.decree} — ${res.txt}`,
        `⏳ En vigueur ${res.hours} h · annoncé à toutes les villes`,
        'Un seul décret par mandat : choisis bien ton moment.',
      ]));
    }
    if (sub === 'tribunal') {
      const action = String(a[0] || '').toLowerCase();
      if (!action || action === 'statut') {
        const res = game.tribunalStatus();
        if (!res.tribunal) return ctx.send('⚖️ Aucun procès en cours — Xcity tribunal accuser <ville> <amende|embargo>');
        const T = res.tribunal;
        return ctx.send(ctx.fmt.frame('⚖️ PROCÈS EN COURS', [
          `🎯 ${T.city} — peine demandée : ${T.sentence}`,
          `🗳️ Coupable ${T.coupable} (preuves comprises) vs Innocent ${T.innocent}`,
          `⏳ ${T.minutes} min restantes`,
        ]));
      }
      if (action === 'accuser') {
        const res = game.tribunalOpen(uid, a[1] || '', String(a[2] || '').toLowerCase());
        if (!res.ok) return bad(res.err);
        return ctx.send(ctx.fmt.frame('⚖️ PROCÈS OUVERT', [
          `${ctx.fmt.bold(res.city)} est accusé — peine demandée : ${res.sentence}`,
          `🧾 Preuves au dossier : ${res.evidence} (scandales ×2 + trahisons)`,
          '🗳️ Les maires votent 30 min : Xcity tribunal voter <coupable|innocent>',
        ]));
      }
      if (action === 'voter') {
        const res = game.tribunalVote(uid, a[1]);
        if (!res.ok) return bad(res.err);
        return ctx.send(`⚖️ Verdict enregistré : ${ctx.fmt.bold(res.verdict)} — que justice soit faite.`);
      }
      return bad('Usage : tribunal accuser <ville> <amende|embargo> · tribunal voter <coupable|innocent>');
    }
    if (sub === 'loi') {
      const action = String(a[0] || '').toLowerCase();
      if (!action || action === 'statut') {
        const res = game.loiStatus();
        const lines = [];
        if (res.active) lines.push(`📜 EN VOTE : ${res.active.label} — oui ${res.active.oui} / non ${res.active.non} (${res.active.minutes} min)`);
        else lines.push('📜 Aucun vote de loi en cours — Xcity loi proposer <novice|butin|noir>');
        lines.push('');
        lines.push(`🏛️ Adoptées : ${res.adopted.length ? res.adopted.join(', ') : 'aucune'}`);
        return ctx.send(ctx.fmt.frame('📜 CONSTITUTION', lines));
      }
      if (action === 'proposer') {
        const res = game.loiPropose(uid, String(a[1] || '').toLowerCase());
        if (!res.ok) return bad(res.err);
        return ctx.send(ctx.fmt.frame('📜 LOI PROPOSÉE', [
          res.label,
          '🗳️ Les maires votent 30 min : Xcity loi voter <nom> <oui|non>',
          'Majorité « oui » = entrée en Constitution (effets RÉELS).',
        ]));
      }
      if (action === 'voter') {
        const res = game.loiVote(uid, a[1], a[2]);
        if (!res.ok) return bad(res.err);
        return ctx.send(`📜 Ton vote est enregistré : ${ctx.fmt.bold(res.verdict)}`);
      }
      return bad('Usage : loi proposer <novice|butin|noir> · loi voter <nom> <oui|non>');
    }
    if (sub === 'travaux') {
      const action = String(a[0] || '').toLowerCase();
      if (!action || action === 'statut') {
        const res = game.worksView(uid);
        if (!res.ok) return bad(res.err);
        const lines = [];
        if (res.works) lines.push(`🏗️ ${res.works.name} — étape ${res.works.stage + 1}/${res.works.total} : ${nfc(res.works.collected)}/${nfc(res.works.need)}${cur()}`);
        else lines.push('🏗️ Aucun chantier en cours — le Président lance : Xcity travaux lancer <pont|aqueduc|universite>');
        lines.push('');
        if (res.works) lines.push(`🎁 Bonus à chaque étape : ${res.works.txt}`);
        lines.push(`✅ Terminés : ${res.done.length ? res.done.join(' · ') : 'aucun'}`);
        return ctx.send(ctx.fmt.frame('🏗️ GRANDS TRAVAUX', lines));
      }
      if (action === 'lancer') {
        const res = game.worksLaunch(uid, String(a[1] || '').toLowerCase());
        if (!res.ok) return bad(res.err);
        return ctx.send(ctx.fmt.frame('🏗️ CHANTIER LANCÉ', [
          `${res.name} — 1ʳᵉ étape : ${nfc(res.need)}${cur()}`,
          '💠 Toutes les villes peuvent financer : Xcity travaux donner <somme>',
        ]));
      }
      if (action === 'donner' || action === 'financer') {
        const res = game.worksFund(uid, a[1], action === 'financer');
        if (!res.ok) return bad(res.err);
        const lines = [
          `💰 +${nfc(res.amount)}${cur()} pour ${res.name}${res.fromTreasury ? ' (trésor de l’Assemblée)' : ''}`,
        ];
        if (res.finished) lines.push('', `🏆 CHANTIER TERMINÉ : ${res.name} — le monde entier profite !`);
        else if (res.stageDone) lines.push('', `🎉 Étape achevée ! Prochaine : ${nfc(res.need)}${cur()} — le bonus mondial est ACTIF.`);
        else lines.push('', `🧱 Progrès : ${nfc(res.collected)}/${nfc(res.need)}${cur()}`);
        return ctx.send(ctx.fmt.frame('🏗️ GRANDS TRAVAUX', lines));
      }
      return bad('Usage : travaux lancer <pont|aqueduc|universite> · donner <somme> · financer <somme> (Président)');
    }
    if (sub === 'catastrophe') {
      const res = game.declareCatastrophe(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🚨 ÉTAT DE CATASTROPHE', [
        `${res.city} — déclaré pour ${res.hours} h`,
        '🏗️ Reconstructions à MOITIÉ PRIX · 💱 les dons reçus réconfortent doublement la population',
      ]));
    }
    if (sub === 'renseignement') {
      const res = game.intelBuy(uid, a.join(' '));
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🕵️ RENSEIGNEMENT', [
        `Virus « ${res.virus} » — ${res.sure ? '✅ source fiable' : '⚠️ source peu fiable'}`,
        `👤 Créateur présumé : ${ctx.fmt.bold(res.creator || 'inconnu')}${res.mayor ? ` (maire ${res.mayor})` : ''}`,
        '', '💵 −20 000 au trésor de l’Assemblée · les détails sont dans ta messagerie.',
      ]));
    }
    if (sub === 'sommet') {
      if (String(a[0] || '').toLowerCase() === 'convoquer') {
        const res = game.summitOpen(uid);
        if (!res.ok) return bad(res.err);
        return ctx.send(ctx.fmt.frame('🤝 SOMMET CONVOQUÉ', [
          '📢 30 min pour répondre présent : Xcity present',
          '😊 Chaque participant gagne du moral · 🕊️ paix COLLECTIVE de 24 h si ≥ 2 villes',
          '💵 Organisation : −5 000 au trésor de l’Assemblée',
        ]));
      }
      return bad('Usage : Xcity sommet convoquer (Président) — puis chacun tape Xcity present');
    }
    if (sub === 'present') {
      const res = game.summitAttend(uid);
      if (!res.ok) return bad(res.err);
      return ctx.send(ctx.fmt.frame('🤝 PRÉSENT AU SOMMET', [
        `✅ Inscription confirmée — ${res.attendees} ville(s) présente(s)`,
        '😊 +3 de moral · à la clôture : paix collective entre participants',
      ]));
    }
    if (sub === 'garde') {
      const action = String(a[0] || '').toLowerCase();
      if (!action) {
        const A = game.assembly();
        return ctx.send(ctx.fmt.frame('🛡️ GARDE DE L’ASSEMBLÉE', [
          `Soldats disponibles : ${A.garde || 0} (armée commune)`,
          '', '🧾 recruter <n> — 200/unité (trésor de l’Assemblée)',
          '✈️ envoyer <ville> <n> — la ville est défendue (+1 puissance/unité)',
        ]));
      }
      if (action === 'recruter') {
        const res = game.guardRecruit(uid, a[1]);
        if (!res.ok) return bad(res.err);
        return ctx.send(ctx.fmt.frame('🛡️ GARDE RENFORCÉE', [
          `${res.garde} soldats au total — −${nfc(res.cost)}${cur()} au trésor de l’Assemblée`,
        ]));
      }
      if (action === 'envoyer') {
        const res = game.guardSend(uid, a[1] || '', a[2]);
        if (!res.ok) return bad(res.err);
        return ctx.send(ctx.fmt.frame('🛡️ GARDE DÉPÊCHÉE', [
          `${res.sent} soldat(s) protègent désormais ${res.city}`,
          `🛡️ Restent disponibles : ${res.remaining}`,
        ]));
      }
      return bad('Usage : garde recruter <n> · garde envoyer <ville> <n>');
    }

    /* ── BARBARIANS / RAID ── */
    if (sub === 'barbarians') {
      const camps = game.ensureBarbs();
      return ctx.send(ctx.fmt.frame('🏕️ CAMPS BARBARES', [
        ...camps.map((b) => b.power > 0
          ? `${b.id}. ${b.name} — puissance ${b.power} · butin ≈ ${nfc(b.gold)}${cur()}`
          : `${b.id}. ${b.name} — 🪦 rasé (revient dans ~24 h)`),
        '',
        '',
        '⚔️ Xcity raid <n°> — victoire : +3 réputation',
      ]));
    }
    if (sub === 'raid') {
      const res = game.raid(uid, a[0]);
      if (!res.ok) return bad(res.err);
      if (res.win) {
        return ctx.send(ctx.fmt.frame('🏕️ RAID — VICTOIRE', [
          `${res.camp} rasé ! 💰 +${nfc(res.gold)}${cur()} · ⭐ +3 réputation`,
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
          const val = { or: `${nfc(r.gold)}${cur()}`, pop: `${nfc(r.pop)} hab.`, rep: `${r.rep} ⭐`, armee: `${Math.round(r.army * 10) / 10} ⚔️` }[res.kind];
          return `${ctx.fmt.bold(`${i + 1}.`)} ${r.name} (${r.title}) — ${val}`;
        }),
        '',
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

    /* ── AIDE (sommaire par rubriques) ── */
    return ctx.send(ctx.fmt.frame('🏙️ XCITY — SOMMAIRE', [
      '🏗️ 𝗠𝗔 𝗩𝗜𝗟𝗟𝗘',
      '• create <nom> — fonder sa ville (or interne)',
      '• status · profile <ville> — fiches détaillées',
      '• build <type> · collect · upgrade · rename <nouveau nom>',
      '• delete confirm — raser sa ville',
      '',
      '📐 𝗧𝗘𝗥𝗥𝗜𝗧𝗢𝗜𝗥𝗘',
      '• expand — +1 km² → touristes → or 💰',
      '',
      '🪖 𝗔𝗥𝗠𝗘́𝗘',
      '• train <soldat|archer|cavalier> · officer <capitaine|général> · army',
      '• decree <conscription|festival|tax|none>',
      '',
      '🧪 𝗟𝗔𝗕𝗢𝗥𝗔𝗧𝗢𝗜𝗥𝗘 ☣️',
      '• build lab · hire <n> · research — éléments chimiques',
      '• synth <nom> <3 élts> = VIRUS · <6 élts> rancon <prix> = PANDEMIE',
      '• infect <ville> <nom> — ANONYME · cure <nom> — soins 100$/habitant',
      '• unleash <nom> — pandémie mondiale + rançon (envoi au NOM DU VIRUS)',
      '',
      '💱 𝗘́𝗖𝗢𝗡𝗢𝗠𝗜𝗘',
      '• market · buy <res> <qté> · sell <res> <qté>',
      '• send <ville> money <somme> — ou send <ville> <res> <qté>',
      '',
      '⚔️ 𝗚𝗨𝗘𝗥𝗥𝗘',
      '• attack <ville> — pillage 15 %',
      '• 🗡️ TRAHISON d’un traité = 80 % de l’or pillé !',
      '',
      '📜 𝗗𝗜𝗣𝗟𝗢𝗠𝗔𝗧𝗜𝗘',
      '• treaty propose <ville> <peace|alliance|trade>',
      '• treaty accept <ville> · break <ville> · list',
      '',
      '🏕️ 𝗣𝘃𝗘',
      '• barbarians · raid <n°> — butin sans ennemi joueur',
      '🏛️ 𝗔𝗦𝗦𝗘𝗠𝗕𝗟𝗘́𝗘 𝗗𝗘𝗦 𝗩𝗜𝗟𝗟𝗘𝗦',
      '• assemblee ouvrir · candidater (caution 50 000) · vote <ville>',
      '• Président 3 JOURS : don <ville> <somme> · batir <ville> <type> · salaire 50 000/h',
      '• monnaie <$ € ¥ ¢ £ XOF FC FCFA…> · pocket (détournement…)',
      '• decret <foire|paix|corvee|couvrefeu> — 1 par mandat, effet mondial',
      '• tribunal accuser <ville> <amende|embargo> · tribunal voter <verdict>',
      '• loi proposer <novice|butin|noir> · loi voter <nom> <oui|non>',
      '• travaux lancer <pont|aqueduc|universite> · travaux donner <somme>',
      '• catastrophe <ville> · renseignement <virus> · sommet convoquer · present',
      '• garde recruter <n> · garde envoyer <ville> <n> — armée commune',
      '🧠 𝗢𝗣𝗦 𝗦𝗣𝗘́𝗖𝗜𝗔𝗟𝗘𝗦',
      '• spy <ville> · sabotage <ville> · propaganda <ville> · biotoxin <ville>',
      '• counterfeit · investigate <virus> · vaccine <ville> <virus> · vaccinate',
      '• nuke build · nuke <ville> — ☢️ dissuasion, frappe dévastatrice',
      '• quarantine <ville> — confiner une ville infectée',
      '🌍 𝗠𝗢𝗡𝗗𝗘',
      '• top <or|pop|armee|rep> · news · notif',
      '',
      '💰 Or city INTERNE — vos XCoins ne sont jamais touchés.',
    ]));
  },
};
