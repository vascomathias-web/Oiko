const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;

async function getPortal(token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/portals?token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0] || null;
}

function buildSystemPrompt(d) {
  const apl = Number(d.apl || 0);
  const loyer = Number(d.loyer || 0);
  const versementNet = Math.max(0, loyer - apl);

  const paiementsText = (d.paiements || []).slice(0, 24).map(p => {
    const moisNoms = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const statut = p.statut === 'paye' ? '✅ Payé' : p.statut === 'retard' ? '❌ En retard' : '⏳ En attente';
    return `  - ${moisNoms[p.mois-1]} ${p.annee} : ${statut} (${p.montant}€)`;
  }).join('\n');

  const adresse = [d.adresse, d.complement_adresse, d.code_postal, d.ville].filter(Boolean).join(', ');

  return `Tu es l'assistant virtuel personnel de ${d.nom}, locataire du logement situé au ${adresse || 'adresse non renseignée'}.

Tu travailles pour le propriétaire et tu aides le locataire à comprendre sa situation locative.

=== INFORMATIONS DU BAIL ===
- Locataire : ${d.nom}
- Adresse : ${adresse || 'Non renseignée'}
- Date d'entrée : ${d.date_entree ? new Date(d.date_entree).toLocaleDateString('fr-FR') : 'Non renseignée'}
- Fin de bail : ${d.date_fin_bail ? new Date(d.date_fin_bail).toLocaleDateString('fr-FR') : 'Non renseignée'}
- Loyer mensuel : ${loyer}€
- APL / Aide CAF : ${apl > 0 ? apl + '€' : 'Aucune'}
- Versement net du locataire : ${versementNet}€
- Caution : ${d.caution_payee ? 'Payée ✅' : 'Non payée ❌'}
- Parking : ${d.parking ? 'Inclus' : 'Non inclus'}

=== HISTORIQUE PAIEMENTS (24 derniers mois) ===
${paiementsText || '  Aucun paiement enregistré'}

=== CONTACT PROPRIÉTAIRE ===
${d.landlord_email ? `Email : ${d.landlord_email}` : 'Contact non renseigné'}
${d.landlord_name ? `Nom : ${d.landlord_name}` : ''}

=== RÈGLES IMPORTANTES ===
- Réponds TOUJOURS en français
- Sois professionnel, bienveillant et concis (max 3-4 phrases)
- Tu NE PEUX PAS modifier les données, effectuer des paiements ou envoyer des emails
- Si le locataire a un problème urgent, invite-le à contacter son propriétaire directement
- Ne divulgue pas d'informations qui ne concernent pas ce locataire
- Si on te pose une question sans rapport avec la location, recentre poliment la conversation`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  if (!GEMINI_KEY) return res.status(500).json({ error: 'Clé Gemini non configurée' });

  const { token, message, history = [] } = req.body || {};
  if (!token || !message) return res.status(400).json({ error: 'Token et message requis' });

  const portal = await getPortal(token);
  if (!portal) return res.status(404).json({ error: 'Portail introuvable' });
  if (portal.expires_at && new Date(portal.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Lien expiré' });
  }

  const systemPrompt = buildSystemPrompt(portal.data || {});

  // Construire l'historique pour Gemini
  const contents = [
    ...history.slice(-10).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 512, temperature: 0.7 }
        })
      }
    );

    const geminiData = await geminiRes.json();
    const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) return res.status(500).json({ error: 'Pas de réponse de l\'IA' });

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur IA : ' + err.message });
  }
}
