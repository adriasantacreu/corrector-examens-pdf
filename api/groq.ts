export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.text();

  const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body,
  });

  const data = await groqResponse.text();
  return new Response(data, {
    status: groqResponse.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
