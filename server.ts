import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '16mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please check Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429') || msg.includes('quota');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithBackoff<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < maxRetries && isQuotaError(error)) {
        attempt += 1;
        await sleep(1200 * attempt);
        continue;
      }
      throw error;
    }
  }
}

async function generateWithFallbackChain(
  ai: GoogleGenAI,
  attempts: Array<{
    label: string;
    params: Parameters<GoogleGenAI['models']['generateContent']>[0];
  }>
) {
  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      return await runWithBackoff(
        () => ai.models.generateContent(attempt.params),
        i === 0 ? 1 : 0
      );
    } catch (error) {
      lastError = error;
      if (isQuotaError(error) && i < attempts.length - 1) {
        console.warn(`Quota limit on ${attempt.label}; falling back to ${attempts[i + 1].label}`);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function extractGroundingSources(response: any): Array<{ title: string; uri: string }> {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const sources: Array<{ title: string; uri: string }> = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (web?.uri && !seen.has(web.uri)) {
      seen.add(web.uri);
      sources.push({
        title: String(web.title || web.uri).slice(0, 140),
        uri: String(web.uri).slice(0, 500),
      });
    }
  }
  return sources.slice(0, 20);
}

function parseJsonFromModelText(raw: string): any {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(candidate);
}

function formatGeminiError(error: unknown): { status: number; message: string } {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API authorization failed. Please verify your API key in Settings > Secrets.',
    };
  }
  if (isQuotaError(error)) {
    return {
      status: 429,
      message:
        'Your Gemini API key has exceeded its free-tier quota. Please wait a minute and retry, or attach a billing-enabled API key in Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: msg || 'An unexpected error occurred while contacting Gemini.',
  };
}

// 1. Public browser config for Google Maps Platform (Maps JS SDK)
app.get('/api/config/maps', (_req, res) => {
  const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  res.json({ apiKey });
});

// 2. Search-grounded Itinerary Generator using gemini-4-hydrogen + googleSearch (with quota-resilient live model fallback)
app.post('/api/itinerary/generate', async (req, res) => {
  try {
    const {
      destination,
      startingPoint = '',
      places = [],
      daysCount = 3,
      pace = 'balanced',
      travelMode = 'WALKING',
      interests = '',
    } = req.body ?? {};

    if (!destination || typeof destination !== 'string' || !destination.trim()) {
      return res.status(400).json({ error: 'Please specify a destination city or region.' });
    }

    const cleanDestination = destination.trim();
    const cleanStartingPoint = typeof startingPoint === 'string' ? startingPoint.trim() : '';
    const clampedDays = Math.max(1, Math.min(30, Number(daysCount) || 3));
    const requestedPlaces = Array.isArray(places)
      ? places.map((p: unknown) => String(p).trim()).filter(Boolean).slice(0, 20)
      : [];

    const ai = getGeminiClient();

    const originRule = cleanStartingPoint
      ? `
CRITICAL GEOGRAPHY RULE:
- The traveler is DEPARTING FROM "${cleanStartingPoint}" and TRAVELING TO "${cleanDestination}".
- EVERY SINGLE day and EVERY SINGLE sightseeing stop MUST be located in "${cleanDestination}" (or immediate day-trip sights of "${cleanDestination}").
- NEVER include landmarks, attractions, or sightseeing stops located in the departure/starting city "${cleanStartingPoint}"!
- In the top-level "summary", briefly include one practical sentence on arriving in "${cleanDestination}" from "${cleanStartingPoint}" (e.g., typical airport/rail hub arrival), and devote 100% of the day-by-day stops strictly to exploring "${cleanDestination}".`
      : `
CRITICAL GEOGRAPHY RULE:
- EVERY SINGLE day and EVERY SINGLE sightseeing stop MUST be located in "${cleanDestination}".`;

    const stopsPerDayRule =
      clampedDays > 10
        ? 'so each day has 3 well-paced stops with concise 1-sentence descriptions to keep the multi-week plan crisp'
        : clampedDays > 6
          ? 'so each day has 3 to 4 well-paced stops with concise descriptions'
          : 'so each day has 4 to 5 well-paced stops';

    const prompt = `You are an expert travel cartographer and route planner.
Use Google Search to research up-to-date information about landmarks, neighborhoods, visiting hours, ticket booking requirements, and complementary nearby sights in "${cleanDestination}".
${originRule}

User trip brief:
- Destination (where the tourist is visiting): ${cleanDestination}
${cleanStartingPoint ? `- Starting point / Departing from (origin ONLY, do NOT plan sightseeing stops here): ${cleanStartingPoint}` : ''}
- Must-visit places in ${cleanDestination} requested by the tourist: ${requestedPlaces.length > 0 ? requestedPlaces.join('; ') : `Recommend the most iconic and rewarding landmarks plus hidden local gems in ${cleanDestination}`}
- Duration: ${clampedDays} day(s)
- Travel pace: ${pace}
- Primary travel mode within ${cleanDestination}: ${travelMode}
- Interests & notes: ${typeof interests === 'string' && interests.trim() ? interests.trim() : 'Architecture, history, scenic viewpoints, local food, culture'}

Requirements:
1. Group stops logically by neighborhood inside "${cleanDestination}" each day to minimize backtracking and create a geographically smooth route.
2. Include every requested must-visit place in "${cleanDestination}", plus smart nearby discoveries (cafes, viewpoints, museums, historic districts in "${cleanDestination}") ${stopsPerDayRule}. Generate exactly ${clampedDays} days in the "days" array.
3. Do NOT invent latitude/longitude coordinates or exact street addresses from memory—instead provide a crisp, unambiguous "searchQuery" anchored to "${cleanDestination}" for each stop (e.g., "Osaka Castle, Osaka, Japan") so Google Maps Platform Places API resolves its exact verified location in "${cleanDestination}".
4. Include realistic time slots, visit durations in minutes, current practical visiting tips, and estimated ticket/entry cost.
5. Respond ONLY with a valid JSON object inside a \`\`\`json code fence matching this exact schema:
{
  "title": "Concise editorial trip title focused on ${cleanDestination} (e.g. Three Days Across ${cleanDestination})",
  "destination": "${cleanDestination}",
  "summary": "2-3 sentence overview of the route logic in ${cleanDestination}${cleanStartingPoint ? `, including a brief practical arrival note from ${cleanStartingPoint}` : ''}.",
  "days": [
    {
      "dayNumber": 1,
      "title": "Neighborhood or Theme Title in ${cleanDestination}",
      "theme": "Short 4-8 word day theme",
      "stops": [
        {
          "name": "Landmark Official Name",
          "searchQuery": "Landmark Official Name, ${cleanDestination}",
          "timeSlot": "09:00",
          "durationMinutes": 90,
          "category": "Historic Landmark",
          "description": "2 engaging sentences explaining why it matters and what to look for.",
          "visitingTips": "Practical tip (tickets, best entry gate, hours).",
          "estimatedCost": "Free or approximate entry fee"
        }
      ]
    }
  ]
}`;

    const response = await generateWithFallbackChain(ai, [
      {
        label: 'gemini-4-hydrogen (search)',
        params: {
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        },
      },
      {
        label: 'gemini-3.1-flash-lite (search)',
        params: {
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        },
      },
      {
        label: 'gemini-3.1-flash-lite',
        params: {
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        },
      },
    ]);

    const rawText = response.text ?? '';
    const parsed = parseJsonFromModelText(rawText);
    const sources = extractGroundingSources(response);

    if (!parsed || !Array.isArray(parsed.days)) {
      return res.status(502).json({ error: 'The itinerary response could not be structured. Please try again.' });
    }

    const sanitizedDays = parsed.days.slice(0, clampedDays).map((day: any, idx: number) => ({
      dayNumber: idx + 1,
      title: String(day.title || `Day ${idx + 1}`).slice(0, 120),
      theme: String(day.theme || 'Exploration & Discovery').slice(0, 140),
      stops: Array.isArray(day.stops)
        ? day.stops.slice(0, 10).map((stop: any, sIdx: number) => {
            const rawName = String(stop.name || 'Unnamed Landmark').slice(0, 140);
            const rawQuery = String(stop.searchQuery || `${rawName}, ${cleanDestination}`).trim();
            const anchoredQuery = rawQuery.toLowerCase().includes(cleanDestination.split(',')[0].trim().toLowerCase())
              ? rawQuery
              : `${rawQuery}, ${cleanDestination}`;
            return {
              id: `stop-${idx + 1}-${sIdx + 1}-${Date.now()}`,
              name: rawName,
              searchQuery: anchoredQuery.slice(0, 200),
              timeSlot: String(stop.timeSlot || `${String(9 + sIdx * 2).padStart(2, '0')}:00`).slice(0, 20),
              durationMinutes: Math.max(15, Math.min(480, Number(stop.durationMinutes) || 60)),
              category: String(stop.category || 'Landmark').slice(0, 60),
              description: String(stop.description || '').slice(0, 600),
              visitingTips: String(stop.visitingTips || '').slice(0, 400),
              estimatedCost: String(stop.estimatedCost || 'Varies').slice(0, 80),
            };
          })
        : [],
    }));

    return res.json({
      title: String(parsed.title || `${clampedDays} Days in ${cleanDestination}`).slice(0, 160),
      destination: cleanDestination.slice(0, 120),
      ...(cleanStartingPoint ? { startingPoint: cleanStartingPoint.slice(0, 120) } : {}),
      summary: String(parsed.summary || '').slice(0, 1800),
      travelMode,
      pace,
      daysCount: sanitizedDays.length,
      days: sanitizedDays,
      sources,
    });
  } catch (error) {
    console.error('Error generating itinerary:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// 3. Search-grounded Live Landmark Fact Finder using gemini-4-hydrogen + googleSearch
app.post('/api/landmark/research', async (req, res) => {
  try {
    const { landmarkName, destination } = req.body ?? {};
    if (!landmarkName || typeof landmarkName !== 'string') {
      return res.status(400).json({ error: 'Landmark name is required.' });
    }

    const ai = getGeminiClient();
    const prompt = `Search the web for the most accurate, up-to-date visitor guide for "${landmarkName.trim()}"${destination ? ` in ${String(destination).trim()}` : ''}.
Return ONLY a JSON object inside a \`\`\`json code fence with:
{
  "overview": "2-3 concise sentences on historical & cultural significance.",
  "openingHours": "Current typical opening hours and closed days if any.",
  "ticketInfo": "Current ticket pricing and whether advance reservations are recommended.",
  "bestTime": "Best time of day to visit for light and fewer crowds.",
  "nearbyRecommendations": ["Nearby cafe, viewpoint, or hidden spot 1", "Nearby spot 2", "Nearby spot 3"]
}`;

    const response = await generateWithFallbackChain(ai, [
      {
        label: 'gemini-4-hydrogen (search)',
        params: {
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        },
      },
      {
        label: 'gemini-3.1-flash-lite (search)',
        params: {
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        },
      },
      {
        label: 'gemini-3.1-flash-lite',
        params: {
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        },
      },
    ]);

    const parsed = parseJsonFromModelText(response.text ?? '');
    const sources = extractGroundingSources(response);

    return res.json({
      overview: String(parsed.overview || ''),
      openingHours: String(parsed.openingHours || 'Check official website before visiting.'),
      ticketInfo: String(parsed.ticketInfo || 'Check official ticketing portal.'),
      bestTime: String(parsed.bestTime || 'Early morning or late afternoon.'),
      nearbyRecommendations: Array.isArray(parsed.nearbyRecommendations)
        ? parsed.nearbyRecommendations.slice(0, 4).map(String)
        : [],
      sources,
    });
  } catch (error) {
    console.error('Error researching landmark:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// 4. Landmark Photo Understanding using gemini-4-hydrogen (with quota-resilient live model fallback)
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { imageBase64, mimeType, question } = req.body ?? {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'An uploaded image is required for analysis.' });
    }

    const safeMime = typeof mimeType === 'string' && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    const ai = getGeminiClient();

    const textPrompt = `Analyze this travel photograph in detail as an art historian, architect, and travel guide.
${question ? `Specific traveler question: ${String(question).trim()}` : 'Identify the landmark or scene, architectural/cultural context, likely location, and practical visitor recommendations.'}
Return structured JSON matching the schema.`;

    const contents = {
      parts: [
        {
          inlineData: {
            mimeType: safeMime,
            data: imageBase64,
          },
        },
        { text: textPrompt },
      ],
    };

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        landmarkName: { type: Type.STRING, description: 'Identified landmark, monument, or scene title.' },
        city: { type: Type.STRING, description: 'City or region where this place is located.' },
        country: { type: Type.STRING, description: 'Country where this place is located.' },
        category: { type: Type.STRING, description: 'Category such as Historic Monument, Temple, Museum, Coastal Viewpoint.' },
        architecturalEra: { type: Type.STRING, description: 'Era, architectural style, or natural formation context.' },
        confidence: { type: Type.STRING, description: 'Identification confidence: High, Medium, or Visual Estimate.' },
        historicalContext: { type: Type.STRING, description: 'Rich 3-4 sentence explanation of what is visible in the photo and its story.' },
        visitingTips: { type: Type.STRING, description: 'Actionable visitor and photography advice.' },
        recommendedDurationMinutes: { type: Type.INTEGER, description: 'Suggested visit duration in minutes.' },
        mapsSearchQuery: { type: Type.STRING, description: 'Exact query string to look up this place in Google Maps.' },
        highlights: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '3 to 4 key visual or cultural details noticed in the photograph.',
        },
      },
      required: [
        'landmarkName',
        'city',
        'country',
        'category',
        'architecturalEra',
        'confidence',
        'historicalContext',
        'visitingTips',
        'recommendedDurationMinutes',
        'mapsSearchQuery',
        'highlights',
      ],
    };

    const response = await generateWithFallbackChain(ai, [
      {
        label: 'gemini-4-hydrogen (vision)',
        params: {
          model: 'gemini-4-hydrogen',
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        },
      },
      {
        label: 'gemini-3.1-flash-lite (vision)',
        params: {
          model: 'gemini-3.1-flash-lite',
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema,
          },
        },
      },
    ]);

    const parsed = JSON.parse((response.text ?? '{}').trim());
    return res.json(parsed);
  } catch (error) {
    console.error('Error analyzing image:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// 5. Text-to-Speech Audio Tour Guide & Dual-Host Travel Podcast using gemini-3.8-flash-tts
app.post('/api/tts', async (req, res) => {
  try {
    const { mode = 'guide', title = '', script = '', voiceName = 'Kore', stops = [] } = req.body ?? {};
    const ai = getGeminiClient();

    if (mode === 'podcast') {
      const stopSummaries = Array.isArray(stops)
        ? stops
            .slice(0, 6)
            .map((s: any, idx: number) => `${idx + 1}. ${s.name} (${s.timeSlot}): ${s.description || s.visitingTips || ''}`)
            .join(' ')
        : '';

      const claraIntro = `Clara: Welcome to your Wayfarer Atlas audio briefing for ${title || 'today'}. <breath> We have a thoughtful route lined up for you today.`;
      const mateoReply = `Mateo: That's right, |yeah| let's walk through the highlights so you know what to watch for at each stop. ${stopSummaries || script}`.slice(0, 1400);
      const claraClosing = `Clara: Take your time between stops, keep your live map handy for walking directions, and enjoy every turn of the journey.`;

      const fallbackNarratorText = `Welcome to your Wayfarer Atlas audio briefing for ${title || 'today'}. ${stopSummaries || script}`.slice(0, 1600);

      const response = await generateWithFallbackChain(ai, [
        {
          label: 'gemini-3.8-flash-tts (podcast)',
          params: {
            model: 'gemini-3.8-flash-tts',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: claraIntro,
                    speechMetadata: {
                      speaker: 'Clara',
                      style: 'Warm, refined cultural travel host',
                    },
                  },
                  {
                    text: mateoReply,
                    speechMetadata: {
                      speaker: 'Mateo',
                      style: 'Curious, enthusiastic local travel guide',
                    },
                  },
                  {
                    text: claraClosing,
                    speechMetadata: {
                      speaker: 'Clara',
                      style: 'Warm, reassuring closing tone',
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: 'Clara',
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                    },
                    {
                      speaker: 'Mateo',
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
                    },
                  ],
                },
              },
            },
          },
        },
        {
          label: 'gemini-3.8-flash-lite-tts (fallback narrator)',
          params: {
            model: 'gemini-3.8-flash-lite-tts',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: fallbackNarratorText,
                    speechMetadata: {
                      style: 'Warm, engaging travel narrator',
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
              },
            },
          },
        },
      ]);

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(502).json({ error: 'No audio data returned by Gemini TTS.' });
      }
      return res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    }

    const cleanScript = String(script || title || '').trim().slice(0, 1800);
    if (!cleanScript) {
      return res.status(400).json({ error: 'Text content is required for audio guide generation.' });
    }

    const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const selectedVoice = allowedVoices.includes(voiceName) ? voiceName : 'Kore';

    const ttsContents = [
      {
        role: 'user',
        parts: [
          {
            text: cleanScript,
            speechMetadata: {
              style: 'Clear, engaging cultural audio tour narrator with calm pacing',
            },
          },
        ],
      },
    ];
    const ttsConfig = {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: selectedVoice },
        },
      },
    };

    const response = await generateWithFallbackChain(ai, [
      {
        label: 'gemini-3.8-flash-tts',
        params: {
          model: 'gemini-3.8-flash-tts',
          contents: ttsContents,
          config: ttsConfig,
        },
      },
      {
        label: 'gemini-3.8-flash-lite-tts',
        params: {
          model: 'gemini-3.8-flash-lite-tts',
          contents: ttsContents,
          config: ttsConfig,
        },
      },
    ]);

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(502).json({ error: 'No audio data returned by Gemini TTS.' });
    }

    return res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
  } catch (error) {
    console.error('Error generating TTS audio:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Wayfarer Atlas server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
