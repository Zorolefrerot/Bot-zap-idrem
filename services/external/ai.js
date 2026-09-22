"use strict";

/**
 * services/external/ai.js
 * ---------------------------------------------------------------------------
 * Couche IA : architecture prête à brancher sur n'importe quel fournisseur
 * compatible OpenAI (OpenAI, Groq, OpenRouter, ou une URL personnalisée).
 *
 * RÈGLE ABSOLUE : si aucune clé n'est configurée, les commandes IA affichent un
 * message « service non configuré » clair. Le bot n'invente JAMAIS une réponse
 * d'IA et ne prétend pas avoir interrogé un modèle.
 *
 * Configuration (variables d'environnement uniquement, jamais dans Git) :
 *   AI_PROVIDER=openai|groq|openrouter|custom
 *   AI_API_KEY=…            (ou OPENAI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY)
 *   AI_MODEL=…              (optionnel : défaut selon le fournisseur)
 *   AI_BASE_URL=…           (optionnel, pour un fournisseur personnalisé)
 *   IMAGE_API_KEY=…         (optionnel : génération d'images)
 * ---------------------------------------------------------------------------
 */

const { fetchJson, fail, success, notConfigured } = require("./http");
const { sanitize } = require("../../utils/logger");

const PROVIDERS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    label: "OpenAI"
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    label: "Groq"
  },
  openrouter: {
    baseUrl: "https://api.openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    label: "OpenRouter",
    extraHeaders: { "HTTP-Referer": "https://github.com/Zorolefrerot/Bot-zap-idrem", "X-Title": "IDREM TERESHKOVA" }
  },
  custom: {
    baseUrl: "",
    defaultModel: "gpt-4o-mini",
    label: "Fournisseur personnalisé"
  }
};

const MAX_PROMPT_CHARS = 3000;
const MAX_OUTPUT_CHARS = 3200;

/**
 * @param {object} deps
 * @param {object} deps.config configuration chargée (section `ai`)
 * @param {object} [deps.logger]
 */
function createAi(deps = {}) {
  const { config } = deps;
  const logger = deps.logger || { info() {}, warn() {}, error() {}, debug() {} };

  function settings() {
    const ai = (config && config.ai) || {};
    const providerKey = String(ai.provider || "").toLowerCase();
    const provider = PROVIDERS[providerKey] || null;
    const apiKey = String(ai.apiKey || "").trim();
    const baseUrl = String(ai.baseUrl || (provider ? provider.baseUrl : "")).trim().replace(/\/+$/, "");
    const model = String(ai.model || (provider ? provider.defaultModel : "")).trim();
    return {
      providerKey,
      providerLabel: provider ? provider.label : providerKey || "aucun",
      apiKey,
      baseUrl,
      model,
      maxTokens: Math.max(64, Number(ai.maxTokens) || 700),
      extraHeaders: provider && provider.extraHeaders ? provider.extraHeaders : {}
    };
  }

  /** L'IA textuelle est-elle utilisable ? */
  function configured() {
    const s = settings();
    return Boolean(s.apiKey && s.baseUrl && s.model);
  }

  /** Génération d'images utilisable ? */
  function imageConfigured() {
    const s = settings();
    const imageKey = String(((config && config.ai) || {}).imageApiKey || "").trim();
    return Boolean(imageKey && s.baseUrl);
  }

  /** Informations affichables (sans révéler la clé). */
  function info() {
    const s = settings();
    return {
      configured: configured(),
      imageConfigured: imageConfigured(),
      provider: s.providerLabel,
      model: s.model || "",
      baseUrl: s.baseUrl || "",
      keyHint: s.apiKey ? `${s.apiKey.slice(0, 3)}…${s.apiKey.slice(-2)}` : ""
    };
  }

  /** Message honnête quand rien n'est branché. */
  function unavailableMessage() {
    return notConfigured(
      "Le service IA",
      "Ajoute AI_PROVIDER et AI_API_KEY dans l'environnement (voir .env.example), puis redémarre."
    );
  }

  /**
   * Appel bas niveau « chat completions ».
   *
   * @param {object} params
   * @param {Array<{role: string, content: string}>} params.messages
   * @param {string} [params.system]
   * @param {number} [params.temperature]
   * @param {number} [params.maxTokens]
   * @param {number} [params.timeoutMs]
   */
  async function chat(params = {}) {
    if (!configured()) return unavailableMessage();
    const s = settings();

    const messages = [];
    if (params.system) messages.push({ role: "system", content: String(params.system).slice(0, 1200) });
    for (const message of Array.isArray(params.messages) ? params.messages : []) {
      const role = ["system", "user", "assistant"].includes(message && message.role) ? message.role : "user";
      const content = String((message && message.content) || "").slice(0, MAX_PROMPT_CHARS);
      if (content) messages.push({ role, content });
    }
    if (!messages.length) return fail("error", "Aucune question à transmettre.");

    const body = JSON.stringify({
      model: s.model,
      messages,
      temperature: Math.min(2, Math.max(0, Number(params.temperature) ?? 0.7)),
      max_tokens: Math.max(64, Math.min(4000, Number(params.maxTokens) || s.maxTokens))
    });

    const res = await fetchJson(`${s.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${s.apiKey}`,
        ...s.extraHeaders
      },
      body,
      timeoutMs: params.timeoutMs || 45000
    });

    if (!res.ok) {
      if (res.kind === "not-configured") return res;
      if (res.status === 401 || res.status === 403) {
        logger.error(`IA : clé refusée (HTTP ${res.status}) pour le fournisseur ${s.providerLabel}.`, "ai");
        return fail("unavailable", "Clé IA refusée par le fournisseur. Vérifie la variable AI_API_KEY.");
      }
      if (res.status === 429) return fail("unavailable", "Quota IA atteint ou dépense limitée chez le fournisseur.");
      if (res.status === 404) return fail("unavailable", `Modèle IA introuvable (${s.model}). Vérifie AI_MODEL.`);
      return res;
    }

    const choice = (res.data && Array.isArray(res.data.choices) && res.data.choices[0]) || null;
    const content = String((choice && choice.message && choice.message.content) || "").trim();
    if (!content) return fail("error", "Le modèle n'a renvoyé aucun texte.");

    return success({
      text: cap(sanitize(content), MAX_OUTPUT_CHARS),
      model: (res.data && res.data.model) || s.model,
      provider: s.providerLabel,
      usage: (res.data && res.data.usage) || null,
      truncated: content.length > MAX_OUTPUT_CHARS
    });
  }

  function cap(text, max) {
    const body = String(text || "");
    if (body.length <= max) return body;
    return `${body.slice(0, max).trimEnd()}…`;
  }

  const SYSTEM_BASE =
    "Tu es IDREM TERESHKOVA, un assistant intégré à un bot Facebook Messenger francophone. " +
    "Réponds de façon claire, courte et utile, en français par défaut. " +
    "N'utilise pas de Markdown lourd (pas de tableaux, pas de blocs de code triples) : " +
    "le rendu Messenger est du texte brut. Tu peux utiliser quelques emojis avec modération. " +
    "Si tu ne sais pas, dis-le honnêtement.";

  /** Question libre (/ai, /ask). */
  async function ask(question, options = {}) {
    const text = String(question || "").trim();
    if (!text) return fail("error", "Pose une question après la commande.");
    if (text.length > MAX_PROMPT_CHARS) return fail("error", `Question trop longue (max ${MAX_PROMPT_CHARS} caractères).`);
    return chat({
      system: options.system || SYSTEM_BASE,
      messages: [{ role: "user", content: text }],
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens
    });
  }

  /** Résumé d'un texte (/summarize). */
  async function summarize(text, options = {}) {
    const body = String(text || "").trim();
    if (!body) return fail("error", "Aucun texte à résumer.");
    if (body.length < 40) return fail("error", "Texte trop court pour être résumé (minimum 40 caractères).");
    if (body.length > MAX_PROMPT_CHARS) return fail("error", `Texte trop long (max ${MAX_PROMPT_CHARS} caractères).`);

    const style = options.style === "puces" ? "sous forme de 5 puces courtes" : "en 3 à 5 phrases";
    return chat({
      system: `${SYSTEM_BASE} Tu es un expert en synthèse.`,
      messages: [{ role: "user", content: `Résume le texte suivant ${style}, sans ajouter d'information absente du texte :\n\n${body}` }],
      temperature: 0.3,
      maxTokens: options.maxTokens
    });
  }

  /** Explication pédagogique (/explain). */
  async function explain(topic, options = {}) {
    const subject = String(topic || "").trim();
    if (!subject) return fail("error", "Indique un sujet à expliquer.");
    const levels = { simple: "à un débutant complet", moyen: "à quelqu'un de curieux", expert: "à un spécialiste" };
    const level = levels[String(options.level || "moyen").toLowerCase()] || levels.moyen;

    return chat({
      system: `${SYSTEM_BASE} Tu es un excellent vulgarisateur.`,
      messages: [
        {
          role: "user",
          content: `Explique « ${subject} » ${level}. Structure : 1) définition, 2) pourquoi c'est utile, 3) exemple concret, 4) point de vigilance. Reste factuel.`
        }
      ],
      temperature: 0.5,
      maxTokens: options.maxTokens
    });
  }

  /** Aide au code (/code). */
  async function code(request, options = {}) {
    const task = String(request || "").trim();
    if (!task) return fail("error", "Décris ce que tu veux coder.");
    const language = String(options.language || "").trim();

    return chat({
      system: `${SYSTEM_BASE} Tu es un développeur senior. Fournis du code correct, commenté brièvement, et signale les limites. Le rendu est du texte brut : n'utilise PAS de triples backticks, indente simplement le code.`,
      messages: [
        {
          role: "user",
          content: `${language ? `Langage : ${language}.\n` : ""}Demande : ${task}\nDonne le code puis 2-3 lignes d'explication.`
        }
      ],
      temperature: 0.2,
      maxTokens: options.maxTokens || 900
    });
  }

  /**
   * Génération d'images (/image).
   * Nécessite IMAGE_API_KEY + un fournisseur compatible OpenAI Images.
   */
  async function generateImage(prompt, options = {}) {
    const text = String(prompt || "").trim();
    if (!text) return fail("error", "Décris l'image à générer.");
    if (text.length > 900) return fail("error", "Description trop longue (900 caractères maximum).");
    if (!imageConfigured()) {
      return notConfigured(
        "La génération d'images",
        "Ajoute IMAGE_API_KEY (et AI_BASE_URL si besoin) dans l'environnement pour l'activer."
      );
    }

    const s = settings();
    const imageKey = String(((config && config.ai) || {}).imageApiKey || "").trim();
    const sizes = ["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"];
    const size = sizes.includes(String(options.size)) ? options.size : "1024x1024";

    const res = await fetchJson(`${s.baseUrl}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${imageKey}`, ...s.extraHeaders },
      body: JSON.stringify({
        model: options.model || "gpt-image-1",
        prompt: text,
        n: 1,
        size,
        response_format: "url"
      }),
      timeoutMs: options.timeoutMs || 90000
    });

    if (!res.ok) return res;
    const item = (res.data && Array.isArray(res.data.data) && res.data.data[0]) || null;
    if (!item) return fail("error", "Le service d'images n'a renvoyé aucun résultat.");

    if (item.url) return success({ url: item.url, prompt: text, size, provider: s.providerLabel });
    if (item.b64_json) {
      return success({
        buffer: Buffer.from(String(item.b64_json), "base64"),
        contentType: "image/png",
        prompt: text,
        size,
        provider: s.providerLabel
      });
    }
    return fail("error", "Réponse image inexploitable.");
  }

  return {
    PROVIDERS,
    configured,
    imageConfigured,
    info,
    chat,
    ask,
    summarize,
    explain,
    code,
    generateImage,
    unavailableMessage,
    MAX_PROMPT_CHARS
  };
}

module.exports = { createAi, PROVIDERS };
