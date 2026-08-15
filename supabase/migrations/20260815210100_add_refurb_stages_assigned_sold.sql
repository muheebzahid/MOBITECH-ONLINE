-- Add 'ASSIGNED' and 'SOLD' to refurb_stage enum type if they don't already exist
ALTER TYPE public.refurb_stage ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE public.refurb_stage ADD VALUE IF NOT EXISTS 'SOLD';
