-- Store Expo push token for mobile notifications (one token per user; last device wins).
alter table public.profiles
  add column if not exists push_token text;

comment on column public.profiles.push_token is
  'Expo push token (ExponentPushToken[...]) for the user''s current mobile device.';
