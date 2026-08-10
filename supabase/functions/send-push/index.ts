/**
 * send-push — Supabase Edge Function
 *
 * Called by Postgres (pg_net) when a high-signal row is inserted into
 * public.notifications. Posts a short Expo push to the user's device.
 *
 * Deploy:
 *   supabase functions deploy send-push
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TITLE_MAX = 60;
const BODY_MAX = 100;

type PushBody = {
  user_id?: string;
  token?: string | null;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function channelFromData(data: Record<string, unknown> | undefined): string {
  const explicit = data?.channelId;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const type = String(data?.type ?? '');
  if (type === 'message') return 'messages';
  return 'activity';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: PushBody;
  try {
    payload = (await req.json()) as PushBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const title = truncate(payload.title ?? '', TITLE_MAX);
  if (!title) {
    return new Response(JSON.stringify({ error: 'title required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = truncate(payload.body ?? '', BODY_MAX);
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const channelId = channelFromData(data);

  let token = (payload.token ?? '').trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!token && payload.user_id) {
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: row, error } = await admin
      .from('profiles')
      .select('push_token')
      .eq('id', payload.user_id)
      .maybeSingle();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    token = (row?.push_token ?? '').trim();
  }

  if (!token) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const partnerId =
    typeof data.partner_id === 'string' ? data.partner_id : null;
  const collapseId =
    channelId === 'messages' && partnerId
      ? `msg-${partnerId}`
      : typeof data.notification_type === 'string'
        ? String(data.notification_type)
        : undefined;

  const expoRes = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title,
      body,
      data,
      channelId,
      priority: channelId === 'messages' ? 'high' : 'default',
      ...(collapseId ? { collapseId } : {}),
    }),
  });

  const expoJson = (await expoRes.json().catch(() => ({}))) as {
    data?: { status?: string; details?: { error?: string } };
  };

  // Drop stale tokens so we stop retrying dead devices
  const ticket = expoJson?.data;
  const ticketError =
    ticket && typeof ticket === 'object' && !Array.isArray(ticket)
      ? ticket.details?.error
      : undefined;
  if (
    payload.user_id &&
    supabaseUrl &&
    serviceKey &&
    (ticketError === 'DeviceNotRegistered' ||
      ticketError === 'InvalidCredentials')
  ) {
    const admin = createClient(supabaseUrl, serviceKey);
    await admin
      .from('profiles')
      .update({ push_token: null })
      .eq('id', payload.user_id)
      .eq('push_token', token);
  }

  return new Response(
    JSON.stringify({ ok: expoRes.ok, expo: expoJson }),
    {
      status: expoRes.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
